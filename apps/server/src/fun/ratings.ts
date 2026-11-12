// Song ratings: a thumbs up or down on the song LAN Radio plays now. One thumb per player per play,
// and nobody rates their own request. LAN Wrapped uses them for the best-rated songs and DJ.
import type { SongRatingInfo } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';

export class RatingError extends Error {}

export interface CurrentPlay { eventId: number; requesterId: string | null; title: string }

export interface SongRatingsOptions {
  db: Db;
  store: ConfigStore;
  lanId: () => string;
  currentPlay: () => CurrentPlay | null;
  submissionsBlocked: () => string | null;
  /** After every thumbs up, with the play's total thumbs up (for the Crowd Pleaser achievement). */
  onThumbsUp: (play: CurrentPlay, ups: number) => void;
  onChange: () => void;
  now?: () => Date;
}

export class SongRatings {
  private readonly o: SongRatingsOptions;
  private readonly now: () => Date;

  constructor(options: SongRatingsOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
  }

  private get enabled(): boolean {
    return this.o.store.get('music').song_ratings;
  }

  /** 1 = thumbs up, -1 = thumbs down, 0 = take the thumb back. */
  rate(playerId: string, rating: 1 | -1 | 0): void {
    if (!this.enabled) throw new RatingError('Song ratings are switched off.');
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new RatingError(blocked);
    const play = this.o.currentPlay();
    if (!play) throw new RatingError('No song is playing right now.');
    if (play.requesterId === playerId) throw new RatingError('You can\'t rate your own request.');
    if (rating === 0) {
      this.o.db.prepare('DELETE FROM song_ratings WHERE play_event_id = ? AND player_id = ?').run(play.eventId, playerId);
    } else {
      this.o.db.prepare(`INSERT INTO song_ratings (lan_id, play_event_id, player_id, rating, rated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (play_event_id, player_id) DO UPDATE SET rating = excluded.rating, rated_at = excluded.rated_at`)
        .run(this.o.lanId(), play.eventId, playerId, rating, this.now().toISOString());
    }
    if (rating === 1) this.o.onThumbsUp(play, this.counts(play.eventId).up);
    this.o.onChange();
  }

  private counts(eventId: number): { up: number; down: number } {
    const row = this.o.db.prepare(`SELECT COALESCE(SUM(rating = 1), 0) AS up, COALESCE(SUM(rating = -1), 0) AS down
      FROM song_ratings WHERE play_event_id = ?`).get(eventId) as { up: number; down: number };
    return { up: row.up, down: row.down };
  }

  /** Thumbs on the song playing now, with the viewer's own thumb. Null when ratings are off or nothing plays. */
  info(viewer: string | null): SongRatingInfo | null {
    const play = this.o.currentPlay();
    if (!this.enabled || !play) return null;
    const mine = viewer
      ? (this.o.db.prepare('SELECT rating FROM song_ratings WHERE play_event_id = ? AND player_id = ?').pluck().get(play.eventId, viewer) as 1 | -1 | undefined)
      : undefined;
    return { ...this.counts(play.eventId), mine: mine ?? null };
  }
}
