import { describe, expect, it } from 'vitest';
import { steamSignInUrl, verifySteamSignIn } from '../src/auth/steam-openid.ts';
import { parseEnv, setEnvValue } from '../src/env.ts';
import { answerPacket, parseQuestions } from '../src/mdns.ts';
import { createPkce, spotifyAuthorizeUrl, SpotifyTokens } from '../src/radio/spotify.ts';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const fakeFetch = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('Steam sign-in', () => {
  const returnTo = 'http://192.168.1.10:8080/auth/steam/callback';
  const answer = {
    'openid.mode': 'id_res', 'openid.return_to': returnTo,
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198012345678',
    'openid.sig': 'abc', 'openid.signed': 'signed,op_endpoint',
  };
  it('sends people to Steam with our return address', () => {
    const url = new URL(steamSignInUrl(returnTo, 'http://192.168.1.10:8080'));
    expect(url.host).toBe('steamcommunity.com');
    expect(url.searchParams.get('openid.return_to')).toBe(returnTo);
  });
  it('accepts the Steam ID only when Steam confirms the answer', async () => {
    expect(await verifySteamSignIn(answer, returnTo, fakeFetch('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'))).toBe('76561198012345678');
    expect(await verifySteamSignIn(answer, returnTo, fakeFetch('is_valid:false\n'))).toBeNull();
  });
  it('rejects answers meant for another site or with a strange ID', async () => {
    const ok = fakeFetch('is_valid:true\n');
    expect(await verifySteamSignIn({ ...answer, 'openid.return_to': 'http://evil.example/auth' }, returnTo, ok)).toBeNull();
    expect(await verifySteamSignIn({ ...answer, 'openid.claimed_id': 'https://evil.example/id/1' }, returnTo, ok)).toBeNull();
  });
});

describe('Spotify sign-in (PKCE)', () => {
  it('sends the hash of the verifier, never the verifier', () => {
    const pkce = createPkce();
    const url = new URL(spotifyAuthorizeUrl('a'.repeat(32), 'http://127.0.0.1:8080/auth/spotify/callback', pkce.challenge, pkce.state));
    expect(url.searchParams.get('code_challenge')).toBe(crypto.createHash('sha256').update(pkce.verifier).digest('base64url'));
    expect(url.toString()).not.toContain(pkce.verifier);
    expect(url.searchParams.get('scope')).toContain('user-modify-playback-state');
  });
  it('stores the sign-in and refreshes it before it expires', async () => {
    const file = path.join(os.tmpdir(), `lan-os-spotify-${Date.now()}.json`);
    const tokens = new SpotifyTokens(file);
    await tokens.exchangeCode('client', 'code', 'http://127.0.0.1:8080/cb', 'verifier',
      fakeFetch(JSON.stringify({ access_token: 'first', refresh_token: 'r1', expires_in: 30 })));
    expect(tokens.connected).toBe(true);
    // 30 s left is less than the 60 s margin, so it refreshes; Spotify may keep the old refresh token.
    expect(await tokens.accessToken('client', fakeFetch(JSON.stringify({ access_token: 'second', expires_in: 3600 })))).toBe('second');
    expect(new SpotifyTokens(file).connected).toBe(true);
    tokens.clear();
    expect(new SpotifyTokens(file).connected).toBe(false);
  });
});

describe('.env writing', () => {
  it('sets a value and keeps every comment', () => {
    const text = '# Steam key\nSTEAM_API_KEY=\n\n# Later\n# SPOTIFY_CLIENT_ID=\n';
    const once = setEnvValue(text, 'STEAM_API_KEY', 'ABC');
    const twice = setEnvValue(once, 'SPOTIFY_CLIENT_ID', 'xyz');
    expect(twice).toBe('# Steam key\nSTEAM_API_KEY=ABC\n\n# Later\nSPOTIFY_CLIENT_ID=xyz\n');
    expect(parseEnv(setEnvValue(twice, 'ADMIN_PASSWORD', 'secret'))).toEqual({ STEAM_API_KEY: 'ABC', SPOTIFY_CLIENT_ID: 'xyz', ADMIN_PASSWORD: 'secret' });
  });
});

describe('lan-os.local on the network', () => {
  it('answers a question for its own name', () => {
    const query = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 6, ...Buffer.from('lan-os'), 5, ...Buffer.from('local'), 0, 0, 1, 0, 1]);
    expect(parseQuestions(query)).toEqual([{ name: 'lan-os.local', type: 1 }]);
    const answer = answerPacket('lan-os.local', '192.168.1.10');
    expect([...answer.subarray(-4)]).toEqual([192, 168, 1, 10]);
    expect(answer.readUInt16BE(2) & 0x8000).toBe(0x8000);
    expect(parseQuestions(answer)).toEqual([]);
  });
});
