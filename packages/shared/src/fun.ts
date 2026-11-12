// Song ratings, daily side quests and live achievements: small things that keep everyone playing along.
import { z } from 'zod';

// --- Song ratings ---

/** Thumbs on the song that plays now. */
export interface SongRatingInfo {
  up: number;
  down: number;
  /** The viewer's own thumb: 1 up, -1 down, null none. */
  mine: 1 | -1 | null;
}

/** 1 = thumbs up, -1 = thumbs down, 0 = take my thumb back. */
export const rateSongSchema = z.strictObject({ rating: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

// --- Side quests ---

export interface QuestInfo {
  enabled: boolean;
  /** LAN day the quests belong to; 0 before the LAN starts. */
  day: number;
  /** The viewer's quests for today (empty on the wall). */
  mine: Array<{ id: number; text: string; done: boolean }>;
  /** Everyone's progress today, most done first. */
  board: Array<{ player: string; playerId: string; done: number; total: number }>;
}

export const questDoneSchema = z.strictObject({ done: z.boolean() });

// --- Achievements ---

export const ACHIEVEMENT_IDS = [
  'marathon', 'night_owl', 'early_bird', 'explorer', 'full_house', 'opening_act', 'crowd_pleaser', 'voter', 'quest_master',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Name and emoji of each achievement. What it takes is filled in from achievements.yaml. */
export const ACHIEVEMENTS: Record<AchievementId, { title: string; emoji: string }> = {
  marathon: { title: 'Marathon', emoji: '🏃' },
  night_owl: { title: 'Night Owl', emoji: '🦉' },
  early_bird: { title: 'Early Bird', emoji: '🐦' },
  explorer: { title: 'Explorer', emoji: '🧭' },
  full_house: { title: 'Full House', emoji: '🏠' },
  opening_act: { title: 'Opening Act', emoji: '🎤' },
  crowd_pleaser: { title: 'Crowd Pleaser', emoji: '🔥' },
  voter: { title: 'Voice of the People', emoji: '🗳️' },
  quest_master: { title: 'Quest Master', emoji: '📜' },
};

/** Something worth a moment on the projector: an achievement, or a finished side quest. */
export interface MomentInfo {
  key: string;
  kind: 'achievement' | 'quest';
  player: string;
  playerId: string;
  title: string;
  emoji: string;
  detail: string;
  at: string;
}

export interface AchievementsInfo {
  enabled: boolean;
  /** How long a moment stays on the projector, in seconds (0 = not on the projector). */
  wallSeconds: number;
  /** Newest first. The wall shows the ones from the last few seconds. */
  recent: MomentInfo[];
  /** Every achievement for the viewer: earned or still to get (empty on the wall). */
  mine: Array<{ id: AchievementId; title: string; emoji: string; description: string; earnedAt: string | null; detail: string | null }>;
  /** How many achievements each player has, most first. */
  board: Array<{ player: string; playerId: string; count: number }>;
}
