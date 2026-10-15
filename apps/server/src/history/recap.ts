// LAN Wrapped: stats, awards and a timeline, computed from the event log.
// Works for any LAN in the database and any time range (a night or the whole weekend).
import type { LanSummary, RecapData, RecapSession } from '@lan-os/shared';
import type { Db } from '../db/database.ts';
import { listEvents, type StoredEvent } from '../db/events.ts';
import { Tournament } from '../tournament/tournament.ts';

const HOUR_S = 3600;
const round1 = (n: number) => Math.round(n * 10) / 10;

interface Interval { playerId: string; game: string; start: number; end: number }

interface LanRow { id: string; name: string; starts_at: string; ends_at: string; timezone: string }

/** Game sessions as time intervals, clipped to the range; running ones end at `now`. */
function sessionIntervals(events: StoredEvent[], from: number, to: number, now: number): Interval[] {
  const open = new Map<string, { game: string; start: number }>();
  const result: Interval[] = [];
  const push = (playerId: string, game: string, start: number, end: number) => {
    const s = Math.max(start, from);
    const e = Math.min(end, to);
    if (e > s) result.push({ playerId, game, start: s, end: e });
  };
  for (const e of events) {
    if (!e.playerId || typeof e.data.game !== 'string') continue;
    const at = Date.parse(e.occurredAt);
    if (e.type === 'game_session_started') open.set(e.playerId, { game: e.data.game, start: at });
    if (e.type === 'game_session_ended') {
      const s = open.get(e.playerId);
      push(e.playerId, e.data.game, s?.start ?? at - Number(e.data.seconds ?? 0) * 1000, at);
      open.delete(e.playerId);
    }
  }
  for (const [playerId, s] of open) push(playerId, s.game, s.start, Math.min(now, to));
  return result;
}

const hourIn = (ms: number, timezone: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));

/** Seconds of each interval that fall in each hour of the day. */
function hourlySeconds(intervals: Interval[], timezone: string): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const i of intervals) {
    for (let t = i.start; t < i.end;) {
      const next = Math.min(i.end, (Math.floor(t / 3_600_000) + 1) * 3_600_000);
      hours[hourIn(t, timezone)]! += (next - t) / 1000;
      t = next;
    }
  }
  return hours;
}

/** For each game, the moment the most players were in it together. */
function biggestGroups(intervals: Interval[]): Array<{ game: string; players: string[]; at: number }> {
  const byGame = new Map<string, Interval[]>();
  for (const i of intervals) byGame.set(i.game, [...(byGame.get(i.game) ?? []), i]);
  const result: Array<{ game: string; players: string[]; at: number }> = [];
  for (const [game, list] of byGame) {
    let best: { players: string[]; at: number } | null = null;
    for (const t of list.map(i => i.start)) {
      const players = [...new Set(list.filter(i => i.start <= t && i.end > t).map(i => i.playerId))];
      if (players.length > 1 && (!best || players.length > best.players.length)) best = { players, at: t };
    }
    if (best) result.push({ game, ...best });
  }
  return result.sort((a, b) => b.players.length - a.players.length || a.at - b.at);
}

/** Seconds each player spent in a game together with at least one other player. */
function groupSeconds(intervals: Interval[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const a of intervals) {
    const overlaps = intervals.filter(b => b.game === a.game && b.playerId !== a.playerId && b.start < a.end && b.end > a.start)
      .map(b => [Math.max(a.start, b.start), Math.min(a.end, b.end)] as const).sort((x, y) => x[0] - y[0]);
    let covered = 0;
    let until = -Infinity;
    for (const [s, e] of overlaps) {
      if (e <= until) continue;
      covered += e - Math.max(s, until);
      until = e;
    }
    result.set(a.playerId, (result.get(a.playerId) ?? 0) + covered / 1000);
  }
  return result;
}

export interface RecapOptions {
  lanId: string;
  nickname: (id: string) => string;
  /** Limit to a part of the LAN, e.g. the last night. Defaults to the whole LAN. */
  range?: { from: Date; to: Date; label: string };
  final?: boolean;
  now?: Date;
}

export function buildRecap(db: Db, o: RecapOptions): RecapData | null {
  const lan = db.prepare('SELECT * FROM lans WHERE id = ?').get(o.lanId) as LanRow | undefined;
  if (!lan) return null;
  const now = (o.now ?? new Date()).getTime();
  const from = o.range?.from.getTime() ?? 0;
  const firstEvent = db.prepare('SELECT MIN(occurred_at) FROM events WHERE lan_id = ?').pluck().get(o.lanId) as string | null;
  const to = o.range?.to.getTime() ?? Infinity;
  const inRange = (iso: string) => { const t = Date.parse(iso); return t >= from && t < to; };
  const events = listEvents(db, o.lanId);
  const intervals = sessionIntervals(events, from, to, now);
  const tz = lan.timezone;
  const name = o.nickname;

  const seconds = (i: Interval) => (i.end - i.start) / 1000;
  const sum = (list: Interval[]) => list.reduce((t, i) => t + seconds(i), 0);
  const playerIds = [...new Set([...intervals.map(i => i.playerId), ...events.filter(e => e.playerId && inRange(e.occurredAt)).map(e => e.playerId!)])];

  // Games
  const games = new Map<string, Interval[]>();
  for (const i of intervals) games.set(i.game, [...(games.get(i.game) ?? []), i]);
  const topGames = [...games.entries()]
    .map(([game, list]) => ({ name: game, hours: round1(sum(list) / HOUR_S), players: new Set(list.map(i => i.playerId)).size }))
    .sort((a, b) => b.hours - a.hours).slice(0, 10);
  const toSession = (i: Interval): RecapSession => ({ player: name(i.playerId), playerId: i.playerId, game: i.game, startedAt: new Date(i.start).toISOString(), seconds: Math.round(seconds(i)) });
  const longestSessions = [...intervals].sort((a, b) => seconds(b) - seconds(a)).slice(0, 5).map(toSession);
  const groups = biggestGroups(intervals);
  const variety = playerIds.map(id => ({ id, games: new Set(intervals.filter(i => i.playerId === id).map(i => i.game)).size }))
    .sort((a, b) => b.games - a.games);

  // Music
  const played = events.filter(e => e.type === 'song_played' && inRange(e.occurredAt));
  const requested = events.filter(e => e.type === 'song_requested' && inRange(e.occurredAt));
  const countBy = <T,>(list: T[], key: (x: T) => string) => {
    const map = new Map<string, number>();
    for (const x of list) map.set(key(x), (map.get(key(x)) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const songKey = (e: StoredEvent) => `${e.data.title}\u0000${e.data.artist}`;
  const music = {
    total: played.length,
    topSongs: countBy(played, songKey).slice(0, 5).map(([k, count]) => { const [title, artist] = k.split('\u0000'); return { title: title!, artist: artist!, count }; }),
    topArtists: countBy(played.flatMap(e => String(e.data.artist ?? '').split(', ').filter(Boolean).map(a => ({ a }))), x => x.a).slice(0, 5).map(([artist, count]) => ({ artist, count })),
    perPlayer: countBy(requested.filter(e => e.playerId), e => e.playerId!).map(([id, count]) => ({ player: name(id), count })),
    playlist: played.filter(e => e.playerId).map(e => ({ title: String(e.data.title), artist: String(e.data.artist), requester: name(e.playerId!) })),
  };

  // People
  const night = (list: Interval[]) => { const h = hourlySeconds(list, tz); return h.slice(0, 6).reduce((a, b) => a + b, 0); };
  const morning = (list: Interval[]) => { const h = hourlySeconds(list, tz); return h.slice(6, 11).reduce((a, b) => a + b, 0); };
  const together = groupSeconds(intervals);
  const players = playerIds.map(id => {
    const mine = intervals.filter(i => i.playerId === id);
    const perGame = new Map<string, number>();
    for (const i of mine) perGame.set(i.game, (perGame.get(i.game) ?? 0) + seconds(i));
    const hourly = hourlySeconds(mine, tz);
    const peak = Math.max(...hourly);
    return {
      id, nickname: name(id), hours: round1(sum(mine) / HOUR_S), sessions: mine.length,
      games: [...perGame.entries()].sort((a, b) => b[1] - a[1]).map(([g, s]) => ({ name: g, hours: round1(s / HOUR_S) })),
      longest: mine.length ? toSession([...mine].sort((a, b) => seconds(b) - seconds(a))[0]!) : null,
      songs: requested.filter(e => e.playerId === id).length,
      votes: events.filter(e => e.type === 'vote_cast' && e.playerId === id && inRange(e.occurredAt)).length,
      activities: events.filter(e => e.type === 'activity' && e.data.action === 'proposed' && e.playerId === id && inRange(e.occurredAt)).length,
      favouriteHour: peak > 0 ? hourly.indexOf(peak) : null,
      award: null as string | null,
      night: night(mine), morning: morning(mine), together: together.get(id) ?? 0,
      topShare: mine.length ? Math.max(...perGame.values()) / sum(mine) : 0,
    };
  });

  // Awards: non-competitive, one per person, each award once.
  const candidates: Array<{ title: string; score: (p: typeof players[number]) => number; reason: (p: typeof players[number]) => string; min: number }> = [
    { title: 'The Marathoner', score: p => p.longest?.seconds ?? 0, reason: p => `${Math.round((p.longest?.seconds ?? 0) / 360) / 10}h of ${p.longest?.game} in one go`, min: 2 * HOUR_S },
    { title: 'The Explorer', score: p => p.games.length, reason: p => `${p.games.length} different games`, min: 3 },
    { title: 'The Night Owl', score: p => p.night, reason: p => `${round1(p.night / HOUR_S)}h played between midnight and 6:00`, min: HOUR_S },
    { title: 'The Social Butterfly', score: p => p.together, reason: p => `${round1(p.together / HOUR_S)}h in games with friends`, min: HOUR_S },
    { title: 'The DJ', score: p => p.songs, reason: p => `${p.songs} songs requested`, min: 3 },
    { title: 'The Loyalist', score: p => (p.hours >= 2 ? p.topShare : 0), reason: p => `${Math.round(p.topShare * 100)}% of their time in ${p.games[0]?.name}`, min: 0.75 },
    { title: 'The Early Bird', score: p => p.morning, reason: p => `${round1(p.morning / HOUR_S)}h played before 11:00`, min: HOUR_S },
    { title: 'The Organizer', score: p => p.activities, reason: p => `${p.activities} activities proposed`, min: 1 },
    { title: 'The Voice of the People', score: p => p.votes, reason: p => `${p.votes} votes cast`, min: 3 },
  ];
  const awards: RecapData['awards'] = [];
  const taken = new Set<string>();
  for (const award of candidates) {
    const winner = players.filter(p => !taken.has(p.id) && award.score(p) >= award.min).sort((a, b) => award.score(b) - award.score(a))[0];
    if (!winner) continue;
    taken.add(winner.id);
    winner.award = award.title;
    awards.push({ title: award.title, player: winner.nickname, playerId: winner.id, reason: award.reason(winner) });
  }

  // Timeline of major moments
  const timeline: RecapData['timeline'] = [];
  for (const e of events) {
    if (!inRange(e.occurredAt)) continue;
    if (e.type === 'announcement' && typeof e.data.text === 'string') timeline.push({ at: e.occurredAt, text: e.data.text });
    if (e.type === 'activity' && (e.data.action === 'started' || e.data.action === 'proposed')) {
      timeline.push({ at: e.occurredAt, text: e.data.action === 'started' ? `${e.data.title} started` : `${name(e.playerId ?? '')} proposed ${e.data.title}` });
    }
  }
  for (const g of groups.slice(0, 5)) timeline.push({ at: new Date(g.at).toISOString(), text: `${g.players.length} players together in ${g.game}` });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return {
    lan: { id: lan.id, name: lan.name, startsAt: lan.starts_at, endsAt: lan.ends_at, timezone: tz },
    range: {
      // Without a range: from the LAN's start (or earlier activity) to now, or to the end once it's over.
      from: new Date(from || Math.min(Date.parse(lan.starts_at), firstEvent ? Date.parse(firstEvent) : Infinity)).toISOString(),
      to: new Date(Number.isFinite(to) ? to : Math.min(now, Date.parse(lan.ends_at))).toISOString(),
      label: o.range?.label ?? 'The whole weekend', final: !!o.final,
    },
    totals: {
      hours: round1(sum(intervals) / HOUR_S), sessions: intervals.length, uniqueGames: games.size, songs: played.length,
      votes: events.filter(e => e.type === 'vote_cast' && inRange(e.occurredAt)).length,
      activities: events.filter(e => e.type === 'activity' && e.data.action === 'started' && inRange(e.occurredAt)).length,
      players: playerIds.length,
    },
    topGames,
    longestSessions,
    biggestGroups: groups.slice(0, 5).map(g => ({ game: g.game, players: g.players.map(name), at: new Date(g.at).toISOString() })),
    mostVaried: variety[0] && variety[0].games > 0 ? { player: name(variety[0].id), games: variety[0].games } : null,
    hourly: hourlySeconds(intervals, tz).map(s => round1(s / HOUR_S)),
    music,
    awards,
    tournaments: Tournament.finalStandings(db, lan.id)
      .map(t => ({ name: t.name, standings: t.standings.map(s => ({ player: name(s.playerId), place: s.place, points: s.points })) })),
    timeline: timeline.slice(-40),
    players: players.sort((a, b) => b.hours - a.hours).map(({ night: _n, morning: _m, together: _t, topShare: _s, ...p }) => p),
  };
}

/** Every LAN in the database, newest first, for the archive and the LAN Time Capsule. */
export function lanSummaries(db: Db, nickname: (id: string) => string, isFinal: (lanId: string) => boolean): LanSummary[] {
  const lans = db.prepare('SELECT id FROM lans ORDER BY starts_at DESC').all() as Array<{ id: string }>;
  return lans.flatMap(({ id }) => {
    const r = buildRecap(db, { lanId: id, nickname });
    if (!r) return [];
    return [{
      id, name: r.lan.name, startsAt: r.lan.startsAt, endsAt: r.lan.endsAt, hours: r.totals.hours, games: r.totals.uniqueGames,
      songs: r.totals.songs, topGame: r.topGames[0]?.name ?? null, players: r.totals.players, final: isFinal(id),
    }];
  });
}
