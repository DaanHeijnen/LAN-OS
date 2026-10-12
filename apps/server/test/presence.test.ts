import { describe, expect, it } from 'vitest';
import { buildSteamLink, derivePresence, formatDuration, isJoinable, type SteamSummary } from '@lan-os/shared';
import { PresenceTracker, sessionSeconds } from '../src/presence/tracker.ts';

const ID = '76561198000000001';
const summary = (fields: Partial<SteamSummary> = {}): SteamSummary => ({ steamid: ID, personastate: 1, ...fields });
const valheim = { gameid: '892970', gameextrainfo: 'Valheim' };

describe('presence derivation', () => {
  const derive = (s: SteamSummary | undefined, extra: { steamReachable?: boolean; manualGame?: string | null } = {}) =>
    derivePresence({ summary: s, steamReachable: extra.steamReachable ?? true, manualGame: extra.manualGame ?? null });

  it('online with a game is In game', () => {
    expect(derive(summary(valheim))).toEqual({ status: 'in_game', game: { name: 'Valheim', appId: '892970' } });
  });
  it('online without a game is Desktop', () => {
    expect(derive(summary())).toEqual({ status: 'desktop', game: null });
  });
  it('busy and looking-to-play count as online', () => {
    expect(derive(summary({ personastate: 2 })).status).toBe('desktop');
    expect(derive(summary({ personastate: 6, ...valheim })).status).toBe('in_game');
  });
  it('Away and Snooze stay away but keep the game', () => {
    expect(derive(summary({ personastate: 3, ...valheim }))).toEqual({ status: 'away', game: { name: 'Valheim', appId: '892970' } });
    expect(derive(summary({ personastate: 4 })).status).toBe('away');
  });
  it('offline, or not returned by Steam, is Offline', () => {
    expect(derive(summary({ personastate: 0, ...valheim }))).toEqual({ status: 'offline', game: null });
    expect(derive(undefined).status).toBe('offline');
  });
  it('an unreachable Steam is Unknown', () => {
    expect(derive(summary(valheim), { steamReachable: false }).status).toBe('unknown');
  });
  it('a manual game override wins while online', () => {
    expect(derive(summary(), { manualGame: 'Minecraft' })).toEqual({ status: 'in_game', game: { name: 'Minecraft', appId: null } });
    expect(derive(summary({ personastate: 0 }), { manualGame: 'Minecraft' }).status).toBe('offline');
  });
});

describe('session tracking', () => {
  const t0 = new Date('2026-11-21T00:33:00Z');
  const later = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
  const inGame = (name: string, appId: string) => ({ status: 'in_game' as const, game: { name, appId } });

  it('measures from the moment LAN OS first sees the game', () => {
    const tracker = new PresenceTracker();
    const events = tracker.update('mara', inGame('Deep Rock Galactic', '548430'), null, t0);
    expect(events.map(e => e.type)).toEqual(['game_session_started', 'presence_changed']);
    tracker.update('mara', inGame('Deep Rock Galactic', '548430'), null, later(134));
    const session = tracker.get('mara')!.session!;
    expect(formatDuration(sessionSeconds(session, later(134)))).toBe('2h 14m');
  });

  it('keeps one session going while away in the same game', () => {
    const tracker = new PresenceTracker();
    tracker.update('alex', inGame('Rocket League', '252950'), null, t0);
    const events = tracker.update('alex', { status: 'away', game: { name: 'Rocket League', appId: '252950' } }, null, later(30));
    expect(events.map(e => e.type)).toEqual(['presence_changed']);
    expect(tracker.get('alex')!.session!.startedAt).toBe(t0.toISOString());
  });

  it('ends the session with its length when the game changes', () => {
    const tracker = new PresenceTracker();
    tracker.update('sam', inGame('Valheim', '892970'), null, t0);
    const events = tracker.update('sam', inGame('Factorio', '427520'), null, later(90));
    expect(events[0]).toMatchObject({ type: 'game_session_ended', data: { game: 'Valheim', seconds: 5400 } });
    expect(events[1]).toMatchObject({ type: 'game_session_started', data: { game: 'Factorio' } });
  });

  it('remembers the last game when going offline', () => {
    const tracker = new PresenceTracker();
    tracker.update('tom', inGame('Counter-Strike 2', '730'), null, t0);
    const events = tracker.update('tom', { status: 'offline', game: null }, null, later(60));
    expect(events.map(e => e.type)).toEqual(['game_session_ended', 'presence_changed']);
    expect(tracker.get('tom')).toMatchObject({ status: 'offline', lastKnownGame: { name: 'Counter-Strike 2' }, statusSince: later(60).toISOString() });
  });

  it('keeps sessions and the last update time while Steam is unreachable', () => {
    const tracker = new PresenceTracker();
    tracker.update('joris', inGame('Valheim', '892970'), null, t0);
    expect(tracker.update('joris', { status: 'unknown', game: null }, null, later(5))).toEqual([]);
    expect(tracker.get('joris')).toMatchObject({ status: 'unknown', updatedAt: t0.toISOString(), session: { startedAt: t0.toISOString() } });
    expect(tracker.update('joris', inGame('Valheim', '892970'), null, later(10)).map(e => e.type)).toEqual(['presence_changed']);
    expect(tracker.get('joris')!.session!.startedAt).toBe(t0.toISOString());
  });

  it('continues a session that was running before a restart', () => {
    const tracker = new PresenceTracker();
    const valheimGame = { name: 'Valheim', appId: '892970' };
    tracker.restore([{ playerId: 'sam', status: 'in_game', statusSince: t0.toISOString(), game: valheimGame,
      session: { game: valheimGame, startedAt: t0.toISOString() }, lastKnownGame: valheimGame }]);
    expect(tracker.update('sam', inGame('Valheim', '892970'), null, later(400))).toEqual([]);
    expect(formatDuration(sessionSeconds(tracker.get('sam')!.session!, later(400)))).toBe('6h 40m');
  });
});

describe('joinable links', () => {
  it('links to the lobby when Steam exposes one', () => {
    const link = buildSteamLink({ steamid: ID, gameid: '892970', lobbysteamid: '109775241000000001' });
    expect(link).toEqual({ kind: 'join_lobby', url: `steam://joinlobby/892970/109775241000000001/${ID}` });
    expect(isJoinable(link)).toBe(true);
  });
  it('links to the server when Steam exposes one', () => {
    expect(buildSteamLink({ steamid: ID, gameid: '730', gameserverip: '192.168.1.20:27015' }))
      .toEqual({ kind: 'join_server', url: 'steam://connect/192.168.1.20:27015' });
  });
  it('falls back to the Steam profile otherwise', () => {
    const fallback = { kind: 'profile', url: `steam://url/SteamIDPage/${ID}` };
    expect(buildSteamLink({ steamid: ID, gameid: '730', gameserverip: '0.0.0.0:0' })).toEqual(fallback);
    expect(buildSteamLink({ steamid: ID, gameid: '730', lobbysteamid: '0' })).toEqual(fallback);
    expect(buildSteamLink({ steamid: ID, lobbysteamid: '109775241000000001' })).toEqual(fallback);
    expect(buildSteamLink({ steamid: ID })).toEqual(fallback);
    expect(isJoinable(buildSteamLink({ steamid: ID }))).toBe(false);
  });
});
