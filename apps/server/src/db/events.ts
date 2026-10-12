// The LAN row and the append-only event log. Every event is tagged with the current lan_id.
import { localDateTimeToDate, type EventConfig } from '@lan-os/shared';
import type { Db } from './database.ts';

export const EVENT_TYPES = [
  'game_session_started', 'game_session_ended', 'presence_changed',
  'song_requested', 'song_played', 'vote_cast', 'activity', 'announcement',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface StoredEvent {
  id: number;
  lanId: string;
  type: EventType;
  playerId: string | null;
  occurredAt: string;
  data: Record<string, unknown>;
}

/** Creates the row for this LAN, or updates its name and dates when event.yaml changed. */
export function upsertLan(db: Db, event: EventConfig, now = new Date()): void {
  db.prepare(`
    INSERT INTO lans (id, name, starts_at, ends_at, timezone, created_at)
    VALUES (@id, @name, @starts_at, @ends_at, @timezone, @now)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, timezone = excluded.timezone
  `).run({
    id: event.lan_id,
    name: event.name,
    starts_at: localDateTimeToDate(event.starts_at, event.timezone).toISOString(),
    ends_at: localDateTimeToDate(event.ends_at, event.timezone).toISOString(),
    timezone: event.timezone,
    now: now.toISOString(),
  });
}

export function appendEvent(db: Db, lanId: string, type: EventType, playerId: string | null,
  data: Record<string, unknown> = {}, at = new Date()): number {
  const result = db.prepare(
    'INSERT INTO events (lan_id, type, player_id, occurred_at, data) VALUES (?, ?, ?, ?, ?)',
  ).run(lanId, type, playerId, at.toISOString(), JSON.stringify(data));
  return Number(result.lastInsertRowid);
}

interface EventRow { id: number; lan_id: string; type: EventType; player_id: string | null; occurred_at: string; data: string }

const toEvent = (row: EventRow): StoredEvent => ({
  id: row.id, lanId: row.lan_id, type: row.type, playerId: row.player_id,
  occurredAt: row.occurred_at, data: JSON.parse(row.data) as Record<string, unknown>,
});

export function listEvents(db: Db, lanId: string, types: readonly EventType[] = EVENT_TYPES): StoredEvent[] {
  const rows = db.prepare(
    `SELECT * FROM events WHERE lan_id = ? AND type IN (${types.map(() => '?').join(', ')}) ORDER BY occurred_at, id`,
  ).all(lanId, ...types) as EventRow[];
  return rows.map(toEvent);
}

/** The only correction allowed on history: removing an incorrect event. */
export function removeEvent(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0;
}
