import { describe, expect, it } from 'vitest';
import type { ConfigStore } from '../src/config/store.ts';
import { openDatabase } from '../src/db/database.ts';
import { appendEvent, upsertLan } from '../src/db/events.ts';
import { Achievements, type LiveState } from '../src/fun/achievements.ts';
import { Quests } from '../src/fun/quests.ts';
import { SongRatings, type CurrentPlay } from '../src/fun/ratings.ts';
import { buildRecap } from '../src/history/recap.ts';

const event = { name: 'LAN', lan_id: 'lan-2026', starts_at: '2026-11-19 19:00', ends_at: '2026-11-22 15:00', timezone: 'Europe/Amsterdam' };
const PLAYERS = ['mara', 'sam', 'tom', 'lisa'];
const QUEST_LIST = ['Quest A', 'Quest B', 'Quest C', 'Quest D', 'Quest E', 'Quest F'];

function setup(overrides: { music?: object; quests?: object; achievements?: object } = {}) {
  const config: Record<string, object> = {
    event,
    music: { song_ratings: true, ...overrides.music },
    quests: { enabled: true, per_day: 3, quests: QUEST_LIST, ...overrides.quests },
    achievements: {
      enabled: true, wall_time: '12s', marathon_hours: 3, night_owl_hour: 4, early_bird_hour: 8,
      explorer_games: 2, crowd_pleaser_likes: 2, voter_polls: 2, ...overrides.achievements,
    },
  };
  const db = openDatabase(':memory:');
  upsertLan(db, event);
  const store = { get: (name: string) => config[name] } as unknown as ConfigStore;
  // Friday 20 Nov, 21:00 in Amsterdam: day 2 of the LAN.
  let now = new Date('2026-11-20T20:00:00Z');
  let play: CurrentPlay | null = null;
  const live = new Map<string, LiveState>();
  const common = { db, store, lanId: () => 'lan-2026', playerIds: () => PLAYERS, nickname: (id: string) => id, onChange: () => {}, now: () => now };
  const quests = new Quests({ ...common, submissionsBlocked: () => null, onDone: (p, _q, progress) => achievements.questDone(p, progress) });
  const achievements: Achievements = new Achievements({ ...common, isLive: () => quests.day() > 0, liveState: id => live.get(id) });
  const ratings = new SongRatings({
    ...common, currentPlay: () => play, submissionsBlocked: () => null,
    onThumbsUp: (p, ups) => achievements.thumbsUp(p.requesterId, p.title, ups),
  });
  const playSong = (requester: string | null, title = 'Song') => {
    const eventId = appendEvent(db, 'lan-2026', 'song_played', requester, { title, artist: 'Artist' }, now);
    play = { eventId, requesterId: requester, title };
  };
  const earned = (playerId: string) => achievements.info(playerId, { forWall: false, hidden: () => false, hidePublic: false })
    .mine.filter(a => a.earnedAt).map(a => a.id);
  return {
    db, quests, achievements, ratings, live, playSong, earned,
    setNow: (iso: string) => { now = new Date(iso); },
  };
}

describe('song ratings', () => {
  it('counts one thumb per player and lets them change or take it back', () => {
    const { ratings, playSong } = setup();
    playSong('mara');
    ratings.rate('sam', 1);
    ratings.rate('tom', 1);
    ratings.rate('lisa', -1);
    expect(ratings.info('sam')).toEqual({ up: 2, down: 1, mine: 1 });
    ratings.rate('sam', -1);
    expect(ratings.info('sam')).toEqual({ up: 1, down: 2, mine: -1 });
    ratings.rate('sam', 0);
    expect(ratings.info('sam')).toEqual({ up: 1, down: 1, mine: null });
  });

  it('refuses rating your own request, nothing playing, or ratings off', () => {
    const a = setup();
    expect(() => a.ratings.rate('sam', 1)).toThrow(/No song/);
    a.playSong('mara');
    expect(() => a.ratings.rate('mara', 1)).toThrow(/own request/);
    const off = setup({ music: { song_ratings: false } });
    off.playSong('mara');
    expect(() => off.ratings.rate('sam', 1)).toThrow(/switched off/);
    expect(off.ratings.info('sam')).toBeNull();
  });

  it('gives the requester Crowd Pleaser, and shows the best songs in LAN Wrapped', () => {
    const { ratings, playSong, earned, db } = setup();
    playSong('mara', 'Banger');
    ratings.rate('sam', 1);
    expect(earned('mara')).not.toContain('crowd_pleaser');
    ratings.rate('tom', 1);
    expect(earned('mara')).toContain('crowd_pleaser');
    const recap = buildRecap(db, { lanId: 'lan-2026', nickname: id => id, now: new Date('2026-11-20T21:00:00Z') })!;
    expect(recap.music.topRated[0]).toMatchObject({ title: 'Banger', requester: 'mara', up: 2, down: 0 });
  });
});

describe('side quests', () => {
  it('gives everyone the same few quests all day, and new ones the next day', () => {
    const { quests, setNow } = setup();
    const first = quests.info('mara');
    expect(first.day).toBe(2);
    expect(first.mine).toHaveLength(3);
    expect(new Set(first.mine.map(q => q.text)).size).toBe(3);
    expect(quests.info('mara').mine.map(q => q.text)).toEqual(first.mine.map(q => q.text));
    expect(first.board.map(b => b.total)).toEqual([3, 3, 3, 3]);
    setNow('2026-11-21T20:00:00Z');
    expect(quests.info('mara').day).toBe(3);
  });

  it('has no quests before the LAN starts', () => {
    const { quests, setNow } = setup();
    setNow('2026-11-12T12:00:00Z');
    expect(quests.info('mara')).toMatchObject({ day: 0, mine: [], board: [] });
  });

  it('ticks quests off, only your own, and gives Quest Master for the whole set', () => {
    const { quests, earned } = setup();
    const mine = quests.info('mara').mine;
    const other = quests.info('sam').mine[0]!;
    expect(() => quests.setDone('mara', other.id, true)).toThrow(/not one of yours/);
    quests.setDone('mara', mine[0]!.id, true);
    quests.setDone('mara', mine[1]!.id, true);
    expect(earned('mara')).not.toContain('quest_master');
    quests.setDone('mara', mine[2]!.id, true);
    expect(earned('mara')).toContain('quest_master');
    expect(quests.info(null).board[0]).toMatchObject({ playerId: 'mara', done: 3 });
  });

  it('refuses quests from an earlier day', () => {
    const { quests, setNow } = setup();
    const old = quests.info('mara').mine[0]!;
    setNow('2026-11-21T20:00:00Z');
    expect(() => quests.setDone('mara', old.id, true)).toThrow(/another day/);
  });
});

describe('achievements', () => {
  it('spots Marathon, Night Owl and Early Bird from what players are playing', () => {
    const { achievements, live, earned, setNow } = setup();
    live.set('mara', { status: 'in_game', game: 'Factorio', sessionStartedAt: '2026-11-20T16:30:00Z' });
    live.set('sam', { status: 'in_game', game: 'CS2', sessionStartedAt: '2026-11-20T19:30:00Z' });
    achievements.check();
    expect(earned('mara')).toContain('marathon');
    expect(earned('sam')).not.toContain('marathon');
    setNow('2026-11-21T03:30:00Z'); // 4:30 in Amsterdam
    achievements.check();
    expect(earned('sam')).toContain('night_owl');
    expect(earned('sam')).not.toContain('early_bird');
    setNow('2026-11-21T06:15:00Z'); // 7:15 in Amsterdam
    achievements.check();
    expect(earned('sam')).toContain('early_bird');
  });

  it('spots Explorer, Voice of the People and Opening Act from the event log', () => {
    const { achievements, db, earned } = setup();
    const at = new Date('2026-11-20T19:00:00Z');
    appendEvent(db, 'lan-2026', 'game_session_started', 'tom', { game: 'Factorio' }, at);
    appendEvent(db, 'lan-2026', 'game_session_started', 'tom', { game: 'CS2' }, at);
    appendEvent(db, 'lan-2026', 'vote_cast', 'lisa', { poll_id: 1 }, at);
    appendEvent(db, 'lan-2026', 'vote_cast', 'lisa', { poll_id: 1, changed: true }, at);
    appendEvent(db, 'lan-2026', 'song_played', null, { title: 'Room playlist song' }, at);
    appendEvent(db, 'lan-2026', 'song_played', 'sam', { title: 'First request' }, at);
    achievements.check();
    expect(earned('tom')).toContain('explorer');
    expect(earned('lisa')).not.toContain('voter'); // two votes in the same poll count once
    appendEvent(db, 'lan-2026', 'vote_cast', 'lisa', { poll_id: 2 }, at);
    achievements.check();
    expect(earned('lisa')).toContain('voter');
    expect(earned('sam')).toContain('opening_act');
  });

  it('gives Full House to everyone, once, and only while the LAN runs', () => {
    const { achievements, earned, setNow } = setup();
    achievements.fullHouse('Factorio');
    achievements.fullHouse('Factorio');
    for (const id of ['mara', 'sam', 'tom', 'lisa']) expect(earned(id)).toEqual(['full_house']);
    const before = setup();
    before.setNow('2026-11-12T12:00:00Z');
    before.achievements.fullHouse('Factorio');
    before.setNow('2026-11-20T20:00:00Z');
    expect(before.earned('mara')).toEqual([]);
    void setNow;
  });

  it('shows new moments on the wall, but not for hidden players or with hide public on', () => {
    const { achievements, quests } = setup();
    achievements.fullHouse('Factorio');
    quests.setDone('mara', quests.info('mara').mine[0]!.id, true);
    const all = achievements.info(null, { forWall: true, hidden: () => false, hidePublic: false }).recent;
    expect(all.filter(m => m.kind === 'achievement')).toHaveLength(4);
    expect(all.filter(m => m.kind === 'quest')).toEqual([expect.objectContaining({ player: 'mara', detail: expect.stringMatching(/^Quest/) })]);
    expect(achievements.info(null, { forWall: true, hidden: id => id === 'mara', hidePublic: false }).recent.some(m => m.playerId === 'mara')).toBe(false);
    expect(achievements.info(null, { forWall: true, hidden: () => false, hidePublic: true }).recent).toEqual([]);
  });

  it('lands in LAN Wrapped with the side quest totals', () => {
    const { achievements, quests, db } = setup();
    achievements.fullHouse('Factorio');
    for (const q of quests.info('tom').mine) quests.setDone('tom', q.id, true);
    const recap = buildRecap(db, { lanId: 'lan-2026', nickname: id => id, now: new Date('2026-11-20T21:00:00Z') })!;
    expect(recap.achievements.filter(a => a.title === 'Full House')).toHaveLength(4);
    expect(recap.achievements.some(a => a.playerId === 'tom' && a.title === 'Quest Master')).toBe(true);
    expect(recap.quests).toEqual([{ player: 'tom', playerId: 'tom', done: 3 }]);
    expect(recap.awards.find(a => a.title === 'The Quester')?.playerId).toBe('tom');
  });
});
