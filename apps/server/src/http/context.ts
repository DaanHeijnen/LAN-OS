// What every route file needs: who is asking, body validation, and friendly errors.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { parseCookies, SESSION_COOKIE, sessionCookieHeader, type Accounts, type Session } from '../auth/accounts.ts';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { ConfigError } from '../config/store.ts';
import type { Secrets } from '../env.ts';
import type { LiveHub } from '../live/hub.ts';
import type { CrashLog } from '../logging.ts';
import { ActivityError } from '../polls/activities.ts';
import { PollError } from '../polls/polls.ts';
import { MusicError } from '../radio/music.ts';
import { RadioError } from '../radio/radio.ts';
import type { SpotifyTokens } from '../radio/spotify.ts';

export interface AppContext {
  store: ConfigStore;
  db: Db;
  accounts: Accounts;
  hub: LiveHub;
  crashLog: CrashLog;
  secrets: Secrets;
  spotifyTokens: SpotifyTokens;
  demo: boolean;
  port: number;
  webDistDir: string;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** A request from the host PC itself. The host PC always has admin access. */
export const fromHostPc = (request: FastifyRequest) => LOOPBACK.has(request.socket.remoteAddress ?? '');

export const origin = (request: FastifyRequest) => `${request.protocol}://${request.headers.host ?? 'localhost'}`;

export function helpers(c: AppContext) {
  const cookieOf = (request: FastifyRequest) => parseCookies(request.headers.cookie)[SESSION_COOKIE];

  const sessionOf = (request: FastifyRequest): Session | null => {
    const session = c.accounts.findSession(cookieOf(request));
    // A player removed from players.yaml loses access straight away.
    if (session?.kind === 'player' && !c.hub.player(session.playerId)) return null;
    if (session) return session;
    return fromHostPc(request) ? { kind: 'admin', playerId: null } : null;
  };

  const isAdmin = (request: FastifyRequest) => c.hub.isAdmin(sessionOf(request));

  const signIn = (reply: FastifyReply, session: Session) =>
    reply.header('Set-Cookie', sessionCookieHeader(c.accounts.createSession(session)));

  /** Validates a JSON body; a bad one gets a 400 with a readable reason. */
  const body = <T extends z.ZodType>(schema: T, request: FastifyRequest, reply: FastifyReply): z.infer<T> | undefined => {
    const result = schema.safeParse(request.body ?? {});
    if (result.success) return result.data;
    void reply.code(400).send({ error: result.error.issues.map(i => i.message).join('; ') });
    return undefined;
  };

  const requirePlayer = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const session = sessionOf(request);
    if (session?.kind === 'player' && session.playerId) return session.playerId;
    void reply.code(401).send({ error: 'Sign in with Steam on the player page first.' });
    return null;
  };

  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (isAdmin(request)) return true;
    void reply.code(403).send({ error: 'Admins only.' });
    return false;
  };

  /** Runs an action; expected problems become a 400 with their plain-English message. */
  const attempt = async (reply: FastifyReply, run: () => unknown) => {
    try {
      const result = await run();
      return reply.send(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ConfigError) return reply.code(400).send({ error: error.lines.join('\n') });
      if (error instanceof RadioError || error instanceof PollError || error instanceof ActivityError || error instanceof MusicError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  };

  return { cookieOf, sessionOf, isAdmin, signIn, body, requirePlayer, requireAdmin, attempt };
}

export type Helpers = ReturnType<typeof helpers>;
