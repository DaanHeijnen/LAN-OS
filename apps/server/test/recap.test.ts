import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { appendEvent, upsertLan } from '../src/db/events.ts';
import { buildRecap, lanSummaries } from '../src/history/recap.ts';

const event = { name: "LAN Weekend '26", lan_id: 'lan-2026', starts_at: '2026-11-19 19:00', ends_at: '2026-11-22 15:00', timezone: 'Europe/Amsterdam' };
const names: Record<string, string> = { mara: 'Mara', sam: 'Sam', nick: 'Nick' };
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 20, h, m));

function weekend() {
  const db = openDatabase(':memory:');
  upsertLan(db, event);
  const session = (player: string, game: string, from: Date, to: Date) => {
    appendEvent(db, 'lan-2026', 'game_session_started', player, { game }, from);
    appendEvent(db, 'lan-2026', 'game_session_ended', player, { game, seconds: (to.getTime() - from.getTime()) / 1000 }, to);
  };
  session('sam', 'Valheim', at(10), at(16, 40));          // 6h 40m
  session('nick', 'Valheim', at(12), at(14));             // 2h with Sam
  session('mara', 'Factorio', at(0), at(3));              // Night owl (01:00–04:00 Amsterdam)
  session('mara', 'Valheim', at(13), at(14));             // 3 together at 13:00
  session('nick', 'Rocket League', at(18), at(19));
  session('nick', 'Portal 2', at(19), at(20));
  for (const [i, who] of ['nick', 'nick', 'nick', 'mara'].entries()) {
    appendEvent(db, 'lan-2026', 'song_requested', who, { title: `Song ${i}`, artist: 'Toto' }, at(20, i));
    appendEvent(db, 'lan-2026', 'song_played', who, { title: i < 2 ? 'Africa' : `Song ${i}`, artist: 'Toto' }, at(20, 10 + i));
  }
  return db;
}

describe('LAN Wrapped', () => {
  it('adds up the weekend', () => {
    const r = buildRecap(weekend(), { lanId: 'lan-2026', nickname: id => names[id] ?? id, now: at(23) })!;
    expect(r.totals).toMatchObject({ hours: 14.7, sessions: 6, uniqueGames: 4, songs: 4, players: 3 });
    expect(r.topGames[0]).toEqual({ name: 'Valheim', hours: 9.7, players: 3 });
    expect(r.longestSessions[0]).toMatchObject({ player: 'Sam', game: 'Valheim', seconds: 24000 });
    expect(r.biggestGroups[0]!.game).toBe('Valheim');
    expect([...r.biggestGroups[0]!.players].sort()).toEqual(['Mara', 'Nick', 'Sam']);
    expect(r.mostVaried).toEqual({ player: 'Nick', games: 3 });
    expect(r.music.topSongs[0]).toEqual({ title: 'Africa', artist: 'Toto', count: 2 });
    expect(r.music.perPlayer[0]).toEqual({ player: 'Nick', count: 3 });
  });

  it('gives every award to a different person', () => {
    const r = buildRecap(weekend(), { lanId: 'lan-2026', nickname: id => names[id] ?? id, now: at(23) })!;
    const titles = Object.fromEntries(r.awards.map(a => [a.title, a.player]));
    expect(titles['The Marathoner']).toBe('Sam');
    expect(titles['The Night Owl']).toBe('Mara');
    expect(titles['The Explorer']).toBe('Nick');
    expect(new Set(r.awards.map(a => a.player)).size).toBe(r.awards.length);
  });

  it('can recap one night only', () => {
    const r = buildRecap(weekend(), { lanId: 'lan-2026', nickname: id => names[id] ?? id, range: { from: at(0), to: at(6), label: 'Night' }, now: at(23) })!;
    expect(r.totals).toMatchObject({ hours: 3, sessions: 1 });
    expect(r.hourly[1]).toBe(1);
  });

  it('lists every LAN for the archive', () => {
    expect(lanSummaries(weekend(), id => id, () => false)).toMatchObject([{ id: 'lan-2026', topGame: 'Valheim', songs: 4 }]);
  });
});
