// Template lines for wall announcements: short and factual-sounding, based on real activity.
// No persona or announcer character. Used directly, or as the facts an AI rewrites.
import { formatDuration } from '@lan-os/shared';

export type Trigger =
  | { kind: 'long_session'; player: string; game: string; seconds: number }
  | { kind: 'poll_closed'; question: string; winner: string | null; votes: number; tie: boolean }
  | { kind: 'all_same_game'; game: string; players: number }
  | { kind: 'rare_combo'; combo: 'all_desktop' | 'many_away' | 'nobody_gaming'; players: string[] }
  | { kind: 'activity_soon'; title: string; minutes: number; joined: number };

const pick = <T,>(list: T[], seed: number): T => list[Math.abs(seed) % list.length]!;
const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

/** A plain fact, for humour off. */
export function factLine(t: Trigger): string {
  switch (t.kind) {
    case 'long_session': return `${t.player} has been in ${t.game} for ${formatDuration(t.seconds)} straight.`;
    case 'poll_closed': return t.tie ? `"${t.question}" ended in a tie. The host decides.`
      : t.winner ? `"${t.question}": ${t.winner} wins with ${t.votes} vote${t.votes === 1 ? '' : 's'}.` : `"${t.question}" closed without votes.`;
    case 'all_same_game': return `Everyone is in ${t.game}.`;
    case 'rare_combo': return t.combo === 'all_desktop' ? `${names(t.players)} are all on the desktop.`
      : t.combo === 'many_away' ? `${names(t.players)} are all away at the same time.` : 'Nobody is in a game right now.';
    case 'activity_soon': return `${t.title} starts in ${t.minutes} minutes. ${t.joined} joined.`;
  }
}

/** The normal, lightly funny version. */
export function humourLine(t: Trigger, seed: number): string {
  switch (t.kind) {
    case 'long_session': return pick([
      `${t.player} has been in ${t.game} for ${formatDuration(t.seconds)} straight.`,
      `${formatDuration(t.seconds)} of ${t.game} for ${t.player}. Hydration check recommended.`,
      `${t.player}: ${formatDuration(t.seconds)} in ${t.game} and counting.`,
    ], seed);
    case 'poll_closed': return t.tie ? `"${t.question}" is a perfect tie. Democracy has failed; the host decides.`
      : t.winner ? pick([`The room has spoken: ${t.winner}.`, `"${t.question}" → ${t.winner}, with ${t.votes} vote${t.votes === 1 ? '' : 's'}.`], seed)
        : `"${t.question}" closed. Nobody voted. Bold.`;
    case 'all_same_game': return `Everyone is in ${t.game}. A historic moment.`;
    case 'rare_combo': return t.combo === 'all_desktop' ? pick([`${names(t.players)} are all on the desktop. Suspicious.`, `${names(t.players)}: desktop, desktop, desktop.`], seed)
      : t.combo === 'many_away' ? `${names(t.players)} are all away. Snack run, probably.` : 'Nobody is gaming. Is this a LAN or a book club?';
    case 'activity_soon': return `${t.title} in ${t.minutes} minutes. ${t.joined} ${t.joined === 1 ? 'person has' : 'people have'} joined.`;
  }
}

/** Night mode: the playful drinking-game tone. */
export function nightLine(t: Trigger, seed: number, extraLines: string[]): string {
  // Now and then one of the owner's own lines from announcements.yaml → night_mode_lines.
  if (extraLines.length && seed % 3 === 0 && t.kind !== 'poll_closed') return pick(extraLines, seed);
  switch (t.kind) {
    case 'long_session': return `${t.player} has played ${t.game} for ${formatDuration(t.seconds)}. Take a sip for every hour.`;
    case 'poll_closed': return t.winner ? `${t.winner} wins "${t.question}". Everyone who voted for it drinks.` : `"${t.question}" is a tie. Everybody drinks.`;
    case 'all_same_game': return `Everyone is in ${t.game}. Everyone drinks.`;
    case 'rare_combo': return t.combo === 'nobody_gaming' ? 'Nobody is in a game. Waterfall!' : `${names(t.players)}: matching status. You two… three… drink.`;
    case 'activity_soon': return `${t.title} in ${t.minutes} minutes. Last one there drinks.`;
  }
}
