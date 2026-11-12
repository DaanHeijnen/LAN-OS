// Daily side quests: each LAN day every player gets a few random quests from quests.yaml, the same ones
// all day. Players tick them off themselves; each finished quest becomes a moment on the projector.
import { lanClock, localDateTimeToDate, type QuestInfo } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';

export class QuestError extends Error {}

interface QuestRow { id: number; day: number; player_id: string; quest: string; done_at: string | null }

/** A small seeded random number generator, so a player's quests don't depend on when they first look. */
function seeded(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export interface QuestsOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  playerIds: () => string[];
  nickname: (id: string) => string;
  submissionsBlocked: () => string | null;
  /** A quest was ticked off, with the player's progress for the day. */
  onDone: (playerId: string, quest: string, progress: { done: number; total: number; day: number }) => void;
  onChange: () => void;
  now?: () => Date;
}

export class Quests {
  private readonly o: QuestsOptions;
  private readonly now: () => Date;

  constructor(options: QuestsOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
  }

  /** The current LAN day, or 0 when the LAN is not running. */
  day(): number {
    const event = this.o.store.get('event');
    const clock = lanClock({
      name: event.name, timezone: event.timezone,
      startsAt: localDateTimeToDate(event.starts_at, event.timezone).toISOString(),
      endsAt: localDateTimeToDate(event.ends_at, event.timezone).toISOString(),
    }, this.now());
    return clock.phase === 'live' ? clock.day : 0;
  }

  private rows(day: number, playerId?: string): QuestRow[] {
    return (playerId
      ? this.o.db.prepare('SELECT * FROM side_quests WHERE lan_id = ? AND day = ? AND player_id = ? ORDER BY id').all(this.o.lanId(), day, playerId)
      : this.o.db.prepare('SELECT * FROM side_quests WHERE lan_id = ? AND day = ? ORDER BY id').all(this.o.lanId(), day)) as QuestRow[];
  }

  /** Gives every player their quests for today, if they don't have them yet. */
  private assign(day: number): void {
    const config = this.o.store.get('quests');
    const have = new Set(this.rows(day).map(r => r.player_id));
    const insert = this.o.db.prepare('INSERT OR IGNORE INTO side_quests (lan_id, day, player_id, quest, assigned_at) VALUES (?, ?, ?, ?, ?)');
    const at = this.now().toISOString();
    for (const playerId of this.o.playerIds()) {
      if (have.has(playerId)) continue;
      const random = seeded(`${this.o.lanId()}:${day}:${playerId}`);
      const pool = [...new Set(config.quests)];
      // Shuffle (Fisher–Yates) and take the first few.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      for (const quest of pool.slice(0, config.per_day)) insert.run(this.o.lanId(), day, playerId, quest, at);
    }
  }

  setDone(playerId: string, questId: number, done: boolean): void {
    if (!this.o.store.get('quests').enabled) throw new QuestError('Side quests are switched off.');
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new QuestError(blocked);
    const row = this.o.db.prepare('SELECT * FROM side_quests WHERE id = ? AND lan_id = ?').get(questId, this.o.lanId()) as QuestRow | undefined;
    if (!row || row.player_id !== playerId) throw new QuestError('That quest is not one of yours.');
    if (row.day !== this.day()) throw new QuestError('That quest was for another day.');
    if (!!row.done_at === done) return;
    this.o.db.prepare('UPDATE side_quests SET done_at = ? WHERE id = ?').run(done ? this.now().toISOString() : null, questId);
    if (done) {
      const mine = this.rows(row.day, playerId);
      this.o.onDone(playerId, row.quest, { done: mine.filter(q => q.done_at).length, total: mine.length, day: row.day });
    }
    this.o.onChange();
  }

  info(viewer: string | null): QuestInfo {
    const enabled = this.o.store.get('quests').enabled;
    const day = enabled ? this.day() : 0;
    if (!day) return { enabled, day, mine: [], board: [] };
    this.assign(day);
    const rows = this.rows(day);
    const ids = new Set(this.o.playerIds());
    const board = [...ids].map(id => {
      const mine = rows.filter(r => r.player_id === id);
      return { player: this.o.nickname(id), playerId: id, done: mine.filter(r => r.done_at).length, total: mine.length };
    }).sort((a, b) => b.done - a.done || a.player.localeCompare(b.player));
    return {
      enabled, day, board,
      mine: viewer ? rows.filter(r => r.player_id === viewer).map(r => ({ id: r.id, text: r.quest, done: !!r.done_at })) : [],
    };
  }
}
