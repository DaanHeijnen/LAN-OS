// A YouTube video a player shared, filling the whole projector. Always muted: the wall makes no sound.
// The projector tells the server when the video starts (with its length), ends or can't play,
// so the server moves on to the next one.
import { useEffect, useRef } from 'react';
import type { VideoInfo } from '@lan-os/shared';
import { api } from '../live.ts';

type Playing = NonNullable<VideoInfo['now']>;

// The small part of YouTube's IFrame Player API that LAN OS uses.
interface YTPlayer { mute(): void; playVideo(): void; getDuration(): number; destroy(): void }
interface YTNamespace {
  Player: new (el: HTMLElement, options: {
    videoId: string;
    width?: string; height?: string;
    playerVars?: Record<string, string | number>;
    events?: { onReady?: (e: { target: YTPlayer }) => void; onStateChange?: (e: { data: number; target: YTPlayer }) => void; onError?: () => void };
  }) => YTPlayer;
}
declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
let apiLoading: Promise<YTNamespace> | null = null;

/** Loads YouTube's player script once. Fails when the PC has no internet. */
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiLoading ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { apiLoading = null; script.remove(); reject(new Error('YouTube could not be reached')); };
    document.head.appendChild(script);
  });
  return apiLoading;
}

const report = (playId: string, event: 'started' | 'ended' | 'error', durationSeconds?: number) =>
  api('/api/wall/video', 'POST', { playId, event, ...(durationSeconds ? { durationSeconds } : {}) }).catch(() => { /* the server's own timer still moves on */ });

export function VideoTakeover({ video, queued }: { video: Playing; queued: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = host.current;
    let player: YTPlayer | null = null;
    let cancelled = false;
    let reported = false;
    const started = (p: YTPlayer) => {
      const duration = p.getDuration();
      if (!reported && duration > 0) { reported = true; void report(video.playId, 'started', Math.ceil(duration)); }
    };
    loadYouTube().then(YT => {
      if (cancelled || !box) return;
      const el = document.createElement('div');
      box.appendChild(el);
      player = new YT.Player(el, {
        videoId: video.videoId, width: '100%', height: '100%',
        playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, playsinline: 1, disablekb: 1, iv_load_policy: 3, start: video.startSeconds, origin: window.location.origin },
        events: {
          onReady: e => { e.target.mute(); e.target.playVideo(); started(e.target); },
          onStateChange: e => {
            if (e.data === STATE_PLAYING) started(e.target);
            if (e.data === STATE_ENDED) void report(video.playId, 'ended');
          },
          onError: () => void report(video.playId, 'error'),
        },
      });
    }, () => { if (!cancelled) void report(video.playId, 'error'); });
    return () => {
      cancelled = true;
      try { player?.destroy(); } catch { /* already gone */ }
      if (box) box.textContent = '';
    };
  }, [video.playId, video.videoId, video.startSeconds]);

  return (
    <div className="wall-video" role="region" aria-label={`Video shared by ${video.sharedBy}: ${video.title}`}>
      <div className="wall-video-player" ref={host} />
      <div className="wall-video-caption">
        <span className="wall-video-tag"><i /> SHARED VIDEO</span>
        <strong>{video.title}</strong>
        <span>Shared by {video.sharedBy}{queued > 0 ? ` · ${queued} more waiting` : ''}</span>
      </div>
    </div>
  );
}
