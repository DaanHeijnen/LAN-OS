// Keeps each player's live state and measures game sessions from the moment LAN OS
// first sees a game. Returns the history events to store; it never touches the database itself.
import type { DerivedPresence, Game, PresenceStatus, SteamLink } from '@lan-os/shared';

export interface PlayerLiveState {
  status: Exclude<PresenceStatus, 'hidden'>;
  /** When the current status began (desktop "12m", offline "3h ago"). */
  statusSince: string;
  game: Game | null;
  session: { game: Game; startedAt: string } | null;
  /** Shown for offline players: "Last: Counter-Strike 2". */
  lastKnownGame: Game | null;
  link: SteamLink | null;
  /** Last time Steam answered for this player. Shown with "Unknown" when Steam is down. */
  updatedAt: string | null;
}

export interface TrackerEvent {
  type: 'game_session_started' | 'game_session_ended' | 'presence_changed';
  playerId: string;
  at: string;
  data: Record<string, unknown>;
}

export interface OpenSession {
  playerId: string;
  game: Game;
  startedAt: string;
}

const sameGame = (a: Game | null, b: Game | null) =>
  a === b || (!!a && !!b && a.name === b.name && a.appId === b.appId);

export const sessionSeconds = (session: { startedAt: string }, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(session.startedAt)) / 1000));

export class PresenceTracker {
  private states = new Map<string, PlayerLiveState>();

  /** After a restart: continue sessions that were still running according to the event log. */
  restore(open: OpenSession[], now: Date): void {
    for (const s of open) {
      this.states.set(s.playerId, {
        status: 'unknown', statusSince: now.toISOString(), game: s.game, session: { game: s.game, startedAt: s.startedAt },
        lastKnownGame: s.game, link: null, updatedAt: null,
      });
    }
  }

  get(playerId: string): PlayerLiveState | undefined {
    return this.states.get(playerId);
  }

  all(): ReadonlyMap<string, PlayerLiveState> {
    return this.states;
  }

  forget(playerId: string): void {
    this.states.delete(playerId);
  }

  update(playerId: string, next: DerivedPresence, link: SteamLink | null, now: Date): TrackerEvent[] {
    const at = now.toISOString();
    const prev = this.states.get(playerId);
    const events: TrackerEvent[] = [];

    // Steam unreachable: keep the last known state and running sessions untouched.
    if (next.status === 'unknown') {
      if (prev) this.states.set(playerId, { ...prev, status: 'unknown' });
      else this.states.set(playerId, {
        status: 'unknown', statusSince: at, game: null, session: null, lastKnownGame: null, link: null, updatedAt: null,
      });
      return events;
    }

    let session = prev?.session ?? null;
    if (session && !sameGame(session.game, next.game)) {
      events.push({
        type: 'game_session_ended', playerId, at,
        data: { game: session.game.name, app_id: session.game.appId, started_at: session.startedAt, seconds: sessionSeconds(session, now) },
      });
      session = null;
    }
    if (!session && next.game) {
      session = { game: next.game, startedAt: at };
      events.push({ type: 'game_session_started', playerId, at, data: { game: next.game.name, app_id: next.game.appId } });
    }

    // A status coming back from "unknown" isn't a real change, so it keeps its original start time.
    const prevKnownStatus = prev?.status === 'unknown' ? null : prev?.status;
    const statusChanged = prevKnownStatus !== next.status;
    if (statusChanged || !sameGame(prev?.game ?? null, next.game)) {
      events.push({ type: 'presence_changed', playerId, at, data: { status: next.status, game: next.game?.name ?? null } });
    }

    this.states.set(playerId, {
      status: next.status,
      statusSince: statusChanged && prev?.status !== 'unknown' ? at : (prev?.statusSince ?? at),
      game: next.game,
      session,
      lastKnownGame: next.game ?? prev?.lastKnownGame ?? null,
      link,
      updatedAt: at,
    });
    return events;
  }
}
