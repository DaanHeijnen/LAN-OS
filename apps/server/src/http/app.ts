// All HTTP routes and the one WebSocket channel.
import crypto from 'node:crypto';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  adminSignInSchema, clientMessageSchema, dashboardLayoutSchema, myStatusSchema, newPlayerSchema, pinSchema,
  pinSignInSchema, playerFieldsSchema, SCREENS, steamPauseSchema, themeToCss, wallMessageSchema, wallSettingsSchema,
  type Screen, type ServerMessage,
} from '@lan-os/shared';
import { isSeq } from 'yaml';
import {
  clearSessionCookieHeader, parseCookies, PinAttempts, SESSION_COOKIE, sessionCookieHeader, type Accounts, type Session,
} from '../auth/accounts.ts';
import { steamSignInUrl, verifySteamSignIn } from '../auth/steam-openid.ts';
import { addPlayer, removePlayer, updatePlayer } from '../config/players.ts';
import { ConfigError, type ConfigStore } from '../config/store.ts';
import type { CrashLog } from '../logging.ts';
import type { LiveHub } from '../live/hub.ts';
import { serveWebApp } from './static.ts';

export interface AppOptions {
  store: ConfigStore;
  accounts: Accounts;
  hub: LiveHub;
  crashLog: CrashLog;
  demo: boolean;
  adminPassword: string | null;
  webDistDir: string;
}

/** Keep-alive: every screen gets a snapshot at least this often, so a dead link is noticed. */
const KEEPALIVE_MS = 20_000;

export async function buildApp(o: AppOptions) {
  const app = Fastify({ logger: false, trustProxy: false });
  await app.register(websocket);
  const pinAttempts = new PinAttempts();

  const cookieOf = (request: FastifyRequest) => parseCookies(request.headers.cookie)[SESSION_COOKIE];
  const sessionOf = (request: FastifyRequest): Session | null => {
    const session = o.accounts.findSession(cookieOf(request));
    // A player removed from players.yaml loses access straight away.
    if (session?.kind === 'player' && !o.hub.player(session.playerId)) return null;
    return session;
  };
  const origin = (request: FastifyRequest) => `${request.protocol}://${request.headers.host ?? 'localhost'}`;
  const signIn = (reply: FastifyReply, session: Session) =>
    reply.header('Set-Cookie', sessionCookieHeader(o.accounts.createSession(session)));

  /** Validates a JSON body; a bad one gets a 400 with a readable reason. */
  const body = <T extends z.ZodType>(schema: T, request: FastifyRequest, reply: FastifyReply): z.infer<T> | undefined => {
    const result = schema.safeParse(request.body ?? {});
    if (result.success) return result.data;
    void reply.code(400).send({ error: result.error.issues.map(i => i.message).join('; ') });
    return undefined;
  };

  const requirePlayer = (request: FastifyRequest, reply: FastifyReply) => {
    const session = sessionOf(request);
    if (session?.kind === 'player' && session.playerId) return session.playerId;
    void reply.code(401).send({ error: 'Open your personal join link to sign in.' });
    return null;
  };
  const requireAdmin = (request: FastifyRequest, reply: FastifyReply) => {
    if (o.hub.isAdmin(sessionOf(request))) return true;
    void reply.code(403).send({ error: 'Admins only.' });
    return false;
  };

  /** Turns config write-back problems into a friendly 400. */
  const configChange = async (reply: FastifyReply, change: () => unknown) => {
    try {
      change();
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof ConfigError) return reply.code(400).send({ error: error.lines.join('\n') });
      throw error;
    }
  };

  // --- Live channel ---

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as { screen?: string };
    const screen: Screen = SCREENS.includes(query.screen as Screen) ? (query.screen as Screen) : 'wall';
    const session = screen === 'wall' ? null : sessionOf(request);
    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const unsubscribe = o.hub.subscribe({ screen, session, send: snapshot => send({ type: 'snapshot', snapshot }) });
    const keepAlive = setInterval(() => send({ type: 'snapshot', snapshot: o.hub.snapshot(screen, session) }), KEEPALIVE_MS);
    socket.on('message', (raw: Buffer) => {
      let data: unknown = null;
      try { data = JSON.parse(raw.toString()); } catch { /* ignored below */ }
      // Browsers only send keep-alive pings; anything else is dropped.
      if (!clientMessageSchema.safeParse(data).success) socket.close(1003, 'Unsupported message');
    });
    socket.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  // --- Theme ---

  app.get('/theme.css', async (_request, reply) =>
    reply.type('text/css; charset=utf-8').header('Cache-Control', 'no-cache').send(themeToCss(o.store.get('theme'))));

  // --- Signing in ---

  app.get('/', async (_request, reply) => reply.redirect('/app'));

  app.get('/join/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const playerId = o.accounts.playerForJoinLink(token);
    if (!playerId || !o.hub.player(playerId)) return reply.redirect('/app/sign-in?error=invalid-link');
    const current = sessionOf(request);
    if (current?.kind === 'player' && current.playerId === playerId) return reply.redirect('/app');
    if (o.demo) return signIn(reply, { kind: 'player', playerId }).redirect('/app');
    if (o.accounts.hasPin(playerId)) return reply.redirect(`/app/sign-in?join=${encodeURIComponent(token)}`);
    return reply.redirect(`/auth/steam?join=${encodeURIComponent(token)}`);
  });

  app.get('/auth/steam', async (request, reply) => {
    const { join } = request.query as { join?: string };
    if (!join || !o.accounts.playerForJoinLink(join)) return reply.redirect('/app/sign-in?error=invalid-link');
    const returnTo = `${origin(request)}/auth/steam/callback?join=${encodeURIComponent(join)}`;
    return reply.redirect(steamSignInUrl(returnTo, origin(request)));
  });

  app.get('/auth/steam/callback', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const playerId = query.join ? o.accounts.playerForJoinLink(query.join) : null;
    const player = o.hub.player(playerId);
    if (!player) return reply.redirect('/app/sign-in?error=invalid-link');
    let steamId: string | null;
    try {
      steamId = await verifySteamSignIn(query, `${origin(request)}/auth/steam/callback`);
    } catch {
      return reply.redirect(`/app/sign-in?error=steam-unreachable&join=${encodeURIComponent(query.join!)}`);
    }
    if (!steamId) return reply.redirect(`/app/sign-in?error=steam-failed&join=${encodeURIComponent(query.join!)}`);
    if (player.steam_id && player.steam_id !== steamId) return reply.redirect('/app/sign-in?error=wrong-steam');
    if (!player.steam_id) {
      if (o.hub.players.some(p => p.steam_id === steamId)) return reply.redirect('/app/sign-in?error=steam-taken');
      updatePlayer(o.store, player.id, { steam_id: steamId });
    }
    return signIn(reply, { kind: 'player', playerId: player.id }).redirect('/app');
  });

  app.post('/api/auth/pin', async (request, reply) => {
    const input = body(pinSignInSchema, request, reply);
    if (!input) return;
    const playerId = o.accounts.playerForJoinLink(input.join);
    if (!playerId) return reply.code(400).send({ error: 'This join link is no longer valid. Ask an admin for a new one.' });
    if (pinAttempts.blocked(input.join)) return reply.code(429).send({ error: 'Too many wrong PINs. Wait 10 minutes, or sign in with Steam.' });
    if (!o.accounts.checkPin(playerId, input.pin)) {
      pinAttempts.fail(input.join);
      return reply.code(400).send({ error: 'That PIN is not right.' });
    }
    pinAttempts.clear(input.join);
    return signIn(reply, { kind: 'player', playerId }).send({ ok: true });
  });

  app.post('/api/auth/admin', async (request, reply) => {
    const input = body(adminSignInSchema, request, reply);
    if (!input) return;
    const expected = o.adminPassword;
    const matches = expected !== null && input.password.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(input.password), Buffer.from(expected));
    if (!matches) {
      return reply.code(400).send({ error: expected ? 'That password is not right.' : 'No ADMIN_PASSWORD is set in the .env file.' });
    }
    return signIn(reply, { kind: 'admin', playerId: null }).send({ ok: true });
  });

  app.post('/api/auth/sign-out', async (request, reply) => {
    o.accounts.endSession(cookieOf(request));
    return reply.header('Set-Cookie', clearSessionCookieHeader()).send({ ok: true });
  });

  app.get('/api/auth/status', async (request, reply) => {
    const session = sessionOf(request);
    return reply.send({
      signedIn: session !== null,
      playerId: session?.playerId ?? null,
      isAdmin: o.hub.isAdmin(session),
      demo: o.demo,
      adminPasswordSet: o.adminPassword !== null,
    });
  });

  // --- The player's own settings ---

  app.post('/api/me/status', async (request, reply) => {
    const playerId = requirePlayer(request, reply);
    const input = playerId && body(myStatusSchema, request, reply);
    if (!playerId || !input) return;
    if (input.hiddenFromWall !== undefined) {
      try {
        updatePlayer(o.store, playerId, { hidden_from_wall: input.hiddenFromWall });
      } catch (error) {
        if (error instanceof ConfigError) return reply.code(400).send({ error: error.lines.join('\n') });
        throw error;
      }
    }
    const changes: { looking?: boolean; manualGame?: string | null } = {};
    if (input.looking !== undefined) changes.looking = input.looking;
    if (input.manualGame !== undefined) changes.manualGame = input.manualGame || null;
    if (Object.keys(changes).length) o.hub.updateProfile(playerId, changes);
    return reply.send({ ok: true });
  });

  app.post('/api/me/layout', async (request, reply) => {
    const playerId = requirePlayer(request, reply);
    const layout = playerId && body(dashboardLayoutSchema, request, reply);
    if (!playerId || !layout) return;
    o.hub.updateProfile(playerId, { layout });
    return reply.send({ ok: true });
  });

  app.post('/api/me/pin', async (request, reply) => {
    const playerId = requirePlayer(request, reply);
    const input = playerId && body(pinSchema, request, reply);
    if (!playerId || !input) return;
    o.accounts.setPin(playerId, input.pin);
    o.hub.push();
    return reply.send({ ok: true });
  });

  // --- Admin ---

  app.post('/api/admin/players', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = body(newPlayerSchema, request, reply);
    if (!input) return;
    if (o.hub.player(input.id)) return reply.code(400).send({ error: `There is already a player with id "${input.id}".` });
    return configChange(reply, () => {
      addPlayer(o.store, { id: input.id, nickname: input.nickname, steam_id: input.steamId, role: input.role, hidden_from_wall: input.hiddenFromWall });
      o.accounts.createJoinLink(input.id);
    });
  });

  app.patch('/api/admin/players/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const input = body(playerFieldsSchema.partial(), request, reply);
    if (!input) return;
    return configChange(reply, () => updatePlayer(o.store, id, {
      nickname: input.nickname, steam_id: input.steamId, role: input.role, hidden_from_wall: input.hiddenFromWall,
    }));
  });

  app.delete('/api/admin/players/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    return configChange(reply, () => {
      removePlayer(o.store, id);
      o.accounts.revokeJoinLinks(id);
      o.accounts.endPlayerSessions(id);
    });
  });

  app.post('/api/admin/players/:id/join-link', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    if (!o.hub.player(id)) return reply.code(404).send({ error: 'No such player.' });
    o.accounts.createJoinLink(id);
    o.hub.push();
    return reply.send({ ok: true });
  });

  app.post('/api/admin/wall', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = body(wallSettingsSchema, request, reply);
    if (!input) return;
    if (input.blanked !== undefined || input.paused !== undefined) {
      o.hub.setRuntime({
        ...(input.blanked !== undefined && { wall_blanked: input.blanked }),
        ...(input.paused !== undefined && { wall_paused: input.paused }),
      });
    }
    if (input.nightMode === undefined && input.brightness === undefined && input.panels === undefined) return reply.send({ ok: true });
    return configChange(reply, () => o.store.update('wall', document => {
      if (input.nightMode !== undefined) document.set('night_mode', input.nightMode);
      if (input.brightness !== undefined) document.set('brightness', input.brightness);
      if (input.panels !== undefined) {
        const current = document.get('panels');
        const list = document.createNode(input.panels);
        // Keep the one-line [music, poll, activity] style the owner sees in the file.
        if (isSeq(current) && current.flow) list.flow = true;
        document.set('panels', list);
      }
    }));
  });

  app.post('/api/admin/message', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = body(wallMessageSchema, request, reply);
    if (!input) return;
    o.hub.setRuntime({ wall_message: input.text || null });
    return reply.send({ ok: true });
  });

  app.post('/api/admin/steam', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const input = body(steamPauseSchema, request, reply);
    if (!input) return;
    o.hub.setRuntime({ steam_paused: input.paused });
    return reply.send({ ok: true });
  });

  app.setErrorHandler((error, request, reply) => {
    o.crashLog.write(error, `${request.method} ${request.url}`);
    void reply.code(500).send({ error: 'Something went wrong on the server. It is in the crash log on the admin page.' });
  });

  serveWebApp(app, o.webDistDir);
  return app;
}

