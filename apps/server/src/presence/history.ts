// Reads presence history back from the event log: the state to restore after a restart,
// and a player's recent sessions for "Your last sessions".
import type { Game, SessionSummary } from '@lan-os/shared';
import { appendEvent, listEvents } from '../db/events.ts';
import type { Db } from '../db/database.ts';
import type { RestoredPlayer, TrackerEvent } from './tracker.ts';

const gameFrom = (data: Record<string, unknown>): Game | null =>
  typeof data.game === 'string' ? { name: data.game, appId: typeof data.app_id === 'string' ? data.app_id : null } : null;

export function restorePresence(db: Db, lanId: string): RestoredPlayer[] {
  const players = new Map<string, RestoredPlayer>();
  const seenPresence = new Set<string>();
  for (const e of listEvents(db, lanId, ['game_session_started', 'game_session_ended', 'presence_changed'])) {
    if (!e.playerId) continue;
    const p = players.get(e.playerId) ?? {
      playerId: e.playerId, status: 'offline', statusSince: e.occurredAt, game: null, session: null, lastKnownGame: null,
    };
    const game = gameFrom(e.data);
    if (e.type === 'game_session_started' && game) {
      p.session = { game, startedAt: e.occurredAt };
      p.lastKnownGame = game;
    } else if (e.type === 'game_session_ended') {
      p.session = null;
      if (game) p.lastKnownGame = game;
    } else if (e.type === 'presence_changed') {
      const status = e.data.status;
      if (status === 'in_game' || status === 'desktop' || status === 'away' || status === 'offline') {
        if (status !== p.status || !seenPresence.has(e.playerId)) p.statusSince = e.occurredAt;
        p.status = status;
        seenPresence.add(e.playerId);
      }
      p.game = game ? (p.session?.game.name === game.name ? p.session.game : game) : null;
    }
    players.set(e.playerId, p);
  }
  return [...players.values()];
}

export function recentSessions(db: Db, lanId: string, playerId: string, now: Date, limit = 5): SessionSummary[] {
  const sessions: SessionSummary[] = [];
  let open: { game: string; startedAt: string } | null = null;
  for (const e of listEvents(db, lanId, ['game_session_started', 'game_session_ended'])) {
    if (e.playerId !== playerId || typeof e.data.game !== 'string') continue;
    if (e.type === 'game_session_started') open = { game: e.data.game, startedAt: e.occurredAt };
    else {
      sessions.push({
        game: e.data.game, startedAt: String(e.data.started_at ?? open?.startedAt ?? e.occurredAt),
        endedAt: e.occurredAt, seconds: Number(e.data.seconds ?? 0),
      });
      open = null;
    }
  }
  if (open) {
    sessions.push({ ...open, endedAt: null, seconds: Math.floor((now.getTime() - Date.parse(open.startedAt)) / 1000) });
  }
  return sessions.reverse().slice(0, limit);
}

/** Stores tracker events in the log, all or nothing. */
export function storeTrackerEvents(db: Db, lanId: string, events: TrackerEvent[]): void {
  if (!events.length) return;
  db.transaction(() => {
    for (const e of events) appendEvent(db, lanId, e.type, e.playerId, e.data, new Date(e.at));
  })();
}
