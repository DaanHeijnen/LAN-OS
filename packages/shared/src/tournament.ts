// The tournament: a lineup of games played through the night, scored by placement.
// Pure scoring rules shared by the server and the screens, plus what the browser sends.
import { z } from 'zod';

export const TOURNAMENT_GAME_KINDS = ['solo', 'teams', 'bingo'] as const;
export type TournamentGameKind = (typeof TOURNAMENT_GAME_KINDS)[number];
export const TOURNAMENT_KIND_LABELS: Record<TournamentGameKind, string> = { solo: 'Solo', teams: 'Teams', bingo: 'Bingo' };

/** Points for a place (1 = first). Places beyond the list get 0. */
export const pointsForPlace = (table: readonly number[], place: number) => table[place - 1] ?? 0;

/**
 * Turns a finishing order into places. Each group finished together (a tie); a tie shares the
 * higher place and the next group skips the places used: [[a], [b, c], [d]] → 1, 2, 2, 4.
 */
export function placesFromGroups<T>(groups: readonly (readonly T[])[]): Array<{ place: number; entries: T[] }> {
  let place = 1;
  return groups.filter(g => g.length).map(group => {
    const result = { place, entries: [...group] };
    place += group.length;
    return result;
  });
}

/** Ranks by score, highest first. Equal scores (and equal tie-breakers) share the higher place. */
export function rankByScore<T extends { score: number; tieBreak?: number }>(items: readonly T[]): Array<T & { place: number }> {
  const sorted = [...items].sort((a, b) => b.score - a.score || (b.tieBreak ?? 0) - (a.tieBreak ?? 0));
  return sorted.map((item, index) => {
    let first = index;
    while (first > 0 && sorted[first - 1]!.score === item.score && (sorted[first - 1]!.tieBreak ?? 0) === (item.tieBreak ?? 0)) first--;
    return { ...item, place: first + 1 };
  });
}

/** Every line on a square bingo card: rows, columns and both diagonals, as square indexes. */
export function bingoLines(size: number): number[][] {
  const range = [...Array(size).keys()];
  return [
    ...range.map(r => range.map(c => r * size + c)),
    ...range.map(c => range.map(r => r * size + c)),
    range.map(i => i * size + i),
    range.map(i => i * size + (size - 1 - i)),
  ];
}

export interface BingoPoints { square: number; line: number; full: number }

/** A card's game score: points per ticked square, per completed line and for a full card. */
export function bingoScore(size: number, ticked: readonly number[], points: BingoPoints) {
  const set = new Set(ticked);
  const lines = bingoLines(size).filter(line => line.every(i => set.has(i))).length;
  const full = set.size >= size * size;
  return { squares: set.size, lines, full, score: set.size * points.square + lines * points.line + (full ? points.full : 0) };
}

// --- What the server sends ---

export interface TournamentTeam { name: string; playerIds: string[] }

export interface TournamentRoundInfo {
  id: number;
  number: number;
  /** In finishing order; a place with more than one entry is a tie. */
  placings: Array<{ place: number; entries: Array<{ label: string; playerIds: string[] }> }>;
}

export interface BingoCardInfo {
  playerId: string;
  squares: string[];
  ticked: number[];
  lines: number;
  full: boolean;
  score: number;
}

export interface BingoInfo {
  size: number;
  ideas: string[];
  minutes: number;
  points: BingoPoints;
  endsAt: string | null;
  locked: boolean;
  cards: BingoCardInfo[];
  /** Newest first. */
  recentTicks: Array<{ playerId: string; square: string; at: string }>;
}

export interface TournamentGameInfo {
  id: number;
  name: string;
  kind: TournamentGameKind;
  state: 'upcoming' | 'live' | 'finished';
  teams: TournamentTeam[];
  rounds: TournamentRoundInfo[];
  /** Game score so far, ranked. Every player is listed. */
  scores: Array<{ playerId: string; score: number; place: number }>;
  /** Tournament points handed out when the game was finished. */
  results: Array<{ playerId: string; place: number; points: number }>;
  bingo: BingoInfo | null;
}

export interface TournamentInfo {
  id: number;
  name: string;
  state: 'setup' | 'live' | 'finished';
  pointsTable: number[];
  standings: Array<{
    playerId: string; place: number; points: number; gameWins: number;
    /** Points from the most recently finished game, for the "+10" next to a name. */
    lastGamePoints: number | null;
    /** Game score in the live game, or null when no game is live. */
    liveScore: number | null;
  }>;
  games: TournamentGameInfo[];
}

// --- From the browser ---

const idea = z.string().trim().min(1).max(60);
export const bingoSettingsSchema = z.strictObject({
  ideas: z.array(idea).max(100),
  minutes: z.number().int().min(5).max(360),
  points: z.strictObject({
    square: z.number().int().min(0).max(100),
    line: z.number().int().min(0).max(100),
    full: z.number().int().min(0).max(100),
  }),
});

export const newTournamentSchema = z.strictObject({ name: z.string().trim().min(1, 'Name the tournament').max(40) });
export const tournamentStateSchema = z.strictObject({ state: z.enum(['live', 'finished', 'closed']) });

export const newTournamentGameSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name the game').max(40),
  kind: z.enum(TOURNAMENT_GAME_KINDS),
  bingo: bingoSettingsSchema.optional(),
});

export const tournamentGameChangeSchema = z.strictObject({
  move: z.enum(['up', 'down']).optional(),
  teams: z.array(z.strictObject({
    name: z.string().trim().min(1, 'Name every team').max(24),
    playerIds: z.array(z.string().min(1).max(40)).max(32),
  })).min(2, 'Make at least two teams').max(8).optional(),
  bingo: bingoSettingsSchema.optional(),
});

/** Finishing order: each group is one place; entries are player ids, or team numbers ("0", "1") in a team game. */
export const tournamentRoundSchema = z.strictObject({
  placings: z.array(z.array(z.string().min(1).max(40)).min(1)).min(1, 'Tap at least the winner').max(32),
});

export const bingoTickSchema = z.strictObject({ ticked: z.boolean() });
