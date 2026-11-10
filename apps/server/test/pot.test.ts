import { describe, expect, it } from 'vitest';
import { potEntrySchema } from '@lan-os/shared';
import type { ConfigStore } from '../src/config/store.ts';
import { openDatabase } from '../src/db/database.ts';
import { upsertLan } from '../src/db/events.ts';
import { GamePot } from '../src/tournament/pot.ts';
import { Tournament } from '../src/tournament/tournament.ts';

const event = { name: 'LAN', lan_id: 'lan-2026', starts_at: '2026-11-19 19:00', ends_at: '2026-11-22 15:00', timezone: 'Europe/Amsterdam' };
const PLAYERS = ['mara', 'sam', 'tom', 'lisa'];

function setup(overrides: Record<string, unknown> = {}) {
  const config = {
    placement_points: [10, 8, 6, 5], bingo_card_size: 3, bingo_time_limit: '60m',
    bingo_square_points: 1, bingo_line_points: 3, bingo_full_card_points: 10, result_on_wall: '45s',
    planned_lineup_name: 'Game Gauntlet',
    planned_lineup: [
      { name: 'AssaultCube', kind: 'solo' }, { name: 'Bash Fighter', kind: 'solo' },
      { name: 'SuperTuxKart', kind: 'solo' }, { name: 'Freeflier', kind: 'solo' },
    ],
    pot_games_per_player: 1, pot_needs_approval: true, pot_draw_count: 2, pot_draw_positions: [4, 6],
    ...overrides,
  };
  const db = openDatabase(':memory:');
  upsertLan(db, event);
  const store = { get: () => config } as unknown as ConfigStore;
  const announced: string[] = [];
  let blocked: string | null = null;
  const common = { db, store, lanId: () => 'lan-2026', playerIds: () => PLAYERS, nickname: (id: string) => id[0]!.toUpperCase() + id.slice(1),
    onChange: () => {}, now: () => new Date('2026-11-20T17:00:00Z'), random: () => 0 };
  const tournament = new Tournament({ ...common, announce: () => {} });
  const pot = new GamePot({ ...common, tournament, submissionsBlocked: () => blocked, announce: text => announced.push(text) });
  const idOf = (name: string) => pot.info({ playerId: null, admin: true, hideNames: false }).entries.find(e => e.name === name)!.id;
  return { db, tournament, pot, announced, idOf, block: (reason: string | null) => { blocked = reason; } };
}

const lineup = (t: Tournament) => t.info()!.games.map(g => g.name);

describe('planned lineup', () => {
  it('sets up the Game Gauntlet in one go', () => {
    const { tournament } = setup();
    tournament.createPlanned();
    expect(tournament.info()!.name).toBe('Game Gauntlet');
    expect(lineup(tournament)).toEqual(['AssaultCube', 'Bash Fighter', 'SuperTuxKart', 'Freeflier']);
    expect(() => tournament.createPlanned()).toThrow(/already set up/);
  });
});

describe('game pot', () => {
  it('lets each player add one game, with no duplicates', () => {
    const { pot, idOf } = setup();
    pot.add('mara', { name: 'Rocket League', link: 'https://store.steampowered.com/app/252950' });
    expect(() => pot.add('mara', { name: 'Krunker' })).toThrow(/already have a game/);
    expect(() => pot.add('sam', { name: 'rocket league' })).toThrow(/already in the pot \(from Mara\)/);
    // A rejected game no longer counts, so its player can add another.
    pot.review(idOf('Rocket League'), 'reject', 'Not free');
    pot.add('mara', { name: 'Krunker' });
    const forSam = pot.info({ playerId: 'sam', admin: false, hideNames: false });
    expect(forSam.entries.map(e => e.name)).toEqual(['Krunker']);
    const forMara = pot.info({ playerId: 'mara', admin: false, hideNames: false });
    expect(forMara.entries.map(e => [e.name, e.state, e.note])).toEqual([['Rocket League', 'rejected', 'Not free'], ['Krunker', 'waiting', null]]);
  });

  it('refuses games while closed, turned off or paused by the host', () => {
    const { pot, block } = setup();
    pot.setOpen(false);
    expect(() => pot.add('mara', { name: 'Krunker' })).toThrow(/closed/);
    pot.setOpen(true);
    block('The host has paused new submissions.');
    expect(() => pot.add('mara', { name: 'Krunker' })).toThrow(/paused/);
    const off = setup({ pot_games_per_player: 0 });
    expect(() => off.pot.add('mara', { name: 'Krunker' })).toThrow(/turned off/);
    expect(off.pot.info({ playerId: null, admin: false, hideNames: false }).enabled).toBe(false);
  });

  it('only lets the owner or an admin remove a game', () => {
    const { pot, idOf } = setup();
    pot.add('mara', { name: 'Krunker' });
    expect(() => pot.remove(idOf('Krunker'), { playerId: 'sam', isAdmin: false })).toThrow(/only remove your own/);
    pot.remove(idOf('Krunker'), { playerId: 'mara', isAdmin: false });
    expect(pot.info({ playerId: null, admin: true, hideNames: false }).entries).toEqual([]);
  });

  it('draws approved games into the lineup at the planned places and announces them', () => {
    const { tournament, pot, announced, idOf } = setup();
    pot.add('mara', { name: 'Krunker' });
    pot.add('sam', { name: 'Golf It' });
    pot.add('tom', { name: 'Gartic Phone' });
    expect(pot.info({ playerId: null, admin: true, hideNames: false }).drawBlocked).toMatch(/Set up the tournament/);
    tournament.createPlanned();
    expect(pot.info({ playerId: null, admin: true, hideNames: false }).drawBlocked).toMatch(/Approve at least one/);
    pot.review(idOf('Krunker'), 'approve');
    pot.review(idOf('Golf It'), 'approve');
    pot.review(idOf('Gartic Phone'), 'approve');

    // random() = 0 shuffles [Krunker, Golf It, Gartic Phone] into [Golf It, Gartic Phone, Krunker].
    const drawn = pot.draw();
    expect(drawn).toEqual([{ name: 'Golf It', addedBy: 'Sam' }, { name: 'Gartic Phone', addedBy: 'Tom' }]);
    expect(lineup(tournament)).toEqual(['AssaultCube', 'Bash Fighter', 'SuperTuxKart', 'Golf It', 'Freeflier', 'Gartic Phone']);
    expect(announced.at(-1)).toBe("From the game pot: Wildcard 1: Golf It (Sam's pick) · Wildcard 2: Gartic Phone (Tom's pick)");

    const info = pot.info({ playerId: null, admin: true, hideNames: false });
    expect(info.open).toBe(false);
    expect(info.drawBlocked).toMatch(/already been drawn/);
    const golf = info.entries.find(e => e.name === 'Golf It')!;
    expect(golf).toMatchObject({ state: 'drawn', drawOrder: 1 });
    expect(golf.tournamentGameId).toBe(tournament.info()!.games[3]!.id);
    expect(() => pot.remove(golf.id, { playerId: null, isAdmin: true })).toThrow(/in the lineup/);
  });

  it('puts drawn games at the end when no places are set, and draws fewer when the pot is small', () => {
    const { tournament, pot } = setup({ pot_needs_approval: false, pot_draw_positions: [] });
    tournament.createPlanned();
    pot.add('lisa', { name: 'Krunker' });
    expect(pot.draw()).toHaveLength(1);
    expect(lineup(tournament).at(-1)).toBe('Krunker');
  });

  it('hides who added a game on the wall while details are hidden', () => {
    const { pot } = setup();
    pot.add('mara', { name: 'Krunker' });
    expect(pot.info({ playerId: null, admin: false, hideNames: true }).entries[0]).toMatchObject({ playerId: null, addedBy: 'A player' });
  });

  it('only accepts web links', () => {
    expect(potEntrySchema.safeParse({ name: 'Krunker', link: 'javascript:alert(1)' }).success).toBe(false);
    expect(potEntrySchema.safeParse({ name: 'Krunker', link: 'https://krunker.io' }).success).toBe(true);
    expect(potEntrySchema.safeParse({ name: 'Krunker', link: '' }).success).toBe(true);
  });
});
