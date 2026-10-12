// What LAN Radio needs from a music service. Spotify implements it; demo mode fakes it.

export interface Track {
  uri: string;
  title: string;
  artist: string;
  albumArt: string | null;
  durationMs: number;
}

export interface Playback {
  track: Track | null;
  positionMs: number;
  isPlaying: boolean;
  volume: number | null;
  /** Playlist or album Spotify is playing from, if any. */
  contextUri: string | null;
}

export interface MusicService {
  /** Name of the connected account, for the admin page. */
  account(): Promise<{ name: string; premium: boolean }>;
  search(query: string): Promise<Track[]>;
  track(uri: string): Promise<Track>;
  /** null when Spotify has no active device. */
  playback(): Promise<Playback | null>;
  addToQueue(uri: string): Promise<void>;
  playTrack(uri: string): Promise<void>;
  playContext(contextUri: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  next(): Promise<void>;
  setVolume(percent: number): Promise<void>;
}

/** A problem worth showing to people, e.g. "Open Spotify on the host PC". */
export class MusicError extends Error {
  readonly offline: boolean;
  constructor(message: string, offline = false) {
    super(message);
    this.offline = offline;
  }
}

/** open.spotify.com/track/<id>, open.spotify.com/intl-nl/track/<id>, spotify:track:<id> → spotify:track:<id> */
export function trackUriFromLink(text: string): string | null {
  const match = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/.exec(text.trim());
  return match ? `spotify:track:${match[1]}` : null;
}

/** spotify:playlist:<id> from a playlist link, for the fallback playlist in music.yaml. */
export function playlistUriFromLink(text: string): string | null {
  const match = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/|spotify:playlist:)([A-Za-z0-9]{22})/.exec(text.trim());
  return match ? `spotify:playlist:${match[1]}` : null;
}
