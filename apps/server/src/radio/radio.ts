// LAN Radio: LAN OS keeps its own fair queue and hands Spotify the next request shortly
// before the current song ends. Every song played is logged with its requester.
import { durationToSeconds, type RadioInfo } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent } from '../db/events.ts';
import { log } from '../logging.ts';
import { fairOrder } from './fair-queue.ts';
import { MusicError, playlistUriFromLink, trackUriFromLink, type MusicService, type Playback, type Track } from './music.ts';

const POLL_MS = 3000;
/** A song handed to Spotify that still hasn't started after this long is considered lost. */
const SENT_TIMEOUT_MS = 15 * 60_000;
/** Back off while Spotify is unreachable, then retry by itself. */
const OFFLINE_RETRY_MS = 15_000;

interface RequestRow {
  id: number; player_id: string; track_uri: string; title: string; artist: string; album_art: string | null;
  duration_ms: number; state: 'waiting' | 'sent' | 'playing' | 'played' | 'removed' | 'skipped';
  requested_at: string; sent_at: string | null; started_at: string | null;
}

export interface RadioOptions {
  db: Db;
  store: ConfigStore;
  /** null while Spotify isn't set up or connected. */
  music: () => MusicService | null;
  notSetUpReason: () => string;
  lanId: () => string;
  nickname: (playerId: string) => string;
  requestsBlocked: () => string | null;
  onChange: () => void;
  now?: () => Date;
}

export class RadioError extends Error {}

export class Radio {
  private readonly o: RadioOptions;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | undefined;
  private playback: Playback | null = null;
  private playbackAt = new Date(0);
  private offlineReason: string | null = null;
  private lastTrackUri: string | null = null;
  private skipVotes = new Map<string, Set<string>>();
  private fallbackStarted = false;
  private busy = false;

  constructor(options: RadioOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    const loop = () => {
      void this.tick().finally(() => {
        this.timer = setTimeout(loop, this.offlineReason ? OFFLINE_RETRY_MS : POLL_MS);
      });
    };
    loop();
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  private get enabled(): boolean {
    return this.o.store.get('integrations').spotify_enabled;
  }

  private rows(states: RequestRow['state'][]): RequestRow[] {
    return this.o.db.prepare(
      `SELECT * FROM radio_requests WHERE lan_id = ? AND state IN (${states.map(() => '?').join(',')}) ORDER BY requested_at, id`,
    ).all(this.o.lanId(), ...states) as RequestRow[];
  }

  private setState(id: number, state: RequestRow['state'], column?: 'sent_at' | 'started_at' | 'ended_at'): void {
    this.o.db.prepare(`UPDATE radio_requests SET state = ?${column ? `, ${column} = ?` : ''} WHERE id = ?`)
      .run(...(column ? [state, this.now().toISOString(), id] : [state, id]));
  }

  /** The waiting requests in the order they will play. */
  private fairWaiting(): RequestRow[] {
    const served = this.o.db.prepare(`SELECT player_id, MAX(COALESCE(sent_at, requested_at)) AS at FROM radio_requests
      WHERE lan_id = ? AND state IN ('sent', 'playing', 'played', 'skipped') GROUP BY player_id`).all(this.o.lanId()) as Array<{ player_id: string; at: string }>;
    const waiting = this.rows(['waiting']).map(r => ({ ...r, playerId: r.player_id, requestedAt: r.requested_at }));
    return fairOrder(waiting, new Map(served.map(s => [s.player_id, s.at])), this.o.store.get('music').dj_rotation);
  }

  // --- The loop ---

  async tick(): Promise<void> {
    const music = this.o.music();
    if (!this.enabled || !music || this.busy) {
      this.playback = null;
      return;
    }
    this.busy = true;
    try {
      const playback = await music.playback();
      if (this.offlineReason) log.info('LAN Radio is back online.');
      this.offlineReason = null;
      this.playback = playback;
      this.playbackAt = this.now();
      await this.follow(playback, music);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof MusicError && !error.offline) {
        log.warn(`LAN Radio: ${message}`);
      } else {
        if (this.offlineReason !== message) log.warn(`LAN Radio offline: ${message}`);
        this.offlineReason = message;
        this.playback = null;
      }
    } finally {
      this.busy = false;
      this.o.onChange();
    }
  }

  private async follow(playback: Playback | null, music: MusicService): Promise<void> {
    const current = playback?.track ?? null;
    const lanId = this.o.lanId();

    // A new song started: close the previous one and log this one.
    if (current && current.uri !== this.lastTrackUri) {
      for (const playing of this.rows(['playing'])) this.setState(playing.id, 'played', 'ended_at');
      const ours = this.rows(['sent']).find(r => r.track_uri === current.uri);
      if (ours) this.setState(ours.id, 'playing', 'started_at');
      appendEvent(this.o.db, lanId, 'song_played', ours?.player_id ?? null,
        { uri: current.uri, title: current.title, artist: current.artist, request_id: ours?.id ?? null }, this.now());
      this.lastTrackUri = current.uri;
      this.skipVotes.clear();
      this.fallbackStarted = false;
    }

    // Requests handed over but never started (e.g. Spotify's queue was cleared).
    for (const sent of this.rows(['sent'])) {
      if (this.now().getTime() - Date.parse(sent.sent_at ?? sent.requested_at) > SENT_TIMEOUT_MS) this.setState(sent.id, 'played', 'ended_at');
    }

    const next = this.fairWaiting()[0];
    const nothingPlaying = !playback || !current
      || (!playback.isPlaying && (playback.positionMs === 0 || playback.positionMs >= current.durationMs - 1500));
    const manuallyPaused = playback && current && !playback.isPlaying && !nothingPlaying;
    if (manuallyPaused) return;

    if (next && nothingPlaying) {
      await music.playTrack(next.track_uri);
      this.setState(next.id, 'sent', 'sent_at');
      return;
    }
    const handOver = durationToSeconds(this.o.store.get('music').hand_over_before_end) * 1000;
    const remaining = current && playback ? current.durationMs - playback.positionMs : Infinity;
    if (next && remaining <= handOver && this.rows(['sent']).length === 0) {
      await music.addToQueue(next.track_uri);
      this.setState(next.id, 'sent', 'sent_at');
      return;
    }
    // Queue empty and nothing playing: the normal playlist continues.
    const fallback = playlistUriFromLink(this.o.store.get('music').fallback_playlist);
    if (!next && nothingPlaying && fallback && !this.fallbackStarted && playback) {
      this.fallbackStarted = true;
      await music.playContext(fallback);
    }
  }

  // --- People ---

  async search(query: string): Promise<Track[]> {
    const music = this.ready();
    return query.trim() ? music.search(query.trim()) : [];
  }

  async request(playerId: string, input: { uri?: string; link?: string }): Promise<Track> {
    const music = this.ready();
    const blocked = this.o.requestsBlocked();
    if (blocked) throw new RadioError(blocked);
    const uri = input.uri ?? (input.link ? trackUriFromLink(input.link) : null);
    if (!uri || !/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) {
      throw new RadioError('Paste a Spotify song link (open.spotify.com/track/…), or pick a song from the search.');
    }
    if (this.o.store.get('music').block_duplicates) {
      const pending = this.rows(['waiting', 'sent', 'playing']).find(r => r.track_uri === uri);
      if (pending) throw new RadioError(`"${pending.title}" is already in the queue (requested by ${this.o.nickname(pending.player_id)}).`);
    }
    const track = await music.track(uri);
    const result = this.o.db.prepare(`INSERT INTO radio_requests (lan_id, player_id, track_uri, title, artist, album_art, duration_ms, state, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`).run(this.o.lanId(), playerId, track.uri, track.title, track.artist, track.albumArt, track.durationMs, this.now().toISOString());
    appendEvent(this.o.db, this.o.lanId(), 'song_requested', playerId,
      { uri: track.uri, title: track.title, artist: track.artist, request_id: Number(result.lastInsertRowid) }, this.now());
    this.o.onChange();
    void this.tick();
    return track;
  }

  /** Players can remove their own request until it's handed to Spotify. Admins can remove any. */
  remove(playerId: string | null, requestId: number, asAdmin: boolean): void {
    const row = this.o.db.prepare('SELECT * FROM radio_requests WHERE id = ?').get(requestId) as RequestRow | undefined;
    if (!row || row.state !== 'waiting') throw new RadioError('That song has already been sent to Spotify, so it can no longer be removed.');
    if (!asAdmin && row.player_id !== playerId) throw new RadioError('You can only remove your own requests.');
    this.setState(row.id, 'removed', 'ended_at');
    this.o.onChange();
  }

  async voteSkip(playerId: string, playerCount: number): Promise<{ skipped: boolean }> {
    const music = this.ready();
    const uri = this.playback?.track?.uri;
    if (!uri) throw new RadioError('Nothing is playing right now.');
    const votes = this.skipVotes.get(uri) ?? new Set<string>();
    votes.add(playerId);
    this.skipVotes.set(uri, votes);
    if (votes.size >= this.skipNeeded(playerCount)) {
      await this.skip(music);
      return { skipped: true };
    }
    this.o.onChange();
    return { skipped: false };
  }

  private skipNeeded(playerCount: number): number {
    return Math.max(1, Math.min(this.o.store.get('music').skip_vote_threshold, playerCount));
  }

  private async skip(music: MusicService): Promise<void> {
    for (const playing of this.rows(['playing'])) this.setState(playing.id, 'skipped', 'ended_at');
    this.skipVotes.clear();
    await music.next();
    void this.tick();
  }

  async control(action: 'pause' | 'resume' | 'skip' | 'volume', volume?: number): Promise<void> {
    const music = this.ready();
    if (action === 'pause') await music.pause();
    if (action === 'resume') await music.resume();
    if (action === 'skip') await this.skip(music);
    if (action === 'volume' && volume !== undefined) await music.setVolume(Math.max(0, Math.min(100, volume)));
    void this.tick();
  }

  private ready(): MusicService {
    const music = this.o.music();
    if (!this.enabled || !music) throw new RadioError(`LAN Radio is offline: ${this.o.notSetUpReason()}`);
    if (this.offlineReason) throw new RadioError(`LAN Radio is offline: ${this.offlineReason} LAN OS keeps retrying by itself.`);
    return music;
  }

  get online(): boolean {
    return this.enabled && this.o.music() !== null && this.offlineReason === null;
  }

  get problem(): string | null {
    if (!this.enabled) return null;
    if (!this.o.music()) return this.o.notSetUpReason();
    return this.offlineReason;
  }

  // --- For the screens ---

  info(playerCount: number): RadioInfo {
    const music = this.o.store.get('music');
    const status: RadioInfo['status'] = !this.enabled ? 'off' : !this.o.music() || this.offlineReason ? 'offline' : 'ok';
    const current = this.playback?.track ?? null;
    const playingRow = current ? this.rows(['playing']).find(r => r.track_uri === current.uri) : undefined;
    const requested = this.rows(['sent']).concat(this.fairWaiting());
    const history = this.o.db.prepare(`SELECT player_id, data, occurred_at FROM events WHERE lan_id = ? AND type = 'song_played'
      ORDER BY occurred_at DESC, id DESC LIMIT 11`).all(this.o.lanId()) as Array<{ player_id: string | null; data: string; occurred_at: string }>;
    const votes = current ? this.skipVotes.get(current.uri) : undefined;
    const blocked = this.o.requestsBlocked();
    return {
      status,
      message: status === 'off' ? 'LAN Radio is switched off in integrations.yaml.'
        : status === 'offline' ? (this.offlineReason ?? this.o.notSetUpReason()) : null,
      now: current && this.playback ? {
        title: current.title, artist: current.artist, albumArt: current.albumArt, durationMs: current.durationMs,
        positionMs: this.playback.positionMs, isPlaying: this.playback.isPlaying, at: this.playbackAt.toISOString(),
        requester: playingRow ? this.o.nickname(playingRow.player_id) : null, requesterId: playingRow?.player_id ?? null,
      } : null,
      queue: requested.map(r => ({
        id: r.id, title: r.title, artist: r.artist, albumArt: r.album_art, durationMs: r.duration_ms,
        requester: this.o.nickname(r.player_id), requesterId: r.player_id, state: r.state === 'sent' ? 'sent' : 'waiting',
      })),
      requestsOpen: status === 'ok' && !blocked,
      requestsClosedReason: blocked,
      skip: { votes: votes?.size ?? 0, needed: this.skipNeeded(playerCount), voters: [...(votes ?? [])] },
      volume: this.playback?.volume ?? null,
      permissions: { pause: music.who_can_pause, skip: music.who_can_skip, volume: music.who_can_change_volume },
      history: history.slice(current ? 1 : 0, 11).map(h => {
        const d = JSON.parse(h.data) as { title?: string; artist?: string };
        return { title: d.title ?? '?', artist: d.artist ?? '', requester: h.player_id ? this.o.nickname(h.player_id) : null, playedAt: h.occurred_at };
      }),
      fallbackPlaylist: playlistUriFromLink(music.fallback_playlist) !== null,
    };
  }
}
