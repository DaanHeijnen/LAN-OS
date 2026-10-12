// Join links, browser sessions and PINs, stored in SQLite.
import crypto from 'node:crypto';
import type { Db } from '../db/database.ts';

export const SESSION_COOKIE = 'lanos_session';
/** Sessions restore automatically; a browser stays signed in for a year. */
export const SESSION_MAX_AGE_SECONDS = 365 * 24 * 3600;
const TOUCH_EVERY_MS = 5 * 60_000;

export interface Session { kind: 'player' | 'admin'; playerId: string | null }

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const randomToken = (bytes: number) => crypto.randomBytes(bytes).toString('base64url');

export class Accounts {
  private db: Db;
  private lastTouched = new Map<string, number>();

  constructor(db: Db) {
    this.db = db;
  }

  // --- Join links ---

  /** Makes a new personal link and retires the player's previous one. */
  createJoinLink(playerId: string, now = new Date()): string {
    const token = randomToken(18);
    this.db.transaction(() => {
      this.db.prepare('UPDATE join_links SET revoked_at = ? WHERE player_id = ? AND revoked_at IS NULL').run(now.toISOString(), playerId);
      this.db.prepare('INSERT INTO join_links (token, player_id, created_at) VALUES (?, ?, ?)').run(token, playerId, now.toISOString());
    })();
    return token;
  }

  joinLinkFor(playerId: string): string | null {
    return (this.db.prepare(
      'SELECT token FROM join_links WHERE player_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
    ).pluck().get(playerId) as string | undefined) ?? null;
  }

  playerForJoinLink(token: string): string | null {
    return (this.db.prepare('SELECT player_id FROM join_links WHERE token = ? AND revoked_at IS NULL')
      .pluck().get(token) as string | undefined) ?? null;
  }

  revokeJoinLinks(playerId: string, now = new Date()): void {
    this.db.prepare('UPDATE join_links SET revoked_at = ? WHERE player_id = ? AND revoked_at IS NULL').run(now.toISOString(), playerId);
  }

  // --- Sessions ---

  /** Returns the cookie value. Only its hash is stored. */
  createSession(session: Session, now = new Date()): string {
    const cookie = randomToken(32);
    this.db.prepare('INSERT INTO sessions (id_hash, kind, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .run(sha256(cookie), session.kind, session.playerId, now.toISOString(), now.toISOString());
    return cookie;
  }

  findSession(cookie: string | undefined, now = new Date()): Session | null {
    if (!cookie) return null;
    const hash = sha256(cookie);
    const row = this.db.prepare('SELECT kind, player_id FROM sessions WHERE id_hash = ?').get(hash) as
      { kind: 'player' | 'admin'; player_id: string | null } | undefined;
    if (!row) return null;
    if (now.getTime() - (this.lastTouched.get(hash) ?? 0) > TOUCH_EVERY_MS) {
      this.lastTouched.set(hash, now.getTime());
      this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(now.toISOString(), hash);
    }
    return { kind: row.kind, playerId: row.player_id };
  }

  endSession(cookie: string | undefined): void {
    if (cookie) this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(cookie));
  }

  endPlayerSessions(playerId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE player_id = ?').run(playerId);
  }

  // --- PINs ---

  setPin(playerId: string, pin: string | null, now = new Date()): void {
    if (pin === null) {
      this.db.prepare('DELETE FROM player_pins WHERE player_id = ?').run(playerId);
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
    this.db.prepare(`INSERT INTO player_pins (player_id, pin_hash, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (player_id) DO UPDATE SET pin_hash = excluded.pin_hash, updated_at = excluded.updated_at`)
      .run(playerId, `${salt}:${hash}`, now.toISOString());
  }

  hasPin(playerId: string): boolean {
    return this.db.prepare('SELECT 1 FROM player_pins WHERE player_id = ?').get(playerId) !== undefined;
  }

  checkPin(playerId: string, pin: string): boolean {
    const stored = this.db.prepare('SELECT pin_hash FROM player_pins WHERE player_id = ?').pluck().get(playerId) as string | undefined;
    if (!stored) return false;
    const [salt, hash] = stored.split(':') as [string, string];
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pin, salt, 32));
  }
}

/** Five wrong PINs for one join link lock it for a while; a 4-digit PIN can't be guessed quickly. */
export class PinAttempts {
  private failures = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 5, windowMs = 10 * 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  blocked(key: string, now = Date.now()): boolean {
    const recent = (this.failures.get(key) ?? []).filter(t => now - t < this.windowMs);
    this.failures.set(key, recent);
    return recent.length >= this.limit;
  }

  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...(this.failures.get(key) ?? []), now]);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

export const sessionCookieHeader = (value: string) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
export const clearSessionCookieHeader = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
