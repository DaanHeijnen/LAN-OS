// Polls: one main poll plus side polls. Results are visible at once, votes can be changed
// for a short while, and a poll closes on its timer, when everyone has voted, or by hand.
import { durationToSeconds, type PollInfo } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent } from '../db/events.ts';

/** Closed polls stay on screens this long so everyone sees the result. */
const SHOW_CLOSED_MS = 10 * 60_000;
export const YES_NO_MAYBE = ['Yes', 'No', 'Maybe'];

interface PollRow {
  id: number; created_by: string; question: string; mode: 'choice' | 'yes_no_maybe'; options: string; anonymous: number;
  is_main: number; created_at: string; closes_at: string; closed_at: string | null; close_reason: PollInfo['closeReason']; winner: number | null;
}
interface VoteRow { player_id: string; option_index: number; first_voted_at: string }

export class PollError extends Error {}

export interface PollsOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  playerIds: () => string[];
  nickname: (id: string) => string;
  submissionsBlocked: () => string | null;
  onClosed: (poll: PollInfo) => void;
  onChange: () => void;
  now?: () => Date;
}

export class Polls {
  private readonly o: PollsOptions;
  private readonly now: () => Date;

  constructor(options: PollsOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
  }

  private openRows(): PollRow[] {
    return this.o.db.prepare('SELECT * FROM polls WHERE lan_id = ? AND closed_at IS NULL ORDER BY created_at').all(this.o.lanId()) as PollRow[];
  }

  private row(id: number): PollRow {
    const row = this.o.db.prepare('SELECT * FROM polls WHERE id = ? AND lan_id = ?').get(id, this.o.lanId()) as PollRow | undefined;
    if (!row) throw new PollError('That poll no longer exists.');
    return row;
  }

  private votes(pollId: number): VoteRow[] {
    return this.o.db.prepare('SELECT player_id, option_index, first_voted_at FROM poll_votes WHERE poll_id = ?').all(pollId) as VoteRow[];
  }

  create(playerId: string, input: { question: string; mode: 'choice' | 'yes_no_maybe'; options: string[]; anonymous: boolean; minutes: number | null }): number {
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new PollError(blocked);
    const options = input.mode === 'yes_no_maybe' ? YES_NO_MAYBE : [...new Set(input.options.map(o => o.trim()).filter(Boolean))];
    if (options.length < 2) throw new PollError('Add at least two different choices.');
    const open = this.openRows();
    const hasMain = open.some(p => p.is_main === 1);
    const sides = open.filter(p => p.is_main === 0).length;
    const maxSides = this.o.store.get('voting').max_side_polls;
    if (hasMain && sides >= maxSides) {
      throw new PollError(maxSides === 0 ? 'A poll is already running. Wait until it closes.' : `${open.length} polls are already running. Wait until one closes.`);
    }
    const now = this.now();
    const seconds = input.minutes ? input.minutes * 60 : durationToSeconds(this.o.store.get('voting').default_poll_timer);
    const result = this.o.db.prepare(`INSERT INTO polls (lan_id, created_by, question, mode, options, anonymous, is_main, created_at, closes_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(this.o.lanId(), playerId, input.question.trim(), input.mode, JSON.stringify(options),
      input.anonymous ? 1 : 0, hasMain ? 0 : 1, now.toISOString(), new Date(now.getTime() + seconds * 1000).toISOString());
    this.o.onChange();
    return Number(result.lastInsertRowid);
  }

  vote(playerId: string, pollId: number, option: number): void {
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new PollError(blocked);
    const poll = this.row(pollId);
    if (poll.closed_at) throw new PollError('This poll has closed.');
    const options = JSON.parse(poll.options) as string[];
    if (option < 0 || option >= options.length) throw new PollError('That choice does not exist.');
    const now = this.now();
    const existing = this.votes(pollId).find(v => v.player_id === playerId);
    if (existing) {
      if (existing.option_index === option) return;
      const window = durationToSeconds(this.o.store.get('voting').change_vote_window) * 1000;
      if (now.getTime() - Date.parse(existing.first_voted_at) > window) throw new PollError('Your vote is locked in; the time to change it has passed.');
      this.o.db.prepare('UPDATE poll_votes SET option_index = ?, voted_at = ? WHERE poll_id = ? AND player_id = ?').run(option, now.toISOString(), pollId, playerId);
    } else {
      this.o.db.prepare('INSERT INTO poll_votes (poll_id, player_id, option_index, first_voted_at, voted_at) VALUES (?, ?, ?, ?, ?)')
        .run(pollId, playerId, option, now.toISOString(), now.toISOString());
    }
    // Anonymous polls don't record who voted in the shared history.
    appendEvent(this.o.db, this.o.lanId(), 'vote_cast', poll.anonymous ? null : playerId,
      { poll_id: pollId, question: poll.question, option: options[option], changed: !!existing }, now);
    this.o.onChange();
    this.closeIfDone(pollId);
  }

  /** Closes a poll. For a tie, the host can pass the winning option. */
  close(pollId: number, by: { playerId: string | null; isAdmin: boolean }, winner?: number | null): void {
    const poll = this.row(pollId);
    if (poll.closed_at) {
      // Deciding a tie after the poll closed by itself.
      if (by.isAdmin && winner !== undefined && winner !== null && poll.winner === null) {
        this.o.db.prepare('UPDATE polls SET winner = ? WHERE id = ?').run(winner, pollId);
        this.o.onChange();
        return;
      }
      throw new PollError('This poll has already closed.');
    }
    if (!by.isAdmin && by.playerId !== poll.created_by) throw new PollError('Only the creator or an admin can close this poll.');
    this.finish(poll, by.isAdmin && by.playerId !== poll.created_by ? 'admin' : 'creator', winner ?? undefined);
  }

  remove(pollId: number): void {
    const poll = this.row(pollId);
    this.o.db.prepare("UPDATE polls SET closed_at = COALESCE(closed_at, ?), close_reason = 'removed' WHERE id = ?").run(this.now().toISOString(), poll.id);
    this.o.onChange();
  }

  /** Called every few seconds: closes polls whose timer ran out. */
  tick(): void {
    for (const poll of this.openRows()) {
      if (Date.parse(poll.closes_at) <= this.now().getTime()) this.finish(poll, 'timer');
    }
  }

  private closeIfDone(pollId: number): void {
    const poll = this.row(pollId);
    const voters = new Set(this.votes(pollId).map(v => v.player_id));
    if (!poll.closed_at && this.o.playerIds().every(id => voters.has(id))) this.finish(poll, 'everyone_voted');
  }

  private finish(poll: PollRow, reason: NonNullable<PollInfo['closeReason']>, chosen?: number): void {
    const counts = this.counts(poll);
    const max = Math.max(...counts);
    const leaders = counts.flatMap((c, i) => (c === max && max > 0 ? [i] : []));
    const winner = chosen ?? (leaders.length === 1 ? leaders[0]! : null);
    this.o.db.prepare('UPDATE polls SET closed_at = ?, close_reason = ?, winner = ? WHERE id = ?')
      .run(this.now().toISOString(), reason, winner, poll.id);
    this.o.onClosed(this.toInfo(this.row(poll.id), null));
    this.o.onChange();
  }

  private counts(poll: PollRow): number[] {
    const counts = (JSON.parse(poll.options) as string[]).map(() => 0);
    for (const v of this.votes(poll.id)) counts[v.option_index] = (counts[v.option_index] ?? 0) + 1;
    return counts;
  }

  private toInfo(poll: PollRow, viewer: string | null): PollInfo {
    const options = JSON.parse(poll.options) as string[];
    const votes = this.votes(poll.id);
    const counts = this.counts(poll);
    const mine = viewer ? votes.find(v => v.player_id === viewer) : undefined;
    const window = durationToSeconds(this.o.store.get('voting').change_vote_window) * 1000;
    const max = Math.max(...counts);
    return {
      id: poll.id, question: poll.question, mode: poll.mode, options, counts,
      votersByOption: poll.anonymous ? options.map(() => []) : options.map((_, i) => votes.filter(v => v.option_index === i).map(v => this.o.nickname(v.player_id))),
      anonymous: poll.anonymous === 1, isMain: poll.is_main === 1,
      createdBy: this.o.nickname(poll.created_by), createdById: poll.created_by,
      createdAt: poll.created_at, closesAt: poll.closes_at, closedAt: poll.closed_at, closeReason: poll.close_reason, winner: poll.winner,
      tie: !!poll.closed_at && poll.winner === null && max > 0 && counts.filter(c => c === max).length > 1,
      voted: votes.length, eligible: this.o.playerIds().length,
      myVote: mine?.option_index ?? null,
      changeUntil: mine && !poll.closed_at ? new Date(Date.parse(mine.first_voted_at) + window).toISOString() : null,
    };
  }

  /** Open polls first (main poll on top), then polls that closed in the last minutes. */
  list(viewer: string | null): PollInfo[] {
    const since = new Date(this.now().getTime() - SHOW_CLOSED_MS).toISOString();
    const rows = this.o.db.prepare(`SELECT * FROM polls WHERE lan_id = ? AND (closed_at IS NULL OR (closed_at >= ? AND close_reason != 'removed'))
      ORDER BY closed_at IS NOT NULL, is_main DESC, created_at DESC`).all(this.o.lanId(), since) as PollRow[];
    return rows.map(r => this.toInfo(r, viewer));
  }
}
