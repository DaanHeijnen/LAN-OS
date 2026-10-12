// Steam presence without an API key: every public Steam profile has an XML version
// (steamcommunity.com/profiles/<id>/?xml=1). It shows online / in game / offline and the game,
// but not Away or lobbies. With a Steam Web API key LAN OS uses SteamWebApi instead.
import type { SteamSummary } from '@lan-os/shared';
import type { PresenceSource } from './steam-api.ts';

/** A short pause between profiles, so Steam doesn't see a burst of requests. */
const GAP_MS = 250;

const tag = (xml: string, name: string): string | undefined => {
  const match = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml);
  return match ? match[1]!.trim() : undefined;
};

/** Turns one profile's XML into the same shape the Web API returns. */
export function parseProfileXml(steamid: string, xml: string): SteamSummary {
  const online = tag(xml, 'onlineState') ?? 'offline';
  const message = (tag(xml, 'stateMessage') ?? '').toLowerCase();
  const info = tag(xml, 'inGameInfo');
  const gameName = info ? tag(info, 'gameName') : undefined;
  const appId = info ? /\/app\/(\d+)|steam:\/\/run\/(\d+)/.exec(tag(info, 'gameLink') ?? '') : null;
  const server = tag(xml, 'inGameServerIP');
  const away = message.includes('away') || message.includes('snooze');
  return {
    steamid,
    personaname: tag(xml, 'steamID'),
    avatarfull: tag(xml, 'avatarFull'),
    personastate: online === 'offline' ? 0 : away ? 3 : 1,
    ...(online === 'in-game' && gameName ? {
      gameextrainfo: gameName,
      gameid: appId ? (appId[1] ?? appId[2]) : undefined,
      ...(server ? { gameserverip: server } : {}),
    } : {}),
  };
}

export class SteamCommunityProfiles implements PresenceSource {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async fetchSummaries(steamIds: string[]): Promise<SteamSummary[]> {
    const result: SteamSummary[] = [];
    for (const [index, id] of steamIds.entries()) {
      if (index > 0) await new Promise(r => setTimeout(r, GAP_MS));
      const response = await this.fetchImpl(`https://steamcommunity.com/profiles/${id}/?xml=1`, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'Accept-Language': 'en' },
      });
      if (response.status === 429) throw new Error('Steam asked LAN OS to slow down; trying again shortly');
      if (!response.ok) throw new Error(`Steam answered with HTTP ${response.status}`);
      const xml = await response.text();
      if (!xml.includes('<profile>')) throw new Error('Steam sent an unexpected answer');
      result.push(parseProfileXml(id, xml));
    }
    return result;
  }
}
