// Where presence comes from: the real Steam Web API, or the demo simulator.
import type { SteamSummary } from '@lan-os/shared';

export interface PresenceSource {
  /** Throws when Steam can't be reached; the poller then shows "Unknown". */
  fetchSummaries(steamIds: string[]): Promise<SteamSummary[]>;
}

const ENDPOINT = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';
const MAX_IDS_PER_REQUEST = 100;

export class SteamWebApi implements PresenceSource {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async fetchSummaries(steamIds: string[]): Promise<SteamSummary[]> {
    const result: SteamSummary[] = [];
    for (let i = 0; i < steamIds.length; i += MAX_IDS_PER_REQUEST) {
      const ids = steamIds.slice(i, i + MAX_IDS_PER_REQUEST);
      const url = `${ENDPOINT}?${new URLSearchParams({ key: this.apiKey, steamids: ids.join(',') })}`;
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      if (response.status === 403) throw new Error('Steam refused the API key (check STEAM_API_KEY in .env)');
      if (!response.ok) throw new Error(`Steam answered with HTTP ${response.status}`);
      const body = await response.json() as { response?: { players?: SteamSummary[] } };
      result.push(...(body.response?.players ?? []));
    }
    return result;
  }
}

/** Steam game art for the cover tile. Needs internet; the web app falls back to initials. */
export const steamCoverUrl = (appId: string) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
