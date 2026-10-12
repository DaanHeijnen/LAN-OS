// How times and players read on screen.
import { clockTime, formatDuration, type PlayerCard } from '@lan-os/shared';

const seconds = (fromIso: string, now: Date) => Math.max(0, (now.getTime() - Date.parse(fromIso)) / 1000);

/** "45m ago", "3h ago", "2d ago" */
export function ago(fromIso: string, now: Date): string {
  const minutes = Math.floor(seconds(fromIso, now) / 60);
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

/** The big number on a player card: session time, time on the desktop, or how long ago they left. */
export function cardDuration(p: PlayerCard, now: Date): string {
  if (p.status === 'hidden') return '—';
  if (p.status === 'offline') return ago(p.statusSince, now);
  if (p.sessionStartedAt) return formatDuration(seconds(p.sessionStartedAt, now));
  if (p.status === 'unknown') return '—';
  return formatDuration(seconds(p.statusSince, now));
}

/** The game shown next to the status: the current one, or the last one for offline players. */
export function cardGame(p: PlayerCard): { name: string; prefix: string } | null {
  if (p.status === 'offline') return p.lastKnownGame ? { name: p.lastKnownGame.name, prefix: 'Last: ' } : null;
  return p.game ? { name: p.game.name, prefix: '' } : null;
}

/** "stale since 14:02" while Steam can't be reached. */
export function staleLabel(p: PlayerCard, timezone: string): string | null {
  if (p.status !== 'unknown') return null;
  if (!p.steamLinked) return 'not signed in yet';
  return p.updatedAt ? `stale since ${clockTime(new Date(p.updatedAt), timezone)}` : 'no data yet';
}

/** "Deep Rock Galactic" → "DR", "Valheim" → "V" (the cover tiles). */
export function gameCode(name: string): string {
  return name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '•';
}

/** One of the three cover gradients, picked by name so a game keeps its colour. */
export function gameTone(name: string): '' | 'valheim' | 'rocket' {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (['', 'valheim', 'rocket'] as const)[hash % 3]!;
}

export function initial(nickname: string): string {
  return nickname.trim()[0]?.toUpperCase() ?? '?';
}

/** "0:00" style for song progress. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
