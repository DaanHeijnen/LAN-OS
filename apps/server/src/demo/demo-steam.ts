// Demo mode: a pretend Steam that matches the approved design's sample moment,
// then slowly changes so grouping, sessions and Join game can be seen working.
import type { SteamSummary } from '@lan-os/shared';
import type { PresenceSource } from '../presence/steam-api.ts';

export const DEMO_GAMES = {
  drg: { gameid: '548430', gameextrainfo: 'Deep Rock Galactic' },
  valheim: { gameid: '892970', gameextrainfo: 'Valheim' },
  rocket: { gameid: '252950', gameextrainfo: 'Rocket League' },
  cs2: { gameid: '730', gameextrainfo: 'Counter-Strike 2' },
  factorio: { gameid: '427520', gameextrainfo: 'Factorio' },
} as const;

/** A demo Steam ID per roster position: 76561190000000001, …0002, … */
export const demoSteamId = (index: number) => `7656119${String(index + 1).padStart(10, '0')}`;

type DemoState = Omit<SteamSummary, 'steamid'>;

/** The design's sample moment, by roster position (Mara, Joris, Sam, Nick, Alex, Lisa, Tom). */
const OPENING: DemoState[] = [
  { personastate: 1, ...DEMO_GAMES.drg },
  { personastate: 1, ...DEMO_GAMES.drg, lobbysteamid: '109775240000000001' },
  { personastate: 1, ...DEMO_GAMES.valheim },
  { personastate: 1, ...DEMO_GAMES.valheim, gameserverip: '192.168.1.42:2456' },
  { personastate: 3, ...DEMO_GAMES.rocket },
  { personastate: 1 },
  { personastate: 0 },
];

/** How long ago each opening state began, in minutes: shown as the session or status time. */
export const OPENING_AGE_MINUTES = [134, 129, 400, 3, 112, 12, 180];

/** Scripted changes, one every few polls, looping. [roster position, new state] */
const SCRIPT: Array<[number, DemoState]> = [
  [5, { personastate: 1, ...DEMO_GAMES.valheim, lobbysteamid: '109775240000000002' }],
  [4, { personastate: 1, ...DEMO_GAMES.rocket }],
  [6, { personastate: 1 }],
  [0, { personastate: 3, ...DEMO_GAMES.drg }],
  [6, { personastate: 1, ...DEMO_GAMES.factorio }],
  [0, { personastate: 1, ...DEMO_GAMES.drg }],
  [5, { personastate: 1 }],
  [6, { personastate: 0 }],
  [4, { personastate: 3, ...DEMO_GAMES.rocket }],
];

export class DemoSteam implements PresenceSource {
  private states = new Map<string, DemoState>();
  private polls = 0;
  private step = 0;
  private readonly pollsPerChange: number;

  constructor(pollsPerChange = 8) {
    this.pollsPerChange = pollsPerChange;
  }

  async fetchSummaries(steamIds: string[]): Promise<SteamSummary[]> {
    this.polls++;
    if (this.polls % this.pollsPerChange === 0) {
      const [index, state] = SCRIPT[this.step % SCRIPT.length]!;
      this.states.set(demoSteamId(index), state);
      this.step++;
    }
    return steamIds.map((steamid, index) => {
      const state = this.states.get(steamid) ?? OPENING[index % OPENING.length]!;
      return { steamid, personaname: `Demo ${index + 1}`, ...state };
    });
  }
}
