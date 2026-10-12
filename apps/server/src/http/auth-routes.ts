// Signing in: "Sign in through Steam", personal join links, PIN, admin password, and
// connecting the host's Spotify account.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminSignInSchema, pinSignInSchema } from '@lan-os/shared';
import { clearSessionCookieHeader, PinAttempts } from '../auth/accounts.ts';
import { steamSignInUrl, verifySteamSignIn } from '../auth/steam-openid.ts';
import { addPlayer, updatePlayer } from '../config/players.ts';
import { parseProfileXml } from '../presence/steam-community.ts';
import { createPkce, spotifyAuthorizeUrl } from '../radio/spotify.ts';
import { fromHostPc, origin, type AppContext, type Helpers } from './context.ts';

/** A Steam sign-in that matched no player yet, waiting for "Which one are you?". */
interface PendingClaim { steamId: string; steamName: string; expires: number }
const CLAIM_MS = 15 * 60_000;

const claimSchema = z.strictObject({
  token: z.string().min(10).max(100),
  playerId: z.string().max(40).optional(),
  newNickname: z.string().trim().min(1).max(20).optional(),
});

const slugify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'player';

export function authRoutes(app: FastifyInstance, c: AppContext, h: Helpers): void {
  const pinAttempts = new PinAttempts();
  const claims = new Map<string, PendingClaim>();
  const spotifyPending = new Map<string, { verifier: string; expires: number }>();

  const steamName = async (steamId: string) => {
    try {
      const response = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, { signal: AbortSignal.timeout(8000) });
      return parseProfileXml(steamId, await response.text()).personaname ?? 'Player';
    } catch {
      return 'Player';
    }
  };

  app.get('/', async (_request, reply) => reply.redirect('/app'));

  // --- Personal join links ---

  app.get('/join/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const playerId = c.accounts.playerForJoinLink(token);
    if (!playerId || !c.hub.player(playerId)) return reply.redirect('/app/sign-in?error=invalid-link');
    const current = h.sessionOf(request);
    if (current?.kind === 'player' && current.playerId === playerId) return reply.redirect('/app');
    if (c.demo) return h.signIn(reply, { kind: 'player', playerId }).redirect('/app');
    if (c.accounts.hasPin(playerId)) return reply.redirect(`/app/sign-in?join=${encodeURIComponent(token)}`);
    return reply.redirect(`/auth/steam?join=${encodeURIComponent(token)}`);
  });

  // --- Sign in through Steam (with or without a join link) ---

  app.get('/auth/steam', async (request, reply) => {
    const { join } = request.query as { join?: string };
    if (join && !c.accounts.playerForJoinLink(join)) return reply.redirect('/app/sign-in?error=invalid-link');
    const returnTo = `${origin(request)}/auth/steam/callback${join ? `?join=${encodeURIComponent(join)}` : ''}`;
    return reply.redirect(steamSignInUrl(returnTo, origin(request)));
  });

  app.get('/auth/steam/callback', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const join = query.join;
    const retry = join ? `&join=${encodeURIComponent(join)}` : '';
    let steamId: string | null;
    try {
      steamId = await verifySteamSignIn(query, `${origin(request)}/auth/steam/callback`);
    } catch {
      return reply.redirect(`/app/sign-in?error=steam-unreachable${retry}`);
    }
    if (!steamId) return reply.redirect(`/app/sign-in?error=steam-failed${retry}`);

    // Joined through a personal link: that player, and link their Steam account if new.
    if (join) {
      const player = c.hub.player(c.accounts.playerForJoinLink(join));
      if (!player) return reply.redirect('/app/sign-in?error=invalid-link');
      if (player.steam_id && player.steam_id !== steamId) return reply.redirect('/app/sign-in?error=wrong-steam');
      if (!player.steam_id) {
        if (c.hub.players.some(p => p.steam_id === steamId)) return reply.redirect('/app/sign-in?error=steam-taken');
        updatePlayer(c.store, player.id, { steam_id: steamId });
      }
      return h.signIn(reply, { kind: 'player', playerId: player.id }).redirect('/app');
    }

    // Plain Steam sign-in: a known Steam account goes straight in.
    const known = c.hub.players.find(p => p.steam_id === steamId);
    if (known) return h.signIn(reply, { kind: 'player', playerId: known.id }).redirect('/app');

    // A new Steam account: ask "Which one are you?" (or add themselves).
    const token = crypto.randomBytes(18).toString('base64url');
    claims.set(token, { steamId, steamName: await steamName(steamId), expires: Date.now() + CLAIM_MS });
    return reply.redirect(`/app/sign-in?claim=${token}`);
  });

  app.get('/api/auth/claim/:token', async (request, reply) => {
    const claim = claims.get((request.params as { token: string }).token);
    if (!claim || claim.expires < Date.now()) return reply.code(404).send({ error: 'This sign-in expired. Sign in with Steam again.' });
    return reply.send({
      steamName: claim.steamName,
      unlinked: c.hub.players.filter(p => !p.steam_id).map(p => ({ id: p.id, nickname: p.nickname })),
    });
  });

  app.post('/api/auth/claim', async (request, reply) => {
    const input = h.body(claimSchema, request, reply);
    if (!input) return;
    const claim = claims.get(input.token);
    if (!claim || claim.expires < Date.now()) return reply.code(400).send({ error: 'This sign-in expired. Sign in with Steam again.' });
    if (c.hub.players.some(p => p.steam_id === claim.steamId)) return reply.code(400).send({ error: 'That Steam account is already linked.' });
    const chosen = input.playerId ? c.hub.player(input.playerId) : undefined;
    if (input.playerId && (!chosen || chosen.steam_id)) {
      return reply.code(400).send({ error: 'Someone already signed in as that player. Pick another name, or add yourself as new.' });
    }
    return h.attempt(reply, () => {
      let playerId: string;
      if (chosen) {
        updatePlayer(c.store, chosen.id, { steam_id: claim.steamId });
        playerId = chosen.id;
      } else {
        const nickname = input.newNickname ?? claim.steamName.slice(0, 20);
        let id = slugify(nickname);
        for (let n = 2; c.hub.player(id); n++) id = `${slugify(nickname)}-${n}`;
        addPlayer(c.store, { id, nickname, steam_id: claim.steamId, role: 'player', hidden_from_wall: false });
        playerId = id;
      }
      claims.delete(input.token);
      h.signIn(reply, { kind: 'player', playerId });
      return { ok: true };
    });
  });

  // --- PIN and admin password ---

  app.post('/api/auth/pin', async (request, reply) => {
    const input = h.body(pinSignInSchema, request, reply);
    if (!input) return;
    const playerId = c.accounts.playerForJoinLink(input.join);
    if (!playerId) return reply.code(400).send({ error: 'This join link is no longer valid. Ask an admin for a new one.' });
    if (pinAttempts.blocked(input.join)) return reply.code(429).send({ error: 'Too many wrong PINs. Wait 10 minutes, or sign in with Steam.' });
    if (!c.accounts.checkPin(playerId, input.pin)) {
      pinAttempts.fail(input.join);
      return reply.code(400).send({ error: 'That PIN is not right.' });
    }
    pinAttempts.clear(input.join);
    return h.signIn(reply, { kind: 'player', playerId }).send({ ok: true });
  });

  app.post('/api/auth/admin', async (request, reply) => {
    const input = h.body(adminSignInSchema, request, reply);
    if (!input) return;
    const expected = c.secrets.get('ADMIN_PASSWORD');
    const matches = expected !== null && input.password.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(input.password), Buffer.from(expected));
    if (!matches) return reply.code(400).send({ error: expected ? 'That password is not right.' : 'No admin password is set yet. Set one on the host PC.' });
    return h.signIn(reply, { kind: 'admin', playerId: null }).send({ ok: true });
  });

  app.post('/api/auth/sign-out', async (request, reply) => {
    c.accounts.endSession(h.cookieOf(request));
    return reply.header('Set-Cookie', clearSessionCookieHeader()).send({ ok: true });
  });

  app.get('/api/auth/status', async (request, reply) => {
    const session = h.sessionOf(request);
    return reply.send({
      signedIn: session !== null,
      playerId: session?.kind === 'player' ? session.playerId : null,
      isAdmin: c.hub.isAdmin(session),
      demo: c.demo,
      adminPasswordSet: c.secrets.get('ADMIN_PASSWORD') !== null,
      hostPc: fromHostPc(request),
    });
  });

  // --- Connect the host's Spotify account (only from the host PC: Spotify requires 127.0.0.1) ---

  app.get('/auth/spotify/start', async (request, reply) => {
    const local = `http://127.0.0.1:${c.port}`;
    if (!fromHostPc(request)) return reply.code(403).type('text/plain').send('Connect Spotify on the host PC, at ' + `${local}/admin`);
    if (origin(request) !== local) return reply.redirect(`${local}/auth/spotify/start`);
    const clientId = c.secrets.get('SPOTIFY_CLIENT_ID');
    if (!clientId) return reply.redirect('/admin?spotify=no-client-id#setup');
    const pkce = createPkce();
    spotifyPending.set(pkce.state, { verifier: pkce.verifier, expires: Date.now() + 10 * 60_000 });
    return reply.redirect(spotifyAuthorizeUrl(clientId, `${local}/auth/spotify/callback`, pkce.challenge, pkce.state));
  });

  app.get('/auth/spotify/callback', async (request, reply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
    const pending = state ? spotifyPending.get(state) : undefined;
    const clientId = c.secrets.get('SPOTIFY_CLIENT_ID');
    if (error || !code || !pending || pending.expires < Date.now() || !clientId) {
      return reply.redirect(`/admin?spotify=${encodeURIComponent(error ?? 'failed')}#setup`);
    }
    spotifyPending.delete(state!);
    try {
      await c.spotifyTokens.exchangeCode(clientId, code, `http://127.0.0.1:${c.port}/auth/spotify/callback`, pending.verifier);
    } catch {
      return reply.redirect('/admin?spotify=failed#setup');
    }
    c.hub.resetMusic();
    return reply.redirect('/admin?spotify=connected#setup');
  });
}
