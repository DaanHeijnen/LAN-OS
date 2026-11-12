import { describe, expect, it } from 'vitest';
import { youTubeStartSeconds, youTubeVideoId } from '@lan-os/shared';
import type { ConfigStore } from '../src/config/store.ts';
import { Videos, type TitleLookup } from '../src/videos/videos.ts';

describe('YouTube links', () => {
  it('finds the video id in the usual link shapes', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ]) expect(youTubeVideoId(link)).toBe('dQw4w9WgXcQ');
  });

  it('refuses other sites and broken ids', () => {
    for (const link of ['https://vimeo.com/123', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=short', 'not a link', ''])
      expect(youTubeVideoId(link)).toBeNull();
  });

  it('reads the start time', () => {
    expect(youTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90);
    expect(youTubeStartSeconds('https://youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(90);
    expect(youTubeStartSeconds('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(0);
  });
});

const A = 'https://youtu.be/aaaaaaaaaaa';
const B = 'https://youtu.be/bbbbbbbbbbb';
const C = 'https://youtu.be/ccccccccccc';

function setup(overrides: Record<string, unknown> = {}, lookupTitle: TitleLookup = async id => `Video ${id[0]}`) {
  const wall = { youtube_videos: true, youtube_max_length: '10m', youtube_queue_per_player: 1, ...overrides };
  const store = { get: () => wall } as unknown as ConfigStore;
  let now = new Date('2026-11-20T17:00:00Z');
  let blocked: string | null = null;
  const videos = new Videos({ store, nickname: id => id, submissionsBlocked: () => blocked, onChange: () => {}, lookupTitle, now: () => now });
  return { videos, later: (ms: number) => { now = new Date(now.getTime() + ms); }, block: (r: string | null) => { blocked = r; } };
}

describe('videos on the projector', () => {
  it('plays the first video at once and queues the rest', async () => {
    const { videos } = setup();
    await videos.share('mara', A);
    await videos.share('sam', B);
    expect(videos.info().now?.title).toBe('Video a');
    expect(videos.info().queue.map(v => v.title)).toEqual(['Video b']);
  });

  it('moves on when the wall reports the end, and ignores reports for an older video', async () => {
    const { videos } = setup();
    await videos.share('mara', A);
    const first = videos.info().now!.playId;
    await videos.share('sam', B);
    videos.report(first, 'ended');
    expect(videos.info().now?.title).toBe('Video b');
    videos.report(first, 'ended');
    expect(videos.info().now?.title).toBe('Video b');
  });

  it('ends on its own after the video length, and never later than the longest allowed', async () => {
    const { videos, later } = setup();
    await videos.share('mara', A);
    videos.report(videos.info().now!.playId, 'started', 60);
    later(70_000);
    videos.tick();
    expect(videos.info().now).toBeNull();

    await videos.share('mara', B);
    videos.report(videos.info().now!.playId, 'started', 3600);
    later(9 * 60_000);
    videos.tick();
    expect(videos.info().now).not.toBeNull();
    later(60_000);
    videos.tick();
    expect(videos.info().now).toBeNull();
  });

  it('lets admins skip and stop everything', async () => {
    const { videos } = setup({ youtube_queue_per_player: 2 });
    await videos.share('mara', A);
    await videos.share('mara', B);
    await videos.share('sam', C);
    videos.skip();
    expect(videos.info().now?.title).toBe('Video b');
    videos.stop();
    expect(videos.info()).toMatchObject({ now: null, queue: [] });
    expect(() => videos.skip()).toThrow(/No video/);
  });

  it('limits waiting videos per player and refuses duplicates', async () => {
    const { videos } = setup();
    await videos.share('mara', A);
    await videos.share('mara', B);
    await expect(videos.share('mara', C)).rejects.toThrow(/already have a video waiting/);
    await expect(videos.share('sam', A)).rejects.toThrow(/already on the projector/);
  });

  it('lets players remove only their own waiting video', async () => {
    const { videos } = setup();
    await videos.share('mara', A);
    await videos.share('sam', B);
    const id = videos.info().queue[0]!.id;
    expect(() => videos.remove(id, { playerId: 'tom', isAdmin: false })).toThrow(/Only the player/);
    videos.remove(id, { playerId: 'sam', isAdmin: false });
    expect(videos.info().queue).toEqual([]);
  });

  it('refuses links that are not YouTube, videos YouTube will not embed, and when sharing is off or paused', async () => {
    await expect(setup().videos.share('mara', 'https://vimeo.com/1')).rejects.toThrow(/not a YouTube/);
    await expect(setup({}, async () => null).videos.share('mara', A)).rejects.toThrow(/does not allow/);
    await expect(setup({ youtube_videos: false }).videos.share('mara', A)).rejects.toThrow(/turned off/);
    const paused = setup();
    paused.block('The host has paused new requests for a moment.');
    await expect(paused.videos.share('mara', A)).rejects.toThrow(/paused/);
  });

  it('still works when YouTube cannot be reached for the title', async () => {
    const { videos } = setup({}, async () => undefined);
    await videos.share('mara', A);
    expect(videos.info().now?.title).toBe('YouTube video');
  });
});
