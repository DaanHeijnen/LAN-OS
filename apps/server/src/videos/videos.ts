// YouTube videos on the projector. Players share a link, videos play one at a time and take over the whole
// wall, and admins can skip or stop them. The queue lives in memory: after a restart it starts empty.
import { randomUUID } from 'node:crypto';
import { durationToSeconds, youTubeStartSeconds, youTubeVideoId, type VideoInfo, type VideoItem } from '@lan-os/shared';
import type { ConfigStore } from '../config/store.ts';
import { log } from '../logging.ts';

/** Extra time after the video's own length, so the wall's "ended" normally arrives first. */
const END_GRACE_MS = 5_000;
const TITLE_TIMEOUT_MS = 4_000;

export class VideoError extends Error {}

/** The title of a video, null when YouTube says it can't be embedded, or undefined when YouTube can't be reached. */
export type TitleLookup = (videoId: string) => Promise<string | null | undefined>;

/** Asks YouTube's public oEmbed endpoint (no key needed). It refuses private videos and ones that can't be embedded. */
export const youTubeTitle: TitleLookup = async videoId => {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TITLE_TIMEOUT_MS) });
    if (response.status === 401 || response.status === 403 || response.status === 404) return null;
    if (!response.ok) return undefined;
    const body = await response.json() as { title?: unknown };
    return typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : undefined;
  } catch {
    return undefined;
  }
};

export interface VideosOptions {
  store: ConfigStore;
  nickname: (id: string) => string;
  submissionsBlocked: () => string | null;
  onChange: () => void;
  lookupTitle?: TitleLookup;
  now?: () => Date;
}

type Playing = NonNullable<VideoInfo['now']>;

export class Videos {
  private readonly o: VideosOptions;
  private readonly now: () => Date;
  private readonly lookupTitle: TitleLookup;
  private queue: VideoItem[] = [];
  private playing: Playing | null = null;
  private nextId = 1;

  constructor(options: VideosOptions) {
    this.o = options;
    this.now = options.now ?? (() => new Date());
    this.lookupTitle = options.lookupTitle ?? youTubeTitle;
  }

  private maxSeconds(): number {
    return durationToSeconds(this.o.store.get('wall').youtube_max_length);
  }

  async share(playerId: string, link: string): Promise<VideoItem> {
    const blocked = this.o.submissionsBlocked();
    if (blocked) throw new VideoError(blocked);
    const wall = this.o.store.get('wall');
    if (!wall.youtube_videos) throw new VideoError('Sharing videos is turned off.');
    const videoId = youTubeVideoId(link);
    if (!videoId) throw new VideoError('That is not a YouTube video link. Copy the link from the Share button on YouTube.');
    if (this.playing?.videoId === videoId || this.queue.some(v => v.videoId === videoId)) throw new VideoError('That video is already on the projector or in the queue.');
    const mine = this.queue.filter(v => v.sharedById === playerId).length;
    if (mine >= wall.youtube_queue_per_player) {
      throw new VideoError(wall.youtube_queue_per_player === 1 ? 'You already have a video waiting. Wait until it has played.'
        : `You already have ${mine} videos waiting. Wait until one has played.`);
    }
    const title = await this.lookupTitle(videoId);
    if (title === null) throw new VideoError('YouTube does not allow this video to play on other sites. Try another one.');
    const item: VideoItem = {
      id: this.nextId++, videoId, title: title ?? 'YouTube video', sharedBy: this.o.nickname(playerId), sharedById: playerId,
      startSeconds: youTubeStartSeconds(link),
    };
    this.queue.push(item);
    log.info(`Video shared by ${item.sharedBy}: ${item.title}`);
    if (!this.playing) this.playNext();
    else this.o.onChange();
    return item;
  }

  /** The projector reports on the video it plays. Reports for an earlier video are ignored. */
  report(playId: string, event: 'started' | 'ended' | 'error', durationSeconds?: number): void {
    const playing = this.playing;
    if (!playing || playing.playId !== playId) return;
    if (event === 'started') {
      if (!durationSeconds) return;
      const left = Math.max(1, durationSeconds - playing.startSeconds);
      const ms = Math.min(left, this.maxSeconds()) * 1000 + (left <= this.maxSeconds() ? END_GRACE_MS : 0);
      playing.endsAt = new Date(Date.parse(playing.startedAt) + ms).toISOString();
      this.o.onChange();
      return;
    }
    if (event === 'error') log.warn(`The projector could not play "${playing.title}"; moving on.`);
    this.playNext();
  }

  /** Called every few seconds: moves on when the video's time is up. */
  tick(): void {
    if (this.playing && Date.parse(this.playing.endsAt) <= this.now().getTime()) this.playNext();
  }

  skip(): void {
    if (!this.playing) throw new VideoError('No video is playing.');
    this.playNext();
  }

  /** Stops the video and clears the queue: the wall comes straight back. */
  stop(): void {
    this.playing = null;
    this.queue = [];
    this.o.onChange();
  }

  /** Takes a waiting video out of the queue. Players can remove their own; admins any. */
  remove(id: number, by: { playerId: string | null; isAdmin: boolean }): void {
    const item = this.queue.find(v => v.id === id);
    if (!item) throw new VideoError('That video is no longer in the queue.');
    if (!by.isAdmin && item.sharedById !== by.playerId) throw new VideoError('Only the player who shared it or an admin can remove it.');
    this.queue = this.queue.filter(v => v.id !== id);
    this.o.onChange();
  }

  private playNext(): void {
    const next = this.queue.shift();
    const now = this.now();
    this.playing = next ? {
      ...next, playId: randomUUID(), startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + this.maxSeconds() * 1000).toISOString(),
    } : null;
    this.o.onChange();
  }

  info(): VideoInfo {
    return {
      enabled: this.o.store.get('wall').youtube_videos,
      maxSeconds: this.maxSeconds(),
      now: this.playing ? { ...this.playing } : null,
      queue: this.queue.map(v => ({ ...v })),
    };
  }
}
