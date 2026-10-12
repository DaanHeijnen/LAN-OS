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
  /** false until the player has signed in with Steam (or has a Steam ID in players.yaml). */
  steamLinked: boolean;
  link: SteamLink | null;
  /** Last time Steam answered for this player; shown with "Unknown". */
  updatedAt: string | null;
}

export type HealthLevel = 'ok' | 'warning' | 'off';
export interface ServiceHealth { level: HealthLevel; label: string; detail: string }

export interface WallState {
  /** Rotating Discord highlights picked by the host (empty when off). */
  highlights: Array<{ author: string; text: string }>;
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
  setup: SetupInfo;
  lastBackup: string | null;
  recentEvents: Array<{ id: number; type: string; player: string | null; at: string; summary: string }>;
  discord: { enabled: boolean; connected: boolean; channelSet: boolean; messages: Array<{ id: string; author: string; text: string; selected: boolean }> };
}

/** What the host has set up; drives the setup page and the admin hints. */
export interface SetupInfo {
  adminPassword: boolean;
  steamApiKey: boolean;
  spotifyClientId: boolean;
  spotifyConnected: boolean;
  spotifyAccount: string | null;
  spotifyRedirectUri: string;
  aiKey: boolean;
  discordToken: boolean;
  hostUrl: string;
  /** The general sign-in address players can open. */
  signInUrl: string;
}

export interface RadioTrackInfo { title: string; artist: string; albumArt: string | null; durationMs: number }

export interface RadioInfo {
  /** off = switched off in integrations.yaml; offline = not connected or unreachable. */
  status: 'ok' | 'offline' | 'off';
  message: string | null;
  now: (RadioTrackInfo & { positionMs: number; isPlaying: boolean; at: string; requester: string | null; requesterId: string | null }) | null;
  /** In play order: the song already handed to Spotify first, then the fair queue. */
  queue: Array<RadioTrackInfo & { id: number; requester: string; requesterId: string; state: 'waiting' | 'sent' }>;
  requestsOpen: boolean;
  requestsClosedReason: string | null;
  skip: { votes: number; needed: number; voters: string[] };
  volume: number | null;
  permissions: { pause: 'everyone' | 'admins'; skip: 'everyone' | 'admins'; volume: 'everyone' | 'admins' };
  history: Array<{ title: string; artist: string; requester: string | null; playedAt: string }>;
  fallbackPlaylist: boolean;
}

export interface PollInfo {
  id: number;
  question: string;
  mode: 'choice' | 'yes_no_maybe';
  options: string[];
  counts: number[];
  /** Who voted for what; empty for anonymous polls. */
  votersByOption: string[][];
  anonymous: boolean;
  isMain: boolean;
  createdBy: string;
  createdById: string;
  createdAt: string;
  closesAt: string;
  closedAt: string | null;
  closeReason: 'timer' | 'everyone_voted' | 'creator' | 'admin' | 'removed' | null;
  winner: number | null;
  /** Closed with a tie that the host still has to decide. */
  tie: boolean;
  voted: number;
  eligible: number;
  myVote: number | null;
  /** Until when the viewer can still change their vote. */
  changeUntil: string | null;
}

export interface ActivityInfo {
  id: number;
  title: string;
  kind: 'game' | 'group_session' | 'food_break' | 'irl';
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  startsAt: string;
  startedAt: string | null;
  endedAt: string | null;
  minPlayers: number;
  maxPlayers: number;
  organizer: string;
  organizerId: string;
  rsvps: Array<{ playerId: string; nickname: string; answer: 'join' | 'maybe' | 'skip'; etaMinutes: number | null }>;
  joined: number;
  myAnswer: 'join' | 'maybe' | 'skip' | null;
}

export interface SafetyState {
  submissionsDisabled: boolean;
  hidePublic: boolean;
  radioRequestsClosed: boolean;
}

export interface LiveSnapshot {
  serverNow: string;
  demo: boolean;
  themeVersion: number;
  event: EventInfo;
  players: PlayerCard[];
  health: { steam: ServiceHealth; spotify: ServiceHealth; server: ServiceHealth };
  wall: WallState;
  radio: RadioInfo;
  polls: PollInfo[];
  activities: ActivityInfo[];
  /** Several players are free at once: the dashboard suggests proposing something. */
  suggestion: { players: string[] } | null;
  safety: SafetyState;
  recapPublished: boolean;
  gameFinder: GameFinderInfo;
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
export const pinSignInSchema = z.strictObject({
  join: z.string().min(1).max(100).optional(),
  playerId: z.string().min(1).max(40).optional(),
  pin: z.string().regex(/^\d{4}$/, 'A PIN is 4 digits'),
}).refine(v => v.join || v.playerId, 'Pick your name first');
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

// --- Music, polls, activities, safety, setup ---

export const songRequestSchema = z.strictObject({
  uri: z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/).optional(),
  link: z.string().trim().max(300).optional(),
}).refine(v => v.uri || v.link, 'Pick a song or paste a Spotify link');
export const radioControlSchema = z.strictObject({
  action: z.enum(['pause', 'resume', 'skip', 'volume']),
  volume: z.number().int().min(0).max(100).optional(),
});

export const newPollSchema = z.strictObject({
  question: z.string().trim().min(1, 'Ask a question').max(120),
  mode: z.enum(['choice', 'yes_no_maybe']),
  options: z.array(z.string().trim().min(1).max(60)).max(6),
  anonymous: z.boolean(),
  minutes: z.number().int().min(1).max(240).nullable(),
});
export const voteSchema = z.strictObject({ option: z.number().int().min(0).max(5) });
export const closePollSchema = z.strictObject({ winner: z.number().int().min(0).max(5).nullable().optional() });

export const ACTIVITY_KIND_LABELS = { game: 'Group game', group_session: 'Group session', food_break: 'Food break', irl: 'IRL activity' } as const;
export const newActivitySchema = z.strictObject({
  title: z.string().trim().min(1, 'Name the activity').max(70),
  kind: z.enum(['game', 'group_session', 'food_break', 'irl']),
  startsInMinutes: z.number().int().min(0).max(720),
  minPlayers: z.number().int().min(1).max(32).nullable(),
  maxPlayers: z.number().int().min(1).max(32).nullable(),
});
export const rsvpSchema = z.strictObject({
  answer: z.enum(['join', 'maybe', 'skip']),
  etaMinutes: z.number().int().min(0).max(240).nullable(),
});
export const activityActionSchema = z.strictObject({ action: z.enum(['start', 'end', 'cancel']) });

export const safetySchema = z.strictObject({
  submissionsDisabled: z.boolean().optional(),
  hidePublic: z.boolean().optional(),
  radioRequestsClosed: z.boolean().optional(),
});

export const setupSecretSchema = z.strictObject({
  name: z.enum(['ADMIN_PASSWORD', 'STEAM_API_KEY', 'SPOTIFY_CLIENT_ID', 'DISCORD_BOT_TOKEN', 'AI_API_KEY']),
  value: z.string().trim().max(300).nullable(),
});
export const eventSettingsSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  newLan: z.boolean(),
});
export const discordSettingsSchema = z.strictObject({
  channelId: z.string().trim().regex(/^\d{5,25}$/, 'A Discord channel ID is a long number').nullable().optional(),
  selected: z.array(z.string().regex(/^\d+$/)).max(10).optional(),
});

// --- History and LAN Wrapped ---

export interface RecapSession { player: string; playerId: string; game: string; startedAt: string; seconds: number }

export interface RecapData {
  lan: { id: string; name: string; startsAt: string; endsAt: string; timezone: string };
  range: { from: string; to: string; label: string; final: boolean };
  totals: { hours: number; sessions: number; uniqueGames: number; songs: number; votes: number; activities: number; players: number };
  topGames: Array<{ name: string; hours: number; players: number }>;
  longestSessions: RecapSession[];
  biggestGroups: Array<{ game: string; players: string[]; at: string }>;
  mostVaried: { player: string; games: number } | null;
  /** Player-hours per hour of the day (0–23, event timezone). */
  hourly: number[];
  music: {
    total: number;
    topSongs: Array<{ title: string; artist: string; count: number }>;
    topArtists: Array<{ artist: string; count: number }>;
    perPlayer: Array<{ player: string; count: number }>;
    playlist: Array<{ title: string; artist: string; requester: string | null }>;
  };
  awards: Array<{ title: string; player: string; playerId: string; reason: string }>;
  timeline: Array<{ at: string; text: string }>;
  players: Array<{
    id: string; nickname: string; hours: number; sessions: number;
    games: Array<{ name: string; hours: number }>; longest: RecapSession | null;
    songs: number; votes: number; activities: number; favouriteHour: number | null; award: string | null;
  }>;
}

export interface LanSummary { id: string; name: string; startsAt: string; endsAt: string; hours: number; games: number; songs: number; topGame: string | null; players: number; final: boolean }

export interface GameFinderInfo {
  available: boolean;
  reason: string | null;
  games: Array<{ appId: string; name: string; owners: string[] }>;
}
