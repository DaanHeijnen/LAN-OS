// What a player is doing right now, derived from Steam plus the player's own settings.
// Status is always shown as colour + icon + word; see STATUS_DISPLAY.

/** Fields we read from Steam's ISteamUser/GetPlayerSummaries/v0002. All game fields are optional. */
export interface SteamSummary {
  steamid: string;
  personaname?: string;
  avatarfull?: string;
  /** 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 looking to trade, 6 looking to play */
  personastate: number;
  gameid?: string;
  gameextrainfo?: string;
  /** "ip:port" of a matchmade server; "0.0.0.0:0" means none. */
  gameserverip?: string;
  /** Not in Valve's public docs, but returned for joinable lobbies. Treated as optional. */
  lobbysteamid?: string;
}

export const PRESENCE_STATUSES = ['in_game', 'desktop', 'away', 'offline', 'hidden', 'unknown'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const STATUS_DISPLAY: Record<PresenceStatus | 'looking', { icon: string; word: string; token: string }> = {
  in_game: { icon: '▶', word: 'In game', token: '--status-in-game' },
  desktop: { icon: '▣', word: 'Desktop', token: '--status-desktop' },
  away: { icon: '◕', word: 'Away', token: '--status-away' },
  offline: { icon: '○', word: 'Offline', token: '--status-offline' },
  hidden: { icon: '◌', word: 'Hidden', token: '--status-hidden' },
  unknown: { icon: '?', word: 'Unknown', token: '--status-offline' },
  looking: { icon: '⌕', word: 'Looking', token: '--status-looking' },
};

export interface Game {
  name: string;
  /** Steam app id; null for a manual, non-Steam game. */
  appId: string | null;
}

export interface DerivedPresence {
  status: Exclude<PresenceStatus, 'hidden'>;
  game: Game | null;
}

export interface PresenceInput {
  /** undefined when the player has no Steam ID or Steam didn't return them. */
  summary: SteamSummary | undefined;
  /** false when the last Steam request failed. */
  steamReachable: boolean;
  /** The player's own override, used while they are online. */
  manualGame: string | null;
}

/**
 * Steam state → LAN OS status. Away/Snooze win over In game (the game is still shown),
 * a manual game turns Online into In game, and an unreachable Steam gives "unknown".
 * Hidden-from-wall is applied later, per viewer.
 */
export function derivePresence({ summary, steamReachable, manualGame }: PresenceInput): DerivedPresence {
  if (!steamReachable) return { status: 'unknown', game: null };
  if (!summary || summary.personastate === 0) return { status: 'offline', game: null };
  const game: Game | null = manualGame
    ? { name: manualGame, appId: null }
    : summary.gameid ? { name: summary.gameextrainfo || `App ${summary.gameid}`, appId: summary.gameid } : null;
  if (summary.personastate === 3 || summary.personastate === 4) return { status: 'away', game };
  return { status: game ? 'in_game' : 'desktop', game };
}

export type SteamLink =
  | { kind: 'join_lobby'; url: string }
  | { kind: 'join_server'; url: string }
  | { kind: 'profile'; url: string };

const NO_SERVER = /^0\.0\.0\.0(:0)?$/;

/**
 * "Join game" when Steam exposes a lobby or a server for this friend, otherwise the
 * "Steam ↗" fallback that opens their profile in the Steam client.
 */
export function buildSteamLink(summary: Pick<SteamSummary, 'steamid' | 'gameid' | 'gameserverip' | 'lobbysteamid'>): SteamLink {
  const { steamid, gameid, lobbysteamid, gameserverip } = summary;
  if (gameid && lobbysteamid && /^\d+$/.test(lobbysteamid) && lobbysteamid !== '0') {
    return { kind: 'join_lobby', url: `steam://joinlobby/${gameid}/${lobbysteamid}/${steamid}` };
  }
  if (gameid && gameserverip && !NO_SERVER.test(gameserverip) && /^[\d.]+:\d+$/.test(gameserverip)) {
    return { kind: 'join_server', url: `steam://connect/${gameserverip}` };
  }
  return { kind: 'profile', url: `steam://url/SteamIDPage/${steamid}` };
}

export const isJoinable = (link: SteamLink) => link.kind !== 'profile';
