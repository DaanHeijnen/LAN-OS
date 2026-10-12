import { describe, expect, it } from 'vitest';
import type { PlayerCard } from '@lan-os/shared';
import { Announcer } from '../src/announce/announcer.ts';
import type { ConfigStore } from '../src/config/store.ts';

const config = {
  humour: true, min_gap: '15m', average_gap: '1h', trigger_long_session: true, long_session_after: '3h',
  trigger_poll_closed: true, trigger_all_same_game: true, trigger_rare_combo: true, night_mode_lines: ['Drink!'],
};
const store = { get: () => config } as unknown as ConfigStore;
const card = (over: Partial<PlayerCard>): PlayerCard => ({
  id: 'sam', nickname: 'Sam', tone: 0, avatarUrl: null, status: 'in_game', statusSince: '', game: { name: 'Valheim', appId: '1' },
  lastKnownGame: null, sessionStartedAt: null, looking: false, hiddenFromWall: false, steamLinked: true, link: null, updatedAt: null, ...over,
});

function setup() {
  let now = Date.parse('2026-11-20T20:00:00Z');
  const shown: Array<{ text: string; kind: string }> = [];
  const a = new Announcer({ store, ai: () => null, show: (text, kind) => shown.push({ text, kind }), now: () => now, random: () => 0 });
  return { a, shown, advance: (min: number) => { now += min * 60_000; }, date: () => new Date(now) };
}

describe('announcements', () => {
  it('announces a long session, but not before the minimum gap', async () => {
    const { a, shown, advance, date } = setup();
    const startedAt = new Date(date().getTime() - 4 * 3_600_000).toISOString();
    a.observe([card({ sessionStartedAt: startedAt })], date());
    await a.tick(false);
    expect(shown).toEqual([]);
    advance(16);
    // The server observes the room on every presence update.
    a.observe([card({ sessionStartedAt: startedAt })], date());
    await a.tick(false);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.text).toMatch(/Sam.*Valheim|Valheim.*Sam/);
  });

  it('never repeats the same moment and merges what happened meanwhile', async () => {
    const { a, shown, advance, date } = setup();
    advance(16);
    const startedAt = new Date(date().getTime() - 4 * 3_600_000).toISOString();
    a.observe([card({ sessionStartedAt: startedAt })], date());
    a.offer('poll:1', { kind: 'poll_closed', question: 'Pizza?', winner: 'Yes', votes: 5, tie: false });
    await a.tick(false);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.text).toContain('Yes');
    advance(20);
    a.observe([card({ sessionStartedAt: startedAt })], date());
    await a.tick(false);
    expect(shown).toHaveLength(1);
  });

  it('uses the drinking-game tone in night mode and plain facts with humour off', async () => {
    const { a, shown, advance } = setup();
    advance(16);
    a.offer('poll:2', { kind: 'poll_closed', question: 'Next game?', winner: 'Factorio', votes: 4, tie: false });
    await a.tick(true);
    expect(shown[0]!.text).toMatch(/drink/i);
    config.humour = false;
    advance(16);
    a.offer('poll:3', { kind: 'poll_closed', question: 'Food?', winner: 'Pizza', votes: 3, tie: false });
    await a.tick(false);
    expect(shown[1]!.text).toBe('"Food?": Pizza wins with 3 votes.');
    config.humour = true;
  });

  it('notices rare combinations', async () => {
    const { a, shown, advance, date } = setup();
    advance(16);
    a.observe(['Mara', 'Joris', 'Lisa'].map(n => card({ id: n, nickname: n, status: 'desktop', game: null })), date());
    await a.tick(false);
    expect(shown[0]!.text).toContain('Mara, Joris and Lisa');
  });
});
