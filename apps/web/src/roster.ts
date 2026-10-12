// Groups players in the same game, then everyone else, as on the wall and dashboard.
import type { PlayerCard } from '@lan-os/shared';

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
