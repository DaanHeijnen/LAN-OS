// One schema per config file. The file names, settings and allowed values are
// explained for humans in config/README.md and in the comments of each file.
import { z } from 'zod';
import { isRealDateTime, isValidTimezone, localDateTimeToDate } from '../time.ts';
import {
  dateTime, duration, hexColour, listOf, onOff, oneOf, section, shortText, slug, text, timezone, wholeNumber,
} from './fields.ts';

export const WALL_PANELS = ['music', 'poll', 'activity'] as const;
export const ROLES = ['player', 'admin'] as const;
export const PERMISSION_GROUPS = ['everyone', 'admins'] as const;
export const ACTIVITY_TYPES = ['game', 'group_session', 'food_break', 'irl'] as const;

export const eventSchema = section({
  name: shortText(40),
  lan_id: slug(),
  starts_at: dateTime(),
  ends_at: dateTime(),
  timezone: timezone(),
}).superRefine((event, ctx) => {
  if (!isRealDateTime(event.starts_at) || !isRealDateTime(event.ends_at) || !isValidTimezone(event.timezone)) return;
  const start = localDateTimeToDate(event.starts_at, event.timezone);
  const end = localDateTimeToDate(event.ends_at, event.timezone);
  if (end <= start) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'must be later than starts_at' });
});

const steamId = () => {
  const message = 'must be a 17-digit Steam ID between quotes, like "76561198012345678", or "" when not linked yet';
  return z.string({ error: message }).regex(/^(\d{17})?$/, { error: message });
};

export const playerSchema = section({
  id: slug(),
  nickname: shortText(20),
  steam_id: steamId(),
  role: oneOf(ROLES),
  hidden_from_wall: onOff(),
});

export const playersSchema = section({
  players: z.array(playerSchema, { error: 'must be a list of players, each starting with "- id:"' })
    .max(32, { error: 'must have at most 32 players' }),
}).superRefine((file, ctx) => {
  const seen = new Set<string>();
  file.players.forEach((player, index) => {
    if (seen.has(player.id)) {
      ctx.addIssue({ code: 'custom', path: ['players', index, 'id'], message: 'must be unique; another player already uses it' });
    }
    seen.add(player.id);
  });
});

export const wallSchema = section({
  panels: listOf(WALL_PANELS),
  night_mode: onOff(),
  brightness: wholeNumber(20, 100),
});

export const musicSchema = section({
  dj_rotation: onOff(),
  block_duplicates: onOff(),
  fallback_playlist: text('must be a Spotify playlist link between quotes, or ""'),
  skip_vote_threshold: wholeNumber(1, 7),
  hand_over_before_end: duration('5s', '60s'),
  who_can_pause: oneOf(PERMISSION_GROUPS),
  who_can_skip: oneOf(PERMISSION_GROUPS),
  who_can_change_volume: oneOf(PERMISSION_GROUPS),
});

export const votingSchema = section({
  default_poll_timer: duration('1m', '2h'),
  change_vote_window: duration('0s', '10m'),
  max_side_polls: wholeNumber(0, 5),
});

export const activitiesSchema = section({
  types: listOf(ACTIVITY_TYPES),
  default_min_players: wholeNumber(1, 32),
  default_max_players: wholeNumber(1, 32),
  reminder_lead_time: duration('1m', '1h'),
}).superRefine((file, ctx) => {
  if (file.default_max_players < file.default_min_players) {
    ctx.addIssue({ code: 'custom', path: ['default_max_players'], message: 'must be at least default_min_players' });
  }
});

export const announcementsSchema = section({
  humour: onOff(),
  min_gap: duration('5m', '2h'),
  average_gap: duration('15m', '4h'),
  trigger_long_session: onOff(),
  long_session_after: duration('1h', '12h'),
  trigger_poll_closed: onOff(),
  trigger_all_same_game: onOff(),
  trigger_rare_combo: onOff(),
  night_mode_lines: z.array(shortText(120), { error: 'must be a list of short lines, each starting with "- "' }),
});

export const integrationsSchema = section({
  steam_enabled: onOff(),
  steam_poll_interval: duration('10s', '5m'),
  spotify_enabled: onOff(),
  discord_enabled: onOff(),
  ai_enabled: onOff(),
});

export const serverSchema = section({
  port: wholeNumber(1024, 65535),
  hostname: text('must be a hostname between quotes, like "lan-os.local"'),
  backup_interval: duration('15m', '24h'),
  log_retention: duration('1d', '365d'),
});

const fontSize = (min: number) => wholeNumber(min, 200);

export const themeSchema = section({
  surfaces: section({ surface_wall: hexColour(), surface_card: hexColour(), surface_raised: hexColour() }),
  text: section({ text_primary: hexColour(), text_secondary: hexColour(), text_quiet: hexColour() }),
  status: section({
    status_in_game: hexColour(), status_desktop: hexColour(), status_away: hexColour(),
    status_offline: hexColour(), status_hidden: hexColour(), status_looking: hexColour(),
  }),
  accent: section({ accent_main: hexColour() }),
  night_mode: section({
    surface_wall: hexColour(), surface_card: hexColour(), surface_raised: hexColour(),
    text_primary: hexColour(), text_secondary: hexColour(), text_quiet: hexColour(),
    accent_main: hexColour(),
    status_in_game: hexColour(), status_desktop: hexColour(), status_away: hexColour(),
    status_offline: hexColour(), status_hidden: hexColour(), status_looking: hexColour(),
  }),
  typography: section({
    font_family: shortText(200),
    size_clock: fontSize(22),
    size_duration: fontSize(22),
    size_headline: fontSize(22),
    size_name: fontSize(22),
    size_body: fontSize(28),
    size_secondary: fontSize(22),
    size_minimum: fontSize(16),
    weight_bold: wholeNumber(100, 900),
  }),
  spacing: section({
    space_frame: wholeNumber(0, 200),
    space_gap: wholeNumber(0, 200),
    space_list: wholeNumber(0, 200),
    space_panel: wholeNumber(0, 200),
    radius_card: wholeNumber(0, 200),
    radius_group: wholeNumber(0, 200),
    radius_pill: wholeNumber(0, 999),
  }),
});

export const CONFIG_SCHEMAS = {
  event: eventSchema,
  players: playersSchema,
  wall: wallSchema,
  music: musicSchema,
  voting: votingSchema,
  activities: activitiesSchema,
  announcements: announcementsSchema,
  integrations: integrationsSchema,
  server: serverSchema,
  theme: themeSchema,
} as const;

export type ConfigName = keyof typeof CONFIG_SCHEMAS;
export const CONFIG_NAMES = Object.keys(CONFIG_SCHEMAS) as ConfigName[];
export type Config = { [K in ConfigName]: z.infer<(typeof CONFIG_SCHEMAS)[K]> };

export type EventConfig = Config['event'];
export type PlayersConfig = Config['players'];
export type PlayerConfig = z.infer<typeof playerSchema>;
export type WallConfig = Config['wall'];
export type ThemeConfig = Config['theme'];
