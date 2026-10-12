import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src/db/database.ts';
import { appendEvent, listEvents, removeEvent, upsertLan } from '../src/db/events.ts';

const event2026 = { name: "LAN Weekend '26", lan_id: 'lan-2026', starts_at: '2026-11-19 19:00', ends_at: '2026-11-22 15:00', timezone: 'Europe/Amsterdam' };

describe('database', () => {
  it('applies migrations once', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toEqual([]);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();
    expect(tables).toEqual(expect.arrayContaining(['events', 'lans', 'player_profiles', 'join_links', 'sessions', 'player_pins', 'runtime_state']));
  });

  it('stores LAN dates in UTC from the configured timezone', () => {
    const db = openDatabase(':memory:');
    upsertLan(db, event2026);
    expect(db.prepare('SELECT starts_at, ends_at FROM lans').get()).toEqual({
      starts_at: '2026-11-19T18:00:00.000Z',
      ends_at: '2026-11-22T14:00:00.000Z',
    });
  });

  it('keeps events per LAN and never changes them', () => {
    const db = openDatabase(':memory:');
    upsertLan(db, event2026);
    upsertLan(db, { ...event2026, lan_id: 'lan-2027', starts_at: '2027-11-18 19:00', ends_at: '2027-11-21 15:00' });
    const id = appendEvent(db, 'lan-2026', 'game_session_started', 'mara', { game: 'Valheim' });
    appendEvent(db, 'lan-2027', 'game_session_started', 'mara', { game: 'Factorio' });

    expect(listEvents(db, 'lan-2026').map(e => e.data)).toEqual([{ game: 'Valheim' }]);
    expect(() => db.prepare('UPDATE events SET player_id = ? WHERE id = ?').run('sam', id)).toThrow(/append-only/);
    expect(() => appendEvent(db, 'lan-2026', 'made_up' as never, null)).toThrow();

    expect(removeEvent(db, id)).toBe(true);
    expect(listEvents(db, 'lan-2026')).toEqual([]);
    expect(listEvents(db, 'lan-2027')).toHaveLength(1);
  });
});

describe('presence history', () => {
  it('restores the last status, open sessions and the last game played', async () => {
    const { restorePresence, recentSessions } = await import('../src/presence/history.ts');
    const db = openDatabase(':memory:');
    upsertLan(db, event2026);
    const at = (h: number) => new Date(Date.UTC(2026, 10, 20, h));
    appendEvent(db, 'lan-2026', 'game_session_started', 'tom', { game: 'Counter-Strike 2', app_id: '730' }, at(10));
    appendEvent(db, 'lan-2026', 'presence_changed', 'tom', { status: 'in_game', game: 'Counter-Strike 2', app_id: '730' }, at(10));
    appendEvent(db, 'lan-2026', 'game_session_ended', 'tom', { game: 'Counter-Strike 2', app_id: '730', seconds: 7200 }, at(12));
    appendEvent(db, 'lan-2026', 'presence_changed', 'tom', { status: 'offline', game: null }, at(12));
    appendEvent(db, 'lan-2026', 'game_session_started', 'sam', { game: 'Valheim', app_id: '892970' }, at(11));
    appendEvent(db, 'lan-2026', 'presence_changed', 'sam', { status: 'in_game', game: 'Valheim', app_id: '892970' }, at(11));

    const restored = Object.fromEntries(restorePresence(db, 'lan-2026').map(p => [p.playerId, p]));
    expect(restored.tom).toMatchObject({ status: 'offline', statusSince: at(12).toISOString(), session: null, lastKnownGame: { name: 'Counter-Strike 2' } });
    expect(restored.sam).toMatchObject({ status: 'in_game', session: { startedAt: at(11).toISOString() }, game: { name: 'Valheim', appId: '892970' } });

    expect(recentSessions(db, 'lan-2026', 'tom', at(13))).toEqual([
      { game: 'Counter-Strike 2', startedAt: at(10).toISOString(), endedAt: at(12).toISOString(), seconds: 7200 },
    ]);
    expect(recentSessions(db, 'lan-2026', 'sam', at(13))[0]).toMatchObject({ game: 'Valheim', endedAt: null, seconds: 7200 });
  });
});
