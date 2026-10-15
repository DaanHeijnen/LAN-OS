import { describe, expect, it } from 'vitest';
import { bingoLines, bingoScore, placesFromGroups, rankByScore } from '@lan-os/shared';
import type { ConfigStore } from '../src/config/store.ts';
import { openDatabase } from '../src/db/database.ts';
import { upsertLan } from '../src/db/events.ts';
import { buildRecap } from '../src/history/recap.ts';
import { Tournament } from '../src/tournament/tournament.ts';

const event = { name: 'LAN', lan_id: 'lan-2026', starts_at: '2026-11-19 19:00', ends_at: '2026-11-22 15:00', timezone: 'Europe/Amsterdam' };
const tournamentConfig = {
  placement_points: [10, 8, 6, 5], bingo_card_size: 3, bingo_time_limit: '60m',
  bingo_square_points: 1, bingo_line_points: 3, bingo_full_card_points: 10, result_on_wall: '45s',
};
const PLAYERS = ['mara', 'sam', 'tom', 'lisa'];

function setup() {
  const db = openDatabase(':memory:');
  upsertLan(db, event);
  let now = new Date('2026-11-20T20:00:00Z');
  const announced: string[] = [];
  const store = { get: () => tournamentConfig } as unknown as ConfigStore;
  const t = new Tournament({
    db, store, lanId: () => 'lan-2026', playerIds: () => PLAYERS, nickname: id => id[0]!.toUpperCase() + id.slice(1),
    announce: text => announced.push(text), onChange: () => {}, now: () => now, random: () => 0,
  });
  const gameId = (name: string) => t.info()!.games.find(g => g.name === name)!.id;
  return { db, t, announced, gameId, advance: (minutes: number) => { now = new Date(now.getTime() + minutes * 60_000); } };
}

describe('tournament scoring rules', () => {
  it('lets a tie share the higher place and skips the places used', () => {
    expect(placesFromGroups([['a'], ['b', 'c'], ['d']]).map(p => [p.place, p.entries])).toEqual([[1, ['a']], [2, ['b', 'c']], [4, ['d']]]);
  });

  it('ranks by score, then by tie-breaker', () => {
    const ranked = rankByScore([{ id: 'a', score: 5 }, { id: 'b', score: 9 }, { id: 'c', score: 5 }, { id: 'd', score: 5, tieBreak: 1 }]);
    expect(ranked.map(r => [r.id, r.place])).toEqual([['b', 1], ['d', 2], ['a', 3], ['c', 3]]);
  });

  it('counts bingo squares, lines and a full card', () => {
    expect(bingoLines(3)).toHaveLength(8);
    const points = { square: 1, line: 3, full: 10 };
    expect(bingoScore(3, [0, 1, 2], points)).toEqual({ squares: 3, lines: 1, full: false, score: 6 });
    expect(bingoScore(3, [0, 4, 8, 2, 6], points)).toMatchObject({ lines: 2, score: 11 });
    expect(bingoScore(3, [0, 1, 2, 3, 4, 5, 6, 7, 8], points)).toEqual({ squares: 9, lines: 8, full: true, score: 9 + 24 + 10 });
  });
});

describe('tournament', () => {
  it('scores several rounds of a game and hands out points by placement', () => {
    const { t, announced, gameId } = setup();
    t.create('Friday Night Cup');
    t.addGame({ name: 'GeoGuessr', kind: 'solo' });
    expect(() => t.startGame(gameId('GeoGuessr'))).toThrow(/Start the tournament/);
    t.setState('live');
    t.startGame(gameId('GeoGuessr'));
    // Mara wins twice, Sam once; round 3 has a tie for second.
    t.recordRound(gameId('GeoGuessr'), [['mara'], ['sam'], ['tom']]);
    t.recordRound(gameId('GeoGuessr'), [['sam'], ['mara']]);
    t.recordRound(gameId('GeoGuessr'), [['mara'], ['tom', 'lisa'], ['sam']]);
    expect(() => t.recordRound(gameId('GeoGuessr'), [['mara'], ['mara']])).toThrow(/only finish once/);

    const live = t.info()!;
    expect(live.games[0]!.scores.map(s => [s.playerId, s.score])).toEqual([['mara', 28], ['sam', 23], ['tom', 14], ['lisa', 8]]);
    expect(live.games[0]!.rounds[2]!.placings[1]).toEqual({ place: 2, entries: [{ label: 'Tom', playerIds: ['tom'] }, { label: 'Lisa', playerIds: ['lisa'] }] });
    expect(live.standings.find(s => s.playerId === 'mara')).toMatchObject({ points: 0, liveScore: 28 });

    t.finishGame(gameId('GeoGuessr'));
    const done = t.info()!;
    expect(done.standings.map(s => [s.playerId, s.points, s.place, s.lastGamePoints])).toEqual([
      ['mara', 10, 1, 10], ['sam', 8, 2, 8], ['tom', 6, 3, 6], ['lisa', 5, 4, 5],
    ]);
    expect(announced[0]).toBe('GeoGuessr is done. Mara +10 · Sam +8 · Tom +6 · Lisa +5');
  });

  it('gives every team member the team\'s place', () => {
    const { t, gameId } = setup();
    t.create('Cup');
    t.addGame({ name: 'CS2', kind: 'teams' });
    t.setState('live');
    expect(() => t.startGame(gameId('CS2'))).toThrow(/two teams/);
    expect(() => t.changeGame(gameId('CS2'), { teams: [{ name: 'A', playerIds: ['mara'] }, { name: 'B', playerIds: ['mara'] }] })).toThrow(/two teams/);
    t.changeGame(gameId('CS2'), { teams: [{ name: 'Red', playerIds: ['mara', 'sam'] }, { name: 'Blue', playerIds: ['tom', 'lisa'] }] });
    t.startGame(gameId('CS2'));
    t.recordRound(gameId('CS2'), [['1'], ['0']]);
    t.finishGame(gameId('CS2'));
    const standings = t.info()!.standings;
    expect(standings.filter(s => s.place === 1).map(s => s.playerId).sort()).toEqual(['lisa', 'tom']);
    expect(standings.find(s => s.playerId === 'mara')).toMatchObject({ place: 3, points: 6 });
  });

  it('deals bingo cards, locks them when time is up and ranks by card score', () => {
    const { t, gameId, advance } = setup();
    t.create('Cup');
    t.addGame({ name: 'Bingo', kind: 'bingo', bingo: { ideas: ['a', 'b', 'c'], minutes: 30, points: { square: 1, line: 3, full: 10 } } });
    t.setState('live');
    expect(() => t.startGame(gameId('Bingo'))).toThrow(/at least 9 ideas/);
    t.changeGame(gameId('Bingo'), { bingo: { ideas: 'abcdefghijkl'.split(''), minutes: 30, points: { square: 1, line: 3, full: 10 } } });
    t.startGame(gameId('Bingo'));

    const bingo = () => t.info()!.games[0]!.bingo!;
    expect(bingo().cards).toHaveLength(4);
    expect(bingo().cards[0]!.squares).toHaveLength(9);
    for (const square of [0, 1, 2]) t.tick('sam', square, true);
    t.tick('mara', 4, true);
    t.untick(gameId('Bingo'), 'mara', 4);
    expect(bingo().cards.find(c => c.playerId === 'sam')).toMatchObject({ ticked: [0, 1, 2], lines: 1, score: 6 });
    expect(bingo().recentTicks[0]).toMatchObject({ playerId: 'sam' });

    advance(31);
    expect(bingo().locked).toBe(true);
    expect(() => t.tick('tom', 0, true)).toThrow(/locked/);
    t.finishGame(gameId('Bingo'));
    expect(t.info()!.standings[0]).toMatchObject({ playerId: 'sam', points: 10 });
  });

  it('allows only one live game and a finish once nothing is live', () => {
    const { t, gameId } = setup();
    t.create('Cup');
    expect(() => t.create('Another')).toThrow(/already set up/);
    t.addGame({ name: 'One', kind: 'solo' });
    t.addGame({ name: 'Two', kind: 'solo' });
    t.changeGame(gameId('Two'), { move: 'up' });
    expect(t.info()!.games.map(g => g.name)).toEqual(['Two', 'One']);
    t.setState('live');
    t.startGame(gameId('One'));
    expect(() => t.startGame(gameId('Two'))).toThrow(/still live/);
    expect(() => t.setState('finished')).toThrow(/Finish One first/);
    expect(() => t.finishGame(gameId('One'))).toThrow(/at least one round/);
    t.recordRound(gameId('One'), [['tom']]);
    t.removeLastRound(gameId('One'));
    expect(t.info()!.games[1]!.rounds).toEqual([]);
    t.recordRound(gameId('One'), [['tom']]);
    t.finishGame(gameId('One'));
    t.setState('finished');
    expect(t.info()!.state).toBe('finished');
    t.setState('closed');
    expect(t.info()).toBeNull();
  });

  it('ends up in LAN Wrapped with the final standings', () => {
    const { db, t, gameId } = setup();
    t.create('Cup');
    t.addGame({ name: 'One', kind: 'solo' });
    t.setState('live');
    t.startGame(gameId('One'));
    t.recordRound(gameId('One'), [['lisa'], ['tom']]);
    t.finishGame(gameId('One'));
    t.setState('finished');
    const recap = buildRecap(db, { lanId: 'lan-2026', nickname: id => id });
    expect(recap!.tournaments[0]!.standings.slice(0, 2)).toEqual([{ player: 'lisa', place: 1, points: 10 }, { player: 'tom', place: 2, points: 8 }]);
    expect(recap!.timeline.some(e => e.text === 'Lisa won Cup')).toBe(true);
  });
});
