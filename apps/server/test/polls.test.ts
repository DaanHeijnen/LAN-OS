import { describe, expect, it } from 'vitest';
import type { ConfigStore } from '../src/config/store.ts';
import { openDatabase } from '../src/db/database.ts';
import { upsertLan } from '../src/db/events.ts';
import { Polls } from '../src/polls/polls.ts';

const event = { name: 'LAN', lan_id: 'lan-2026', starts_at: '2026-11-19 19:00', ends_at: '2026-11-22 15:00', timezone: 'Europe/Amsterdam' };
const PLAYERS = ['mara', 'sam', 'tom', 'lisa'];

function setup(overrides: Record<string, unknown> = {}) {
  const voting = { default_poll_timer: '10m', change_vote_window: '1m', max_side_polls: 2, write_in_answers: true, max_poll_answers: 4, ...overrides };
  const db = openDatabase(':memory:');
  upsertLan(db, event);
  const store = { get: () => voting } as unknown as ConfigStore;
  let now = new Date('2026-11-20T17:00:00Z');
  const polls = new Polls({
    db, store, lanId: () => 'lan-2026', playerIds: () => PLAYERS, nickname: id => id,
    submissionsBlocked: () => null, onClosed: () => {}, onChange: () => {}, now: () => now,
  });
  const id = polls.create('mara', { question: 'Dinner?', mode: 'choice', options: ['Pizza', 'Sushi'], anonymous: false, minutes: null });
  const info = (viewer: string | null = null) => polls.list(viewer).find(p => p.id === id)!;
  return { polls, id, info, later: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe('typed-in poll answers', () => {
  it('adds a new choice and counts it as the player\'s vote', () => {
    const { polls, id, info } = setup();
    polls.writeIn('sam', id, '  Burgers ');
    expect(info().options).toEqual(['Pizza', 'Sushi', 'Burgers']);
    expect(info('sam').myVote).toBe(2);
    polls.vote('tom', id, 2);
    expect(info().counts).toEqual([0, 0, 2]);
  });

  it('matches an existing choice instead of adding a copy', () => {
    const { polls, id, info } = setup();
    polls.writeIn('sam', id, 'pizza');
    expect(info().options).toEqual(['Pizza', 'Sushi']);
    expect(info('sam').myVote).toBe(0);
  });

  it('stops at the most choices allowed', () => {
    const { polls, id, info } = setup();
    polls.writeIn('sam', id, 'Burgers');
    polls.writeIn('tom', id, 'Tacos');
    expect(info().writeIn).toBe(false);
    expect(() => polls.writeIn('lisa', id, 'Curry')).toThrow(/full/);
  });

  it('is refused when write-ins are off or for Yes / No / Maybe', () => {
    const { polls, id, info } = setup({ write_in_answers: false });
    expect(info().writeIn).toBe(false);
    expect(() => polls.writeIn('sam', id, 'Burgers')).toThrow(/typed answers/);
    const yn = polls.create('sam', { question: 'Break?', mode: 'yes_no_maybe', options: [], anonymous: false, minutes: null });
    expect(() => polls.writeIn('tom', yn, 'Later')).toThrow(/typed answers/);
  });

  it('does not add an answer once the vote is locked in', () => {
    const { polls, id, info, later } = setup();
    polls.vote('sam', id, 0);
    later(2 * 60_000);
    expect(() => polls.writeIn('sam', id, 'Burgers')).toThrow(/locked/);
    expect(info().options).toEqual(['Pizza', 'Sushi']);
  });
});
