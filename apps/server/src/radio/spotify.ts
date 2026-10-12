// Spotify Web API, signed in with the host's account through PKCE (no client secret needed).
// Only the Client ID from the host's free Spotify developer app is required.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { MusicError, type MusicService, type Playback, type Track } from './music.ts';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'user-read-private'];

interface StoredToken { accessToken: string; refreshToken: string; expiresAt: number }

/** The PKCE sign-in: a verifier kept on the server, its hash sent to Spotify. */
export function createPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, state: crypto.randomBytes(16).toString('base64url') };
}

export function spotifyAuthorizeUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  return `${ACCOUNTS}/authorize?${new URLSearchParams({
    response_type: 'code', client_id: clientId, scope: SCOPES.join(' '), redirect_uri: redirectUri,
    code_challenge_method: 'S256', code_challenge: challenge, state,
  })}`;
}

/** Keeps the host's Spotify sign-in in data/spotify-token.json (git-ignored, never shown). */
export class SpotifyTokens {
  private readonly file: string;
  private token: StoredToken | null;

  constructor(file: string) {
    this.file = file;
    try {
      this.token = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredToken;
    } catch {
      this.token = null;
    }
  }

  get connected(): boolean {
    return this.token !== null;
  }

  save(token: StoredToken): void {
    this.token = token;
    fs.writeFileSync(this.file, JSON.stringify(token), { mode: 0o600 });
  }

  clear(): void {
    this.token = null;
    fs.rmSync(this.file, { force: true });
  }

  async exchangeCode(clientId: string, code: string, redirectUri: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<void> {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier });
    this.save(await requestToken(body, null, fetchImpl));
  }

  /** A valid access token, refreshed when it's about to expire. */
  async accessToken(clientId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
    if (!this.token) throw new MusicError('Spotify is not connected yet. Connect it on the admin page.', true);
    if (Date.now() < this.token.expiresAt - 60_000) return this.token.accessToken;
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.token.refreshToken, client_id: clientId });
    this.save(await requestToken(body, this.token.refreshToken, fetchImpl));
    return this.token.accessToken;
  }
}

async function requestToken(body: URLSearchParams, previousRefresh: string | null, fetchImpl: typeof fetch): Promise<StoredToken> {
  const response = await fetchImpl(`${ACCOUNTS}/api/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new MusicError(`Spotify sign-in failed: ${data.error_description ?? response.status}. Connect Spotify again on the admin page.`, true);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefresh ?? '',
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

interface SpotifyTrack { uri: string; name: string; duration_ms: number; artists: Array<{ name: string }>; album?: { images?: Array<{ url: string; width?: number }> } }

const toTrack = (t: SpotifyTrack): Track => ({
  uri: t.uri,
  title: t.name,
  artist: t.artists.map(a => a.name).join(', '),
  // The smallest image of at least 300 px keeps the wall sharp without a big download.
  albumArt: [...(t.album?.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0)).find(i => (i.width ?? 0) >= 300)?.url
    ?? t.album?.images?.[0]?.url ?? null,
  durationMs: t.duration_ms,
});

export class SpotifyApi implements MusicService {
  private readonly tokens: SpotifyTokens;
  private readonly clientId: () => string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(tokens: SpotifyTokens, clientId: () => string | null, fetchImpl: typeof fetch = fetch) {
    this.tokens = tokens;
    this.clientId = clientId;
    this.fetchImpl = fetchImpl;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const clientId = this.clientId();
    if (!clientId) throw new MusicError('Spotify is not set up yet. Add the Client ID on the admin page.', true);
    const send = async () => this.fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.tokens.accessToken(clientId, this.fetchImpl)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    let response: Response;
    try {
      response = await send();
    } catch (error) {
      if (error instanceof MusicError) throw error;
      throw new MusicError("Spotify can't be reached. Check the internet connection.", true);
    }
    if (response.status === 204) return null;
    if (response.ok) {
      const text = await response.text();
      return text ? JSON.parse(text) as T : null;
    }
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string; reason?: string } };
    if (response.status === 401) throw new MusicError('The Spotify sign-in expired. Connect Spotify again on the admin page.', true);
    if (response.status === 429) throw new MusicError('Spotify asked LAN OS to slow down for a moment.');
    if (detail.error?.reason === 'NO_ACTIVE_DEVICE' || response.status === 404) {
      throw new MusicError('Spotify has no active player. Open Spotify on the host PC and press play once.', true);
    }
    if (detail.error?.reason === 'PREMIUM_REQUIRED') throw new MusicError('LAN Radio needs Spotify Premium on the host account.', true);
    if (response.status >= 500) throw new MusicError('Spotify is having problems right now.', true);
    throw new MusicError(`Spotify said: ${detail.error?.message ?? response.status}`);
  }

  async account() {
    const me = await this.call<{ display_name?: string; id: string; product?: string }>('GET', '/me');
    return { name: me?.display_name ?? me?.id ?? 'Spotify', premium: me?.product === 'premium' };
  }

  async search(query: string): Promise<Track[]> {
    const data = await this.call<{ tracks?: { items: SpotifyTrack[] } }>('GET', `/search?${new URLSearchParams({ q: query, type: 'track', limit: '10' })}`);
    return (data?.tracks?.items ?? []).map(toTrack);
  }

  async track(uri: string): Promise<Track> {
    const id = uri.split(':').pop()!;
    const data = await this.call<SpotifyTrack>('GET', `/tracks/${id}`);
    if (!data) throw new MusicError('That song could not be found on Spotify.');
    return toTrack(data);
  }

  async playback(): Promise<Playback | null> {
    const data = await this.call<{ is_playing: boolean; progress_ms: number | null; item: SpotifyTrack | null;
      device?: { volume_percent?: number | null }; context?: { uri?: string } | null }>('GET', '/me/player');
    if (!data) return null;
    return {
      track: data.item?.uri?.startsWith('spotify:track:') ? toTrack(data.item) : null,
      positionMs: data.progress_ms ?? 0,
      isPlaying: data.is_playing,
      volume: data.device?.volume_percent ?? null,
      contextUri: data.context?.uri ?? null,
    };
  }

  async addToQueue(uri: string) { await this.call('POST', `/me/player/queue?${new URLSearchParams({ uri })}`); }
  async playTrack(uri: string) { await this.call('PUT', '/me/player/play', { uris: [uri] }); }
  async playContext(contextUri: string) { await this.call('PUT', '/me/player/play', { context_uri: contextUri }); }
  async pause() { await this.call('PUT', '/me/player/pause'); }
  async resume() { await this.call('PUT', '/me/player/play'); }
  async next() { await this.call('POST', '/me/player/next'); }
  async setVolume(percent: number) { await this.call('PUT', `/me/player/volume?volume_percent=${Math.round(percent)}`); }
}
