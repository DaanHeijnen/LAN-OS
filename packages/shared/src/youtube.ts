// YouTube videos that players share to the projector.
import { z } from 'zod';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);

/** The 11-character video id from a YouTube link (watch, youtu.be, shorts, live, embed), or null. */
export function youTubeVideoId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const id = url.hostname.toLowerCase() === 'youtu.be' ? parts[0]
    : parts[0] === 'watch' || parts.length === 0 ? url.searchParams.get('v')
      : ['shorts', 'live', 'embed', 'v'].includes(parts[0]!) ? parts[1] : null;
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Where to start, in whole seconds, from a link's t= or start= ("90", "90s", "1m30s"). 0 when absent. */
export function youTubeStartSeconds(link: string): number {
  let raw: string | null = null;
  try {
    const url = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`);
    raw = url.searchParams.get('t') ?? url.searchParams.get('start');
  } catch {
    return 0;
  }
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export interface VideoItem {
  id: number;
  videoId: string;
  title: string;
  sharedBy: string;
  sharedById: string;
  startSeconds: number;
}

export interface VideoInfo {
  /** Players may share videos (wall.yaml → youtube_videos). */
  enabled: boolean;
  /** Longest a video plays before LAN OS moves on (wall.yaml → youtube_max_length). */
  maxSeconds: number;
  /** The video taking over the projector right now. */
  now: (VideoItem & {
    /** Changes every time a video starts, so a late report from the wall can't end the next one. */
    playId: string;
    startedAt: string;
    /** When it stops: the video's length (once the wall knows it) or the longest allowed. */
    endsAt: string;
  }) | null;
  queue: VideoItem[];
}

export const shareVideoSchema = z.strictObject({ link: z.string().trim().min(1, 'Paste a YouTube link').max(300) });
/** What the projector tells the server about the video it plays. */
export const wallVideoReportSchema = z.strictObject({
  playId: z.string().min(1).max(64),
  event: z.enum(['started', 'ended', 'error']),
  durationSeconds: z.number().min(0).max(86_400).optional(),
});
export const adminVideoSchema = z.strictObject({ action: z.enum(['skip', 'stop']) });
