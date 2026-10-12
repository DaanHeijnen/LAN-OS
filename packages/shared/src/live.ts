// What the server sends to the three screens over the one WebSocket channel,
// and the zod schemas for everything a browser sends to the server.
import { z } from 'zod';
import { WALL_PANELS } from './config/schemas.ts';
import type { Game, PresenceStatus, SteamLink } from './presence.ts';

export const SCREENS = ['wall', 'app', 'admin'] as const;
export type Screen = (typeof SCREENS)[number];

export interface PlayerCard {
  id: string;
  nickname: string;
  /** 0–6: which of the prototype's avatar gradients to use. */
  tone: number;
  avatarUrl: string | null;
  status: PresenceStatus;
  statusSince: string;
  game: Game | null;
  lastKnownGame: Game | null;
  sessionStartedAt: string | null;
  looking: boolean;
  hiddenFromWall: boolean;
  link: SteamLink | null;
  /** Last time Steam answered for this player; shown with "Unknown". */
  updatedAt: string | null;
}

export type HealthLevel = 'ok' | 'warning' | 'off';
export interface ServiceHealth { level: HealthLevel; label: string; detail: string }

export interface WallState {
  nightMode: boolean;
  brightness: number;
  panels: Array<(typeof WALL_PANELS)[number]>;
  blanked: boolean;
  paused: boolean;
  /** Plain-text message an admin sent to the projector. */
  message: string | null;
  /** Automatic announcement (e.g. everyone in the same game). */
  announcement: { text: string; kind: 'major' | 'minor' } | null;
}

export interface EventInfo {
  name: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export interface SessionSummary { game: string; startedAt: string; endedAt: string | null; seconds: number }

export interface MeInfo {
  id: string;
  nickname: string;
  tone: number;
  isAdmin: boolean;
  hasPin: boolean;
  manualGame: string | null;
  layout: DashboardLayout | null;
  sessions: SessionSummary[];
}

export interface AdminPlayer {
  id: string;
  nickname: string;
  tone: number;
  steamId: string;
  role: 'player' | 'admin';
  hiddenFromWall: boolean;
  joinLink: string | null;
}

export interface CrashInfo { file: string; at: string; summary: string }

export interface AdminInfo {
  players: AdminPlayer[];
  crashes: CrashInfo[];
  configProblems: string[];
  steamPaused: boolean;
  steamPollInterval: string;
  uptimeSeconds: number;
}

export interface LiveSnapshot {
  serverNow: string;
  demo: boolean;
  themeVersion: number;
  event: EventInfo;
  players: PlayerCard[];
  health: { steam: ServiceHealth; spotify: ServiceHealth; server: ServiceHealth };
  wall: WallState;
  me?: MeInfo;
  admin?: AdminInfo;
}

export type ServerMessage =
  | { type: 'snapshot'; snapshot: LiveSnapshot }
  | { type: 'signed_out' };

// --- From the browser ---

export const DASHBOARD_PANELS = ['radio', 'polls', 'activities', 'history'] as const;
export const dashboardLayoutSchema = z.strictObject({
  order: z.array(z.enum(DASHBOARD_PANELS)).length(DASHBOARD_PANELS.length)
    .refine(list => new Set(list).size === list.length),
  hidden: z.array(z.enum(DASHBOARD_PANELS)),
  collapsed: z.array(z.enum(DASHBOARD_PANELS)),
  compact: z.boolean(),
});
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ping') }),
]);

export const myStatusSchema = z.strictObject({
  looking: z.boolean().optional(),
  hiddenFromWall: z.boolean().optional(),
  manualGame: z.string().trim().max(60).nullable().optional(),
});

export const pinSchema = z.strictObject({ pin: z.string().regex(/^\d{4}$/, 'Use exactly 4 digits').nullable() });
export const pinSignInSchema = z.strictObject({ join: z.string().min(1).max(100), pin: z.string().regex(/^\d{4}$/) });
export const adminSignInSchema = z.strictObject({ password: z.string().min(1).max(200) });

export const playerFieldsSchema = z.strictObject({
  nickname: z.string().trim().min(1).max(20),
  steamId: z.string().trim().regex(/^(\d{17})?$/, 'A Steam ID has 17 digits'),
  role: z.enum(['player', 'admin']),
  hiddenFromWall: z.boolean(),
});
export const newPlayerSchema = playerFieldsSchema.extend({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Use lowercase letters, numbers and dashes'),
});

export const wallSettingsSchema = z.strictObject({
  nightMode: z.boolean().optional(),
  brightness: z.number().int().min(20).max(100).optional(),
  panels: z.array(z.enum(WALL_PANELS)).optional(),
  blanked: z.boolean().optional(),
  paused: z.boolean().optional(),
});

export const wallMessageSchema = z.strictObject({ text: z.string().trim().max(160).nullable() });
export const steamPauseSchema = z.strictObject({ paused: z.boolean() });
