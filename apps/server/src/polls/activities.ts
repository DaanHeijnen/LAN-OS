// Activities: a game together, a food break, something IRL. Players answer Join / Maybe / Skip
// with an ETA. An activity starts at its time or when the organizer presses Start.
import { durationToSeconds, type ActivityInfo } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent } from '../db/events.ts';

/** Ended activities stay visible this long. */
const SHOW_ENDED_MS = 15 * 60_000;

interface ActivityRow {
  id: number; created_by: string; title: string; kind: ActivityInfo['kind']; starts_at: string; min_players: number; max_players: number;
  created_at: string; started_at: string | null; ended_at: string | null; cancelled_at: string | null;
}
interface RsvpRow { player_id: string; answer: 'join' | 'maybe' | 'skip'; eta_minutes: number | null }

export class ActivityError extends Error {}

export interface ActivitiesOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  nickname: (id: string) => string;
  submissionsBlocked: () => string | null;
  onChange: () => void;
  now?: () => Date;
}

export class Activities {
  private readonly o: ActivitiesOptions;
  private readonly now: () => Date;

  constructor(options: ActivitiesOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
  }

  private row(id: number): ActivityRow {
    const row = this.o.db.prepare('SELECT * FROM activities WHERE id = ? AND lan_id = ?').get(id, this.o.lanId()) as ActivityRow | undefined;
    if (!row) throw new ActivityError('That activity no longer exists.');
    return row;
  }

  private rsvps(id: number): RsvpRow[] {
    return this.o.db.prepare('SELECT player_id, answer, eta_minutes FROM activity_rsvps WHERE activity_id = ? ORDER BY answered_at').all(id) as RsvpRow[];
  }

  private log(row: ActivityRow, action: string, extra: Record<string, unknown> = {}): void {
    const participants = this.rsvps(row.id).filter(r => r.answer === 'join').map(r => r.player_id);
    appendEvent(this.o.db, this.o.lanId(), 'activity', row.created_by,
      { action, activity_id: row.id, title: row.title, kind: row.kind, participants, ...extra }, this.now());
  }

  create(playerId: string, input: { title: string; kind: ActivityInfo['kind']; startsInMinutes: number; minPlayers: number | null; maxPlayers: number | null }): number {
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new ActivityError(blocked);
    const config = this.o.store.get('activities');
    if (!config.types.includes(input.kind)) throw new ActivityError('That kind of activity is switched off in activities.yaml.');
    const min = input.minPlayers ?? config.default_min_players;
    const max = input.maxPlayers ?? config.default_max_players;
    if (max < min) throw new ActivityError('The maximum number of players must be at least the minimum.');
    const now = this.now();
    const result = this.o.db.prepare(`INSERT INTO activities (lan_id, created_by, title, kind, starts_at, min_players, max_players, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(this.o.lanId(), playerId, input.title.trim(), input.kind,
      new Date(now.getTime() + input.startsInMinutes * 60_000).toISOString(), min, max, now.toISOString());
    const id = Number(result.lastInsertRowid);
    this.o.db.prepare(`INSERT INTO activity_rsvps (activity_id, player_id, answer, eta_minutes, answered_at) VALUES (?, ?, 'join', NULL, ?)`)
      .run(id, playerId, now.toISOString());
    this.log(this.row(id), 'proposed');
    this.o.onChange();
    return id;
  }

  rsvp(playerId: string, id: number, answer: 'join' | 'maybe' | 'skip', etaMinutes: number | null): void {
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new ActivityError(blocked);
    const row = this.row(id);
    if (row.ended_at || row.cancelled_at) throw new ActivityError('This activity is over.');
    const others = this.rsvps(id).filter(r => r.answer === 'join' && r.player_id !== playerId).length;
    if (answer === 'join' && others >= row.max_players) throw new ActivityError(`This activity is full (${row.max_players} players).`);
    this.o.db.prepare(`INSERT INTO activity_rsvps (activity_id, player_id, answer, eta_minutes, answered_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (activity_id, player_id) DO UPDATE SET answer = excluded.answer, eta_minutes = excluded.eta_minutes, answered_at = excluded.answered_at`)
      .run(id, playerId, answer, answer === 'skip' ? null : etaMinutes, this.now().toISOString());
    this.o.onChange();
  }

  act(id: number, action: 'start' | 'end' | 'cancel', by: { playerId: string | null; isAdmin: boolean }): void {
    const row = this.row(id);
    if (!by.isAdmin && by.playerId !== row.created_by) throw new ActivityError('Only the organizer or an admin can do that.');
    const now = this.now().toISOString();
    if (action === 'start') {
      if (row.started_at) throw new ActivityError('It has already started.');
      this.o.db.prepare('UPDATE activities SET started_at = ? WHERE id = ?').run(now, id);
      this.log(row, 'started');
    } else if (action === 'end') {
      if (row.ended_at || row.cancelled_at) throw new ActivityError('It is already over.');
      const started = row.started_at ?? now;
      this.o.db.prepare('UPDATE activities SET started_at = ?, ended_at = ? WHERE id = ?').run(started, now, id);
      this.log(row, 'ended', { minutes: Math.round((Date.parse(now) - Date.parse(started)) / 60_000) });
    } else {
      if (row.ended_at || row.cancelled_at) throw new ActivityError('It is already over.');
      this.o.db.prepare('UPDATE activities SET cancelled_at = ? WHERE id = ?').run(now, id);
      this.log(row, 'cancelled');
    }
    this.o.onChange();
  }

  /** Starts activities at their time and ends them after activities.yaml → auto_end_after. */
  tick(): void {
    const now = this.now();
    const autoEnd = durationToSeconds(this.o.store.get('activities').auto_end_after) * 1000;
    const rows = this.o.db.prepare('SELECT * FROM activities WHERE lan_id = ? AND ended_at IS NULL AND cancelled_at IS NULL')
      .all(this.o.lanId()) as ActivityRow[];
    let changed = false;
    for (const row of rows) {
      if (!row.started_at && Date.parse(row.starts_at) <= now.getTime()) {
        this.o.db.prepare('UPDATE activities SET started_at = ? WHERE id = ?').run(row.starts_at, row.id);
        this.log(row, 'started');
        changed = true;
      } else if (row.started_at && now.getTime() - Date.parse(row.started_at) >= autoEnd) {
        this.o.db.prepare('UPDATE activities SET ended_at = ? WHERE id = ?').run(now.toISOString(), row.id);
        this.log(row, 'ended', { minutes: Math.round(autoEnd / 60_000), automatic: true });
        changed = true;
      }
    }
    if (changed) this.o.onChange();
  }

  list(viewer: string | null): ActivityInfo[] {
    const since = new Date(this.now().getTime() - SHOW_ENDED_MS).toISOString();
    const rows = this.o.db.prepare(`SELECT * FROM activities WHERE lan_id = ? AND
      ((ended_at IS NULL AND cancelled_at IS NULL) OR ended_at >= ? OR cancelled_at >= ?) ORDER BY starts_at`)
      .all(this.o.lanId(), since, since) as ActivityRow[];
    return rows.map(row => {
      const rsvps = this.rsvps(row.id);
      return {
        id: row.id, title: row.title, kind: row.kind,
        status: row.cancelled_at ? 'cancelled' : row.ended_at ? 'ended' : row.started_at ? 'live' : 'upcoming',
        startsAt: row.starts_at, startedAt: row.started_at, endedAt: row.ended_at,
        minPlayers: row.min_players, maxPlayers: row.max_players,
        organizer: this.o.nickname(row.created_by), organizerId: row.created_by,
        rsvps: rsvps.map(r => ({ playerId: r.player_id, nickname: this.o.nickname(r.player_id), answer: r.answer, etaMinutes: r.eta_minutes })),
        joined: rsvps.filter(r => r.answer === 'join').length,
        myAnswer: rsvps.find(r => r.player_id === viewer)?.answer ?? null,
      };
    });
  }
}
