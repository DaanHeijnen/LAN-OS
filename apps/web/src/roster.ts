// Groups players in the same game, then everyone else, as on the wall and dashboard.
import { DEMO_RADIO, type PlayerCard } from '@lan-os/shared';

export interface RosterGroups {
  groups: Array<{ game: string; players: PlayerCard[] }>;
  rest: PlayerCard[];
}

const REST_ORDER: Record<PlayerCard['status'], number> = { in_game: 0, away: 1, desktop: 2, unknown: 3, hidden: 4, offline: 5 };

export function groupRoster(players: PlayerCard[], { respectHidden }: { respectHidden: boolean }): RosterGroups {
  const byGame = new Map<string, PlayerCard[]>();
  for (const p of players) {
    if (p.status !== 'in_game' || !p.game || (respectHidden && p.hiddenFromWall)) continue;
    byGame.set(p.game.name, [...(byGame.get(p.game.name) ?? []), p]);
  }
  const groups = [...byGame.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([game, list]) => ({ game, players: list }))
    .sort((a, b) => b.players.length - a.players.length);
  const grouped = new Set(groups.flatMap(g => g.players.map(p => p.id)));
  const rest = players.filter(p => !grouped.has(p.id))
    .sort((a, b) => REST_ORDER[a.status] - REST_ORDER[b.status]);
  return { groups, rest };
}

/** Demo LAN Radio: plays through the sample queue in a loop, so progress moves. Real playback comes in M2. */
export function demoRadioAt(now: Date) {
  const tracks = [DEMO_RADIO.now, ...DEMO_RADIO.queue.map((t, i) => ({ ...t, position: 0, length: 200 + i * 17 }))];
  const loop = tracks.reduce((sum, t) => sum + t.length, 0);
  // Anchored so the first track is at 2:14 when the page opens on the design's sample moment.
  let t = (Math.floor(now.getTime() / 1000) + DEMO_RADIO.now.position) % loop;
  let index = 0;
  while (t >= tracks[index]!.length) t -= tracks[index++]!.length;
  const current = tracks[index]!;
  const queue = [...tracks.slice(index + 1), ...tracks.slice(0, index)].slice(0, DEMO_RADIO.queue.length);
  return { now: { ...current, position: t }, queue };
}
