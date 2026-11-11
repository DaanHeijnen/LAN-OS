// The game pot: players throw in games they'd like to play. Before the tournament starts, an admin
// draws a few at random; they join the lineup as wildcards and the wall announces them.
import { durationToSeconds, type GamePotEntry, type GamePotInfo, type PotEntryState } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { getRuntimeState, setRuntimeState } from '../db/profiles.ts';
import { TournamentError, type Tournament } from './tournament.ts';

interface EntryRow {
  id: number; player_id: string; name: string; link: string | null; how: string | null; state: PotEntryState;
  note: string | null; draw_order: number | null; tournament_id: number | null; tournament_game_id: number | null;
}

/** Shown as a 400 with its message, like every tournament problem. */
export class PotError extends TournamentError {}

export interface GamePotOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  playerIds: () => string[];
  nickname: (id: string) => string;
  tournament: Tournament;
  /** A reason when the host paused new submissions, otherwise null. */
  submissionsBlocked: () => string | null;
  announce: (text: string, ms: number) => void;
  onChange: () => void;
  now?: () => Date;
  random?: () => number;
}

export class GamePot {
  private readonly o: GamePotOptions;
  private readonly now: () => Date;
  private readonly random: () => number;

  constructor(options: GamePotOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  private get config() {
    return this.o.store.get('tournament');
  }

  private entries(): EntryRow[] {
    return this.o.db.prepare('SELECT * FROM game_pot WHERE lan_id = ? ORDER BY id').all(this.o.lanId()) as EntryRow[];
  }

  private entry(id: number): EntryRow {
    const row = this.entries().find(e => e.id === id);
    if (!row) throw new PotError('That game is no longer in the pot.');
    return row;
  }

  private isOpen(): boolean {
    return !getRuntimeState(this.o.db).game_pot_closed.includes(this.o.lanId());
  }

  /** Games that still count towards a player's limit (rejected ones don't). */
  private countFor(playerId: string): number {
    return this.entries().filter(e => e.player_id === playerId && e.state !== 'rejected').length;
  }

  // --- Players ---

  add(playerId: string, input: { name: string; link?: string; how?: string }): number {
    const perPlayer = this.config.pot_games_per_player;
    if (perPlayer === 0) throw new PotError('The game pot is turned off.');
    if (!this.isOpen()) throw new PotError('The game pot is closed.');
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new PotError(blocked);
    if (!this.o.playerIds().includes(playerId)) throw new PotError('You are not on the player list.');
    if (this.countFor(playerId) >= perPlayer) {
      throw new PotError(perPlayer === 1 ? 'You already have a game in the pot. Remove it first to add another one.'
        : `You already have ${perPlayer} games in the pot, the most you can add.`);
    }
    const name = input.name.trim();
    const same = this.entries().find(e => e.state !== 'rejected' && e.name.toLowerCase() === name.toLowerCase());
    if (same) throw new PotError(`${same.name} is already in the pot (from ${this.o.nickname(same.player_id)}).`);
    const state: PotEntryState = this.config.pot_needs_approval ? 'waiting' : 'approved';
    const result = this.o.db.prepare(`INSERT INTO game_pot (lan_id, player_id, name, link, how, state, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(this.o.lanId(), playerId, name, input.link?.trim() || null, input.how?.trim() || null,
      state, this.now().toISOString());
    this.o.onChange();
    return Number(result.lastInsertRowid);
  }

  /** The player who added a game, or an admin, takes it out again. Drawn games stay. */
  remove(id: number, who: { playerId: string | null; isAdmin: boolean }): void {
    const row = this.entry(id);
    if (!who.isAdmin && row.player_id !== who.playerId) throw new PotError('You can only remove your own game.');
    if (row.state === 'drawn') throw new PotError('This game was drawn and is in the lineup. Remove it from the lineup instead.');
    this.o.db.prepare('DELETE FROM game_pot WHERE id = ?').run(id);
    this.o.onChange();
  }

  // --- Admins ---

  review(id: number, action: 'approve' | 'reject', note?: string): void {
    const row = this.entry(id);
    if (row.state === 'drawn') throw new PotError('This game was already drawn.');
    this.o.db.prepare('UPDATE game_pot SET state = ?, note = ? WHERE id = ?')
      .run(action === 'approve' ? 'approved' : 'rejected', action === 'reject' ? note?.trim() || null : null, id);
    this.o.onChange();
  }

  setOpen(open: boolean): void {
    const closed = getRuntimeState(this.o.db).game_pot_closed.filter(lan => lan !== this.o.lanId());
    setRuntimeState(this.o.db, { game_pot_closed: open ? closed : [...closed, this.o.lanId()] }, this.now());
    this.o.onChange();
  }

  /** Why a draw can't happen now, or null. */
  private drawBlocked(rows: EntryRow[]): string | null {
    const t = this.o.tournament.currentTournament();
    if (!t) return 'Set up the tournament first. The drawn games join its lineup.';
    if (t.state === 'finished') return 'The tournament is finished.';
    if (rows.some(e => e.state === 'drawn' && e.tournament_id === t.id)) return 'The pot has already been drawn for this tournament.';
    if (!rows.some(e => e.state === 'approved')) {
      return rows.some(e => e.state === 'waiting') ? 'Approve at least one game first.' : 'There are no games in the pot yet.';
    }
    return null;
  }

  /** Picks pot_draw_count approved games at random, adds them to the lineup, closes the pot and tells the wall. */
  draw(): Array<{ name: string; addedBy: string }> {
    const rows = this.entries();
    const blocked = this.drawBlocked(rows);
    if (blocked) throw new PotError(blocked);
    const pool = rows.filter(e => e.state === 'approved');
    // Fisher–Yates, then take the first few.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const picked = pool.slice(0, this.config.pot_draw_count);
    const tournament = this.o.tournament.currentTournament()!;
    const now = this.now().toISOString();
    this.o.db.transaction(() => {
      const gameIds = this.o.tournament.addDrawnGames(picked.map(e => e.name), this.config.pot_draw_positions);
      const update = this.o.db.prepare(`UPDATE game_pot SET state = 'drawn', drawn_at = ?, draw_order = ?, tournament_id = ?,
        tournament_game_id = ? WHERE id = ?`);
      picked.forEach((e, i) => update.run(now, i + 1, tournament.id, gameIds[i]!, e.id));
      const closed = getRuntimeState(this.o.db).game_pot_closed.filter(lan => lan !== this.o.lanId());
      setRuntimeState(this.o.db, { game_pot_closed: [...closed, this.o.lanId()] }, this.now());
    })();
    const result = picked.map(e => ({ name: e.name, addedBy: this.o.nickname(e.player_id) }));
    const line = result.map((r, i) => `${result.length > 1 ? `Wildcard ${i + 1}: ` : ''}${r.name} (${r.addedBy}'s pick)`).join(' · ');
    this.o.announce(`From the game pot: ${line}`, durationToSeconds(this.config.result_on_wall) * 1000);
    this.o.onChange();
    return result;
  }

  // --- What the screens get ---

  /**
   * viewer: the signed-in player (their own rejected games are listed for them), or null.
   * admin: sees every game. hideNames: the wall while the host hides everyone's details.
   */
  info(viewer: { playerId: string | null; admin: boolean; hideNames: boolean }): GamePotInfo {
    const rows = this.entries();
    const entries: GamePotEntry[] = rows
      .filter(e => e.state !== 'rejected' || viewer.admin || e.player_id === viewer.playerId)
      .map(e => ({
        id: e.id, name: e.name, link: e.link, how: e.how,
        playerId: viewer.hideNames ? null : e.player_id,
        addedBy: viewer.hideNames ? 'A player' : this.o.nickname(e.player_id),
        state: e.state, note: e.note, drawOrder: e.draw_order, tournamentGameId: e.tournament_game_id,
      }));
    return {
      enabled: this.config.pot_games_per_player > 0,
      open: this.isOpen(),
      needsApproval: this.config.pot_needs_approval,
      perPlayer: this.config.pot_games_per_player,
      drawCount: this.config.pot_draw_count,
      drawBlocked: this.drawBlocked(rows),
      entries,
    };
  }
}
