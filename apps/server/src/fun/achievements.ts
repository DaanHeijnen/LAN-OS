// Live achievements: LAN OS spots them by itself from Steam presence, LAN Radio, polls and side quests,
// and each new one gets a moment on the projector. Each player earns each achievement once per LAN,
// and only while the LAN is running.
import {
  ACHIEVEMENT_IDS, ACHIEVEMENTS, durationToSeconds,
  type AchievementId, type AchievementsInfo, type MomentInfo,
} from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { log } from '../logging.ts';

const RECENT = 10;

export interface LiveState { status: string; game: string | null; sessionStartedAt: string | null }

export interface AchievementsOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  playerIds: () => string[];
  nickname: (id: string) => string;
  /** True while the LAN is running (between starts_at and ends_at). */
  isLive: () => boolean;
  liveState: (playerId: string) => LiveState | undefined;
  onChange: () => void;
  now?: () => Date;
}

interface EarnedRow { player_id: string; achievement_id: AchievementId; earned_at: string; detail: string }

export class Achievements {
  private readonly o: AchievementsOptions;
  private readonly now: () => Date;

  constructor(options: AchievementsOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
  }

  private get config() {
    return this.o.store.get('achievements');
  }

  private hourNow(): number {
    const timezone = this.o.store.get('event').timezone;
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(this.now()));
  }

  /** Gives the achievement unless the player already has it. True when it is new. */
  award(playerId: string, id: AchievementId, detail: string): boolean {
    if (!this.config.enabled || !this.o.isLive() || !this.o.playerIds().includes(playerId)) return false;
    const result = this.o.db.prepare(`INSERT OR IGNORE INTO achievements (lan_id, player_id, achievement_id, earned_at, detail)
      VALUES (?, ?, ?, ?, ?)`).run(this.o.lanId(), playerId, id, this.now().toISOString(), detail);
    if (result.changes === 0) return false;
    log.info(`Achievement: ${this.o.nickname(playerId)} earned ${ACHIEVEMENTS[id].title} (${detail})`);
    this.o.onChange();
    return true;
  }

  /** What it takes, in words, with the numbers from achievements.yaml. */
  description(id: AchievementId): string {
    const c = this.config;
    switch (id) {
      case 'marathon': return `${c.marathon_hours} hours in the same game without a break`;
      case 'night_owl': return `Still in a game at ${c.night_owl_hour}:00 at night`;
      case 'early_bird': return `In a game between 6:00 and ${c.early_bird_hour}:00 in the morning`;
      case 'explorer': return `Play ${c.explorer_games} different games this LAN`;
      case 'full_house': return 'Everyone in the room in the same game at once';
      case 'opening_act': return 'Request the first song LAN Radio plays from a request';
      case 'crowd_pleaser': return `A song you requested gets ${c.crowd_pleaser_likes} thumbs up`;
      case 'voter': return `Vote in ${c.voter_polls} polls`;
      case 'quest_master': return 'Finish all your side quests of one day';
    }
  }

  /** Called every so often: checks everything that follows from presence, music and polls. */
  check(): void {
    if (!this.config.enabled || !this.o.isLive()) return;
    const c = this.config;
    const hour = this.hourNow();
    const lanId = this.o.lanId();
    for (const playerId of this.o.playerIds()) {
      const state = this.o.liveState(playerId);
      if (state?.status === 'in_game' && state.game) {
        const startedAt = state.sessionStartedAt ? Date.parse(state.sessionStartedAt) : NaN;
        const hours = (this.now().getTime() - startedAt) / 3_600_000;
        if (hours >= c.marathon_hours) this.award(playerId, 'marathon', `${Math.floor(hours)}h of ${state.game} in one go`);
        if (hour >= c.night_owl_hour && hour < 6) this.award(playerId, 'night_owl', `In ${state.game} at ${hour}:00`);
        if (hour >= 6 && hour < c.early_bird_hour) this.award(playerId, 'early_bird', `In ${state.game} at ${hour}:00`);
      }
      const games = this.o.db.prepare(`SELECT COUNT(DISTINCT json_extract(data, '$.game')) FROM events
        WHERE lan_id = ? AND type = 'game_session_started' AND player_id = ?`).pluck().get(lanId, playerId) as number;
      if (games >= c.explorer_games) this.award(playerId, 'explorer', `${games} different games played`);
      const polls = this.o.db.prepare(`SELECT COUNT(DISTINCT json_extract(data, '$.poll_id')) FROM events
        WHERE lan_id = ? AND type = 'vote_cast' AND player_id = ?`).pluck().get(lanId, playerId) as number;
      if (polls >= c.voter_polls) this.award(playerId, 'voter', `Voted in ${polls} polls`);
    }
    const first = this.o.db.prepare(`SELECT player_id, data FROM events WHERE lan_id = ? AND type = 'song_played' AND player_id IS NOT NULL
      ORDER BY occurred_at, id LIMIT 1`).get(lanId) as { player_id: string; data: string } | undefined;
    if (first) this.award(first.player_id, 'opening_act', `Kicked off LAN Radio with ${String((JSON.parse(first.data) as { title?: string }).title ?? 'a song')}`);
  }

  /** Everyone in the room is in the same game. */
  fullHouse(game: string): void {
    for (const playerId of this.o.playerIds()) this.award(playerId, 'full_house', `Everyone in ${game}`);
  }

  /** A song got a thumbs up. */
  thumbsUp(requesterId: string | null, title: string, ups: number): void {
    if (requesterId && ups >= this.config.crowd_pleaser_likes) this.award(requesterId, 'crowd_pleaser', `${ups} 👍 for ${title}`);
  }

  /** A side quest was ticked off. */
  questDone(playerId: string, progress: { done: number; total: number; day: number }): void {
    if (progress.total > 0 && progress.done >= progress.total) this.award(playerId, 'quest_master', `All ${progress.total} side quests of day ${progress.day}`);
  }

  /** New achievements and finished side quests, newest first. */
  private moments(): MomentInfo[] {
    const lanId = this.o.lanId();
    const earned = this.config.enabled ? this.o.db.prepare(`SELECT player_id, achievement_id, earned_at, detail FROM achievements
      WHERE lan_id = ? ORDER BY earned_at DESC LIMIT ?`).all(lanId, RECENT) as EarnedRow[] : [];
    const quests = this.o.db.prepare(`SELECT id, player_id, quest, done_at FROM side_quests WHERE lan_id = ? AND done_at IS NOT NULL
      ORDER BY done_at DESC LIMIT ?`).all(lanId, RECENT) as Array<{ id: number; player_id: string; quest: string; done_at: string }>;
    return [
      ...earned.map(e => ({
        key: `a:${e.player_id}:${e.achievement_id}`, kind: 'achievement' as const, player: this.o.nickname(e.player_id), playerId: e.player_id,
        title: ACHIEVEMENTS[e.achievement_id]?.title ?? e.achievement_id, emoji: ACHIEVEMENTS[e.achievement_id]?.emoji ?? '🏅', detail: e.detail, at: e.earned_at,
      })),
      ...quests.map(q => ({
        key: `q:${q.id}`, kind: 'quest' as const, player: this.o.nickname(q.player_id), playerId: q.player_id,
        title: 'Side quest done', emoji: '✅', detail: q.quest, at: q.done_at,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT);
  }

  /**
   * For the screens. On the wall, players hidden from it get no moments, and with "hide public" on there are none.
   */
  info(viewer: string | null, wall: { forWall: boolean; hidden: (id: string) => boolean; hidePublic: boolean }): AchievementsInfo {
    const enabled = this.config.enabled;
    const lanId = this.o.lanId();
    let recent = this.moments();
    if (wall.forWall) recent = wall.hidePublic ? [] : recent.filter(m => !wall.hidden(m.playerId));
    const counts = this.o.db.prepare('SELECT player_id, COUNT(*) AS n FROM achievements WHERE lan_id = ? GROUP BY player_id')
      .all(lanId) as Array<{ player_id: string; n: number }>;
    const mine = viewer && enabled
      ? new Map((this.o.db.prepare('SELECT * FROM achievements WHERE lan_id = ? AND player_id = ?').all(lanId, viewer) as EarnedRow[]).map(r => [r.achievement_id, r]))
      : null;
    return {
      enabled,
      wallSeconds: durationToSeconds(this.config.wall_time),
      recent,
      mine: mine ? ACHIEVEMENT_IDS.map(id => ({
        id, ...ACHIEVEMENTS[id], description: this.description(id), earnedAt: mine.get(id)?.earned_at ?? null, detail: mine.get(id)?.detail ?? null,
      })) : [],
      board: enabled ? counts.filter(c => this.o.playerIds().includes(c.player_id))
        .map(c => ({ player: this.o.nickname(c.player_id), playerId: c.player_id, count: c.n })).sort((a, b) => b.count - a.count) : [],
    };
  }
}
