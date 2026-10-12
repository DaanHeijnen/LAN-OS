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
