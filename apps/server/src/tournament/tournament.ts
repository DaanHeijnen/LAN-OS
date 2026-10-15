// The tournament: admins plan a lineup of games, score each round by finishing order, and finish
// a game to hand out tournament points by placement. Bingo games score ticked squares and lines.
import {
  bingoScore, durationToSeconds, placesFromGroups, pointsForPlace, rankByScore,
  type BingoInfo, type BingoPoints, type TournamentGameInfo, type TournamentGameKind, type TournamentInfo,
  type TournamentRoundInfo, type TournamentTeam,
} from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent } from '../db/events.ts';

/** How many recent bingo ticks the screens get. */
const RECENT_TICKS = 6;

interface TournamentRow { id: number; name: string; state: 'setup' | 'live' | 'finished' | 'closed'; finished_at: string | null }
interface GameRow {
  id: number; tournament_id: number; position: number; name: string; kind: TournamentGameKind; state: 'upcoming' | 'live' | 'finished';
  teams: string; bingo_ideas: string; bingo_minutes: number | null; bingo_square_points: number | null; bingo_line_points: number | null;
  bingo_full_points: number | null; bingo_ends_at: string | null; started_at: string | null; finished_at: string | null;
}
interface RoundRow { id: number; game_id: number; number: number; placings: string; teams: string }
interface ResultRow { game_id: number; player_id: string; game_score: number; place: number; points: number }
interface TickRow { player_id: string; square: number; ticked_at: string }

export class TournamentError extends Error {}

export interface BingoSettings { ideas: string[]; minutes: number; points: BingoPoints }

export interface TournamentOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  playerIds: () => string[];
  nickname: (id: string) => string;
  /** Shows a finished game's result on the wall. */
  announce: (text: string, ms: number) => void;
  onChange: () => void;
  now?: () => Date;
  random?: () => number;
}

export class Tournament {
  private readonly o: TournamentOptions;
  private readonly now: () => Date;
  private readonly random: () => number;
  /** Bingo games whose time-up has already been pushed to the screens. */
  private timeUpSeen = new Set<number>();

  constructor(options: TournamentOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  private get table(): number[] {
    return this.o.store.get('tournament').placement_points;
  }

  private get cardSize(): number {
    return this.o.store.get('tournament').bingo_card_size;
  }

  // --- Reading ---

  /** The tournament that is being set up, running or showing its podium. */
  private current(): TournamentRow | undefined {
    return this.o.db.prepare("SELECT * FROM tournaments WHERE lan_id = ? AND state != 'closed' ORDER BY id DESC LIMIT 1")
      .get(this.o.lanId()) as TournamentRow | undefined;
  }

  private require(): TournamentRow {
    const t = this.current();
    if (!t) throw new TournamentError('There is no tournament yet. Create one first.');
    return t;
  }

  private games(tournamentId: number): GameRow[] {
    return this.o.db.prepare('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY position, id').all(tournamentId) as GameRow[];
  }

  private game(id: number): GameRow {
    const t = this.require();
    const game = this.games(t.id).find(g => g.id === id);
    if (!game) throw new TournamentError('That game is no longer in the lineup.');
    return game;
  }

  private rounds(gameId: number): RoundRow[] {
    return this.o.db.prepare('SELECT * FROM tournament_rounds WHERE game_id = ? ORDER BY number').all(gameId) as RoundRow[];
  }

  private results(gameId: number): ResultRow[] {
    return this.o.db.prepare('SELECT * FROM tournament_results WHERE game_id = ? ORDER BY place, player_id').all(gameId) as ResultRow[];
  }

  private card(gameId: number, playerId: string): string[] | null {
    const row = this.o.db.prepare('SELECT squares FROM bingo_cards WHERE game_id = ? AND player_id = ?').get(gameId, playerId) as { squares: string } | undefined;
    return row ? JSON.parse(row.squares) as string[] : null;
  }

  private ticks(gameId: number): TickRow[] {
    return this.o.db.prepare('SELECT player_id, square, ticked_at FROM bingo_ticks WHERE game_id = ? ORDER BY ticked_at DESC').all(gameId) as TickRow[];
  }

  private bingoPoints(game: GameRow): BingoPoints {
    return { square: game.bingo_square_points ?? 0, line: game.bingo_line_points ?? 0, full: game.bingo_full_points ?? 0 };
  }

  private locked(game: GameRow): boolean {
    return game.state === 'finished' || (game.bingo_ends_at !== null && Date.parse(game.bingo_ends_at) <= this.now().getTime());
  }

  /** Game score per player so far, ranked. Every player in the room is listed. */
  private scores(game: GameRow): Array<{ playerId: string; score: number; place: number }> {
    const totals = new Map(this.o.playerIds().map(id => [id, 0]));
    if (game.kind === 'bingo') {
      const ticks = this.ticks(game.id);
      for (const id of totals.keys()) {
        totals.set(id, bingoScore(this.cardSizeOf(game, id), ticks.filter(t => t.player_id === id).map(t => t.square), this.bingoPoints(game)).score);
      }
    } else {
      for (const round of this.rounds(game.id)) {
        for (const { place, playerIds } of this.roundPlaces(round)) {
          for (const id of playerIds) totals.set(id, (totals.get(id) ?? 0) + pointsForPlace(this.table, place));
        }
      }
    }
    return rankByScore([...totals].map(([playerId, score]) => ({ playerId, score })))
      .map(({ playerId, score, place }) => ({ playerId, score, place }));
  }

  /** A card's size follows its squares, so changing the config mid-game can't break a card. */
  private cardSizeOf(game: GameRow, playerId: string): number {
    const squares = this.card(game.id, playerId);
    return squares ? Math.round(Math.sqrt(squares.length)) : this.cardSize;
  }

  private roundPlaces(round: RoundRow): Array<{ place: number; label: string; playerIds: string[] }> {
    const teams = JSON.parse(round.teams) as TournamentTeam[];
    return placesFromGroups(JSON.parse(round.placings) as string[][]).flatMap(({ place, entries }) => entries.map(entry => {
      const team = teams.length ? teams[Number(entry)] : undefined;
      return team ? { place, label: team.name, playerIds: team.playerIds } : { place, label: this.o.nickname(entry), playerIds: [entry] };
    }));
  }

  // --- The tournament itself ---

  create(name: string): void {
    if (this.current()) throw new TournamentError('A tournament is already set up. Close it first to start a new one.');
    this.o.db.prepare("INSERT INTO tournaments (lan_id, name, state, created_at) VALUES (?, ?, 'setup', ?)")
      .run(this.o.lanId(), name.trim(), this.now().toISOString());
    this.o.onChange();
  }

  setState(state: 'live' | 'finished' | 'closed'): void {
    const t = this.require();
    const now = this.now().toISOString();
    if (state === 'live') {
      if (t.state !== 'setup') throw new TournamentError('The tournament has already started.');
      this.o.db.prepare("UPDATE tournaments SET state = 'live', started_at = ? WHERE id = ?").run(now, t.id);
    } else if (state === 'finished') {
      if (t.state !== 'live') throw new TournamentError('Start the tournament first.');
      const live = this.games(t.id).find(g => g.state === 'live');
      if (live) throw new TournamentError(`Finish ${live.name} first.`);
      this.o.db.prepare("UPDATE tournaments SET state = 'finished', finished_at = ? WHERE id = ?").run(now, t.id);
      const winners = this.standings(t.id).filter(s => s.place === 1).map(s => this.o.nickname(s.playerId));
      if (winners.length) appendEvent(this.o.db, this.o.lanId(), 'announcement', null, { text: `${winners.join(' & ')} won ${t.name}`, trigger: 'tournament' }, this.now());
    } else {
      this.o.db.prepare("UPDATE tournaments SET state = 'closed', finished_at = COALESCE(finished_at, ?) WHERE id = ?").run(now, t.id);
    }
    this.o.onChange();
  }

  // --- The lineup ---

  addGame(input: { name: string; kind: TournamentGameKind; bingo?: BingoSettings }): void {
    const t = this.require();
    if (t.state === 'finished') throw new TournamentError('The tournament is finished.');
    const position = this.games(t.id).reduce((max, g) => Math.max(max, g.position), 0) + 1;
    const config = this.o.store.get('tournament');
    const bingo = input.kind === 'bingo' ? input.bingo ?? {
      ideas: [], minutes: Math.round(durationToSeconds(config.bingo_time_limit) / 60),
      points: { square: config.bingo_square_points, line: config.bingo_line_points, full: config.bingo_full_card_points },
    } : null;
    this.o.db.prepare(`INSERT INTO tournament_games (tournament_id, position, name, kind, state, bingo_ideas, bingo_minutes,
      bingo_square_points, bingo_line_points, bingo_full_points) VALUES (?, ?, ?, ?, 'upcoming', ?, ?, ?, ?, ?)`)
      .run(t.id, position, input.name.trim(), input.kind, JSON.stringify(bingo ? cleanIdeas(bingo.ideas) : []), bingo?.minutes ?? null,
        bingo?.points.square ?? null, bingo?.points.line ?? null, bingo?.points.full ?? null);
    this.o.onChange();
  }

  changeGame(id: number, change: { move?: 'up' | 'down'; teams?: TournamentTeam[]; bingo?: BingoSettings }): void {
    const game = this.game(id);
    if (change.teams) {
      if (game.kind !== 'teams') throw new TournamentError('Only team games have teams.');
      if (game.state === 'finished') throw new TournamentError('This game is finished.');
      this.o.db.prepare('UPDATE tournament_games SET teams = ? WHERE id = ?').run(JSON.stringify(this.checkTeams(change.teams)), id);
    }
    if (change.bingo) {
      if (game.kind !== 'bingo') throw new TournamentError('Only bingo games have bingo ideas.');
      if (game.state !== 'upcoming') throw new TournamentError('The cards are already handed out; bingo settings can no longer change.');
      this.o.db.prepare(`UPDATE tournament_games SET bingo_ideas = ?, bingo_minutes = ?, bingo_square_points = ?, bingo_line_points = ?,
        bingo_full_points = ? WHERE id = ?`).run(JSON.stringify(cleanIdeas(change.bingo.ideas)), change.bingo.minutes,
        change.bingo.points.square, change.bingo.points.line, change.bingo.points.full, id);
    }
    if (change.move) {
      const games = this.games(game.tournament_id);
      const index = games.findIndex(g => g.id === id);
      const other = games[change.move === 'up' ? index - 1 : index + 1];
      if (other) {
        // Renumber the whole lineup so equal positions can never get stuck.
        [games[index], games[games.indexOf(other)]] = [other, game];
        const update = this.o.db.prepare('UPDATE tournament_games SET position = ? WHERE id = ?');
        this.o.db.transaction(() => games.forEach((g, i) => update.run(i + 1, g.id)))();
      }
    }
    this.o.onChange();
  }

  private checkTeams(teams: TournamentTeam[]): TournamentTeam[] {
    const known = new Set(this.o.playerIds());
    const seen = new Set<string>();
    for (const team of teams) {
      for (const id of team.playerIds) {
        if (!known.has(id)) throw new TournamentError('One of those players is no longer in the room.');
        if (seen.has(id)) throw new TournamentError(`${this.o.nickname(id)} is in two teams.`);
        seen.add(id);
      }
    }
    if (new Set(teams.map(t => t.name.trim().toLowerCase())).size !== teams.length) throw new TournamentError('Give every team its own name.');
    return teams.map(t => ({ name: t.name.trim(), playerIds: t.playerIds }));
  }

  removeGame(id: number): void {
    const game = this.game(id);
    if (game.state !== 'upcoming') throw new TournamentError('Only games that haven\'t started can be removed.');
    this.o.db.prepare('DELETE FROM tournament_games WHERE id = ?').run(id);
    this.o.onChange();
  }

  startGame(id: number): void {
    const t = this.require();
    if (t.state !== 'live') throw new TournamentError('Start the tournament first.');
    const game = this.game(id);
    if (game.state !== 'upcoming') throw new TournamentError('This game has already been played.');
    const live = this.games(t.id).find(g => g.state === 'live');
    if (live) throw new TournamentError(`${live.name} is still live. Finish it first.`);
    const now = this.now();
    this.o.db.transaction(() => {
      if (game.kind === 'teams') {
        const teams = JSON.parse(game.teams) as TournamentTeam[];
        if (teams.filter(team => team.playerIds.length).length < 2) throw new TournamentError('Put players in at least two teams first.');
      }
      if (game.kind === 'bingo') {
        const ideas = JSON.parse(game.bingo_ideas) as string[];
        const needed = this.cardSize ** 2;
        if (ideas.length < needed) throw new TournamentError(`A bingo card has ${needed} squares. Add at least ${needed} ideas (you have ${ideas.length}).`);
        const insert = this.o.db.prepare('INSERT INTO bingo_cards (game_id, player_id, squares) VALUES (?, ?, ?)');
        for (const playerId of this.o.playerIds()) insert.run(id, playerId, JSON.stringify(this.drawCard(ideas, needed)));
        const ends = new Date(now.getTime() + (game.bingo_minutes ?? 60) * 60_000).toISOString();
        this.o.db.prepare('UPDATE tournament_games SET bingo_ends_at = ? WHERE id = ?').run(ends, id);
      }
      this.o.db.prepare("UPDATE tournament_games SET state = 'live', started_at = ? WHERE id = ?").run(now.toISOString(), id);
    })();
    this.o.onChange();
  }

  /** A random pick of ideas in a random order (Fisher–Yates). */
  private drawCard(ideas: string[], count: number): string[] {
    const pool = [...ideas];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, count);
  }

  // --- Rounds and results ---

  recordRound(id: number, placings: string[][]): void {
    const game = this.game(id);
    if (game.state !== 'live') throw new TournamentError('Start this game before scoring a round.');
    if (game.kind === 'bingo') throw new TournamentError('Bingo is scored from the cards.');
    const teams = game.kind === 'teams' ? JSON.parse(game.teams) as TournamentTeam[] : [];
    const valid = new Set(game.kind === 'teams' ? teams.map((_, i) => String(i)) : this.o.playerIds());
    const seen = new Set<string>();
    for (const entry of placings.flat()) {
      if (!valid.has(entry)) throw new TournamentError(game.kind === 'teams' ? 'That team no longer exists.' : 'One of those players is no longer in the room.');
      if (seen.has(entry)) throw new TournamentError('Everyone can only finish once per round.');
      seen.add(entry);
    }
    const number = this.rounds(id).length + 1;
    this.o.db.prepare('INSERT INTO tournament_rounds (game_id, number, placings, teams, recorded_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, number, JSON.stringify(placings), JSON.stringify(teams), this.now().toISOString());
    this.o.onChange();
  }

  removeLastRound(id: number): void {
    const game = this.game(id);
    if (game.state !== 'live') throw new TournamentError('Only rounds of the live game can be removed.');
    const last = this.rounds(id).at(-1);
    if (!last) throw new TournamentError('There are no rounds to remove.');
    this.o.db.prepare('DELETE FROM tournament_rounds WHERE id = ?').run(last.id);
    this.o.onChange();
  }

  /** Ranks everyone by game score and hands out tournament points by place. */
  finishGame(id: number): void {
    const game = this.game(id);
    if (game.state !== 'live') throw new TournamentError('Only the live game can be finished.');
    if (game.kind !== 'bingo' && this.rounds(id).length === 0) throw new TournamentError('Score at least one round first.');
    const ranked = this.scores(game);
    const insert = this.o.db.prepare('INSERT INTO tournament_results (game_id, player_id, game_score, place, points) VALUES (?, ?, ?, ?, ?)');
    this.o.db.transaction(() => {
      for (const s of ranked) insert.run(id, s.playerId, s.score, s.place, pointsForPlace(this.table, s.place));
      this.o.db.prepare("UPDATE tournament_games SET state = 'finished', finished_at = ? WHERE id = ?").run(this.now().toISOString(), id);
    })();
    const line = ranked.filter(s => pointsForPlace(this.table, s.place) > 0).slice(0, 5)
      .map(s => `${this.o.nickname(s.playerId)} +${pointsForPlace(this.table, s.place)}`).join(' · ');
    this.o.announce(`${game.name} is done. ${line}`, durationToSeconds(this.o.store.get('tournament').result_on_wall) * 1000);
    this.o.onChange();
  }

  // --- Bingo ---

  private liveBingo(): GameRow {
    const t = this.require();
    const game = this.games(t.id).find(g => g.state === 'live' && g.kind === 'bingo');
    if (!game) throw new TournamentError('No bingo game is running.');
    return game;
  }

  /** A player ticks (or unticks) one of their own squares. */
  tick(playerId: string, square: number, ticked: boolean): void {
    const game = this.liveBingo();
    if (this.locked(game)) throw new TournamentError('Time is up. The cards are locked.');
    const card = this.card(game.id, playerId) ?? this.dealLateCard(game, playerId);
    if (square < 0 || square >= card.length) throw new TournamentError('That square is not on your card.');
    this.setTick(game.id, playerId, square, ticked);
  }

  /** An admin removes a tick, for example when someone claimed too much. */
  untick(gameId: number, playerId: string, square: number): void {
    const game = this.game(gameId);
    if (game.kind !== 'bingo' || game.state !== 'live') throw new TournamentError('Ticks can only be removed while the bingo game is live.');
    this.setTick(gameId, playerId, square, false);
  }

  private setTick(gameId: number, playerId: string, square: number, ticked: boolean): void {
    if (ticked) {
      this.o.db.prepare('INSERT OR IGNORE INTO bingo_ticks (game_id, player_id, square, ticked_at) VALUES (?, ?, ?, ?)')
        .run(gameId, playerId, square, this.now().toISOString());
    } else {
      this.o.db.prepare('DELETE FROM bingo_ticks WHERE game_id = ? AND player_id = ? AND square = ?').run(gameId, playerId, square);
    }
    this.o.onChange();
  }

  /** A player added after the cards were handed out still gets one. */
  private dealLateCard(game: GameRow, playerId: string): string[] {
    if (!this.o.playerIds().includes(playerId)) throw new TournamentError('You are not on the player list.');
    const ideas = JSON.parse(game.bingo_ideas) as string[];
    const squares = this.drawCard(ideas, Math.min(ideas.length, this.cardSize ** 2));
    this.o.db.prepare('INSERT INTO bingo_cards (game_id, player_id, squares) VALUES (?, ?, ?)').run(game.id, playerId, JSON.stringify(squares));
    return squares;
  }

  /** Called every few seconds: tells the screens once when bingo time runs out. */
  housekeeping(): void {
    const t = this.current();
    if (!t) return;
    for (const game of this.games(t.id)) {
      if (game.kind === 'bingo' && game.state === 'live' && this.locked(game) && !this.timeUpSeen.has(game.id)) {
        this.timeUpSeen.add(game.id);
        this.o.onChange();
      }
    }
  }

  // --- What the screens get ---

  private standings(tournamentId: number): TournamentInfo['standings'] {
    const games = this.games(tournamentId);
    const finished = games.filter(g => g.state === 'finished').sort((a, b) => (a.finished_at ?? '').localeCompare(b.finished_at ?? ''));
    const live = games.find(g => g.state === 'live');
    const liveScores = live ? new Map(this.scores(live).map(s => [s.playerId, s.score])) : null;
    const last = finished.at(-1);
    const lastPoints = last ? new Map(this.results(last.id).map(r => [r.player_id, r.points])) : null;
    const totals = new Map(this.o.playerIds().map(id => [id, { points: 0, wins: 0 }]));
    for (const game of finished) {
      for (const r of this.results(game.id)) {
        const total = totals.get(r.player_id);
        // Points of a player who has since left the player list no longer show.
        if (!total) continue;
        total.points += r.points;
        if (r.place === 1) total.wins++;
      }
    }
    return rankByScore([...totals].map(([playerId, t]) => ({ playerId, score: t.points, tieBreak: t.wins }))).map(s => ({
      playerId: s.playerId, place: s.place, points: s.score, gameWins: s.tieBreak,
      lastGamePoints: lastPoints?.get(s.playerId) ?? null,
      liveScore: liveScores?.get(s.playerId) ?? null,
    }));
  }

  private gameInfo(game: GameRow): TournamentGameInfo {
    const rounds: TournamentRoundInfo[] = game.kind === 'bingo' ? [] : this.rounds(game.id).map(round => {
      const places = this.roundPlaces(round);
      const grouped = new Map<number, Array<{ label: string; playerIds: string[] }>>();
      for (const p of places) grouped.set(p.place, [...(grouped.get(p.place) ?? []), { label: p.label, playerIds: p.playerIds }]);
      return { id: round.id, number: round.number, placings: [...grouped].map(([place, entries]) => ({ place, entries })) };
    });
    return {
      id: game.id, name: game.name, kind: game.kind, state: game.state,
      teams: JSON.parse(game.teams) as TournamentTeam[],
      rounds,
      scores: game.state === 'upcoming' ? [] : this.scores(game),
      results: this.results(game.id).map(r => ({ playerId: r.player_id, place: r.place, points: r.points })),
      bingo: game.kind === 'bingo' ? this.bingoInfo(game) : null,
    };
  }

  private bingoInfo(game: GameRow): BingoInfo {
    const ticks = this.ticks(game.id);
    const points = this.bingoPoints(game);
    const cards = game.state === 'upcoming' ? [] : this.o.playerIds().flatMap(playerId => {
      const squares = this.card(game.id, playerId);
      if (!squares) return [];
      const ticked = ticks.filter(t => t.player_id === playerId).map(t => t.square).sort((a, b) => a - b);
      const { lines, full, score } = bingoScore(Math.round(Math.sqrt(squares.length)), ticked, points);
      return [{ playerId, squares, ticked, lines, full, score }];
    });
    const cardOf = new Map(cards.map(c => [c.playerId, c.squares]));
    return {
      size: cards[0] ? Math.round(Math.sqrt(cards[0].squares.length)) : this.cardSize,
      ideas: JSON.parse(game.bingo_ideas) as string[],
      minutes: game.bingo_minutes ?? 0,
      points,
      endsAt: game.bingo_ends_at,
      locked: game.state !== 'upcoming' && this.locked(game),
      cards,
      recentTicks: ticks.filter(t => cardOf.has(t.player_id)).slice(0, RECENT_TICKS)
        .map(t => ({ playerId: t.player_id, square: cardOf.get(t.player_id)![t.square] ?? '', at: t.ticked_at })),
    };
  }

  info(): TournamentInfo | null {
    const t = this.current();
    if (!t || t.state === 'closed') return null;
    return {
      id: t.id, name: t.name, state: t.state, pointsTable: this.table,
      standings: this.standings(t.id),
      games: this.games(t.id).map(g => this.gameInfo(g)),
    };
  }

  /** The final standings of every finished tournament of a LAN, for LAN Wrapped. */
  static finalStandings(db: Db, lanId: string): Array<{ name: string; standings: Array<{ playerId: string; place: number; points: number }> }> {
    const tournaments = db.prepare("SELECT id, name FROM tournaments WHERE lan_id = ? AND finished_at IS NOT NULL AND started_at IS NOT NULL ORDER BY id")
      .all(lanId) as Array<{ id: number; name: string }>;
    return tournaments.map(t => {
      const rows = db.prepare(`SELECT r.player_id, SUM(r.points) AS points, SUM(r.place = 1) AS wins FROM tournament_results r
        JOIN tournament_games g ON g.id = r.game_id WHERE g.tournament_id = ? GROUP BY r.player_id`).all(t.id) as Array<{ player_id: string; points: number; wins: number }>;
      return {
        name: t.name,
        standings: rankByScore(rows.map(r => ({ playerId: r.player_id, score: r.points, tieBreak: r.wins })))
          .map(s => ({ playerId: s.playerId, place: s.place, points: s.score })),
      };
    }).filter(t => t.standings.length);
  }
}

const cleanIdeas = (ideas: string[]) => [...new Set(ideas.map(i => i.trim()).filter(Boolean))];
