// Decides when the wall says something. Collects candidate moments from real activity,
// waits at least announcements.yaml → min_gap between them, aims for about average_gap,
// merges what happened meanwhile and shows only the most important one.
import { durationToSeconds, type PlayerCard } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import { log } from '../logging.ts';
import type { AiWriter } from './ai.ts';
import { factLine, humourLine, nightLine, type Trigger } from './lines.ts';

/** How long a candidate stays relevant before it is dropped. */
const CANDIDATE_TTL_MS = 10 * 60_000;
const PRIORITY: Record<Trigger['kind'], number> = { poll_closed: 5, activity_soon: 4, long_session: 3, rare_combo: 2, all_same_game: 6 };
/** Shown this long on the wall. */
export const SHOW_MS = { major: 25_000, minor: 40_000 } as const;

interface Candidate { key: string; trigger: Trigger; at: number }

export interface AnnouncerOptions {
  store: ConfigStore;
  ai: () => AiWriter | null;
  show: (text: string, kind: 'major' | 'minor', ms: number, trigger: string) => void;
  now?: () => number;
  random?: () => number;
}

export class Announcer {
  private readonly o: AnnouncerOptions;
  private readonly now: () => number;
  private readonly random: () => number;
  private candidates: Candidate[] = [];
  /** Keys already announced, so the same moment is never announced twice. */
  private used = new Set<string>();
  private lastShown = 0;
  private busy = false;

  constructor(options: AnnouncerOptions) {
    this.o = options;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.lastShown = this.now();
  }

  /** Something happened; it may be announced at the next good moment. */
  offer(key: string, trigger: Trigger): void {
    if (this.used.has(key)) return;
    // Still true: keep it fresh (e.g. a long session that's still going).
    const waiting = this.candidates.find(c => c.key === key);
    if (waiting) {
      waiting.trigger = trigger;
      waiting.at = this.now();
      return;
    }
    const config = this.o.store.get('announcements');
    const enabled = { long_session: config.trigger_long_session, poll_closed: config.trigger_poll_closed,
      all_same_game: config.trigger_all_same_game, rare_combo: config.trigger_rare_combo, activity_soon: true }[trigger.kind];
    if (enabled) this.candidates.push({ key, trigger, at: this.now() });
  }

  /** Looks at the room and offers candidates. Called with every presence update. */
  observe(players: PlayerCard[], now: Date): void {
    const config = this.o.store.get('announcements');
    const longAfter = durationToSeconds(config.long_session_after);
    for (const p of players) {
      if (!p.sessionStartedAt || !p.game || p.status === 'hidden' || p.hiddenFromWall) continue;
      const seconds = (now.getTime() - Date.parse(p.sessionStartedAt)) / 1000;
      if (seconds >= longAfter) {
        const step = Math.floor(seconds / longAfter);
        this.offer(`long:${p.id}:${p.sessionStartedAt}:${step}`, { kind: 'long_session', player: p.nickname, game: p.game.name, seconds });
      }
    }
    const visible = players.filter(p => !p.hiddenFromWall && p.status !== 'hidden');
    const online = visible.filter(p => p.status !== 'offline' && p.status !== 'unknown');
    const hour = Math.floor(now.getTime() / 3_600_000);
    const desktop = online.filter(p => p.status === 'desktop');
    const away = online.filter(p => p.status === 'away');
    if (online.length >= 3 && desktop.length === online.length) {
      this.offer(`combo:desktop:${hour}`, { kind: 'rare_combo', combo: 'all_desktop', players: desktop.map(p => p.nickname) });
    } else if (away.length >= 3) {
      this.offer(`combo:away:${hour}`, { kind: 'rare_combo', combo: 'many_away', players: away.map(p => p.nickname) });
    } else if (online.length >= 4 && !online.some(p => p.status === 'in_game')) {
      this.offer(`combo:nobody:${hour}`, { kind: 'rare_combo', combo: 'nobody_gaming', players: [] });
    }
  }

  /** Called every minute: maybe announce the most important waiting moment. */
  async tick(nightMode: boolean): Promise<void> {
    if (this.busy) return;
    const now = this.now();
    this.candidates = this.candidates.filter(c => now - c.at < CANDIDATE_TTL_MS);
    if (!this.candidates.length) return;
    const config = this.o.store.get('announcements');
    const minGap = durationToSeconds(config.min_gap) * 1000;
    const averageGap = Math.max(minGap + 1, durationToSeconds(config.average_gap) * 1000);
    const since = now - this.lastShown;
    if (since < minGap) return;
    // Between min_gap and average_gap the chance grows, so announcements land about every average_gap.
    const chance = (since - minGap) / (averageGap - minGap);
    const urgent = this.candidates.some(c => c.trigger.kind === 'poll_closed' || c.trigger.kind === 'activity_soon');
    if (!urgent && this.random() > chance) return;

    const best = [...this.candidates].sort((a, b) => PRIORITY[b.trigger.kind] - PRIORITY[a.trigger.kind] || b.at - a.at)[0]!;
    // Everything that happened meanwhile is merged into this one announcement.
    for (const c of this.candidates) this.used.add(c.key);
    this.candidates = [];
    this.lastShown = now;
    this.busy = true;
    try {
      const text = await this.word(best.trigger, nightMode);
      const kind = best.trigger.kind === 'poll_closed' || best.trigger.kind === 'long_session' ? 'major' : 'minor';
      this.o.show(text, kind, SHOW_MS[kind], best.trigger.kind);
    } finally {
      this.busy = false;
    }
  }

  /** Shown straight away (used for "everyone is in the same game"). */
  async announceNow(key: string, trigger: Trigger, nightMode: boolean): Promise<void> {
    if (this.used.has(key)) return;
    this.used.add(key);
    this.lastShown = this.now();
    this.o.show(await this.word(trigger, nightMode), 'major', SHOW_MS.major, trigger.kind);
  }

  private async word(trigger: Trigger, nightMode: boolean): Promise<string> {
    const config = this.o.store.get('announcements');
    const seed = Math.floor(this.random() * 1000);
    const template = nightMode ? nightLine(trigger, seed, config.night_mode_lines) : config.humour ? humourLine(trigger, seed) : factLine(trigger);
    const ai = this.o.ai();
    if (!ai) return template;
    const rewritten = await ai.rewrite(template, nightMode ? 'night' : config.humour ? 'funny' : 'factual');
    if (!rewritten) log.info('AI wording unavailable; using the template line.');
    return rewritten ?? template;
  }
}
