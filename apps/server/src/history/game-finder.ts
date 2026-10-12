// Shared Game Finder: games several players own, from their Steam libraries.
// Steam only shares libraries through the Web API, so this needs a Steam API key.
import type { GameFinderInfo } from '@lan-os/shared';
import type { Db } from '../db/database.ts';
import { log } from '../logging.ts';

/** A library is fetched again after this long. */
const REFRESH_MS = 6 * 3_600_000;
const SHOW = 12;

export class GameFinder {
  private readonly db: Db;
  private readonly apiKey: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private refreshing = false;

  constructor(db: Db, apiKey: () => string | null, fetchImpl: typeof fetch = fetch) {
    this.db = db;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  private fetchedAt(steamId: string): number {
    const at = this.db.prepare('SELECT MAX(fetched_at) FROM owned_games WHERE steam_id = ?').pluck().get(steamId) as string | null;
    return at ? Date.parse(at) : 0;
  }

  /** Fetches libraries that are missing or old. Private libraries are skipped quietly. */
  async refresh(steamIds: string[]): Promise<void> {
    const key = this.apiKey();
    if (!key || this.refreshing) return;
    this.refreshing = true;
    try {
      for (const steamId of steamIds) {
        if (Date.now() - this.fetchedAt(steamId) < REFRESH_MS) continue;
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${new URLSearchParams({
          key, steamid: steamId, include_appinfo: '1', include_played_free_games: '1', format: 'json',
        })}`;
        const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) continue;
        const games = ((await response.json()) as { response?: { games?: Array<{ appid: number; name?: string }> } }).response?.games ?? [];
        this.store(steamId, games.filter(g => g.name).map(g => ({ appId: String(g.appid), name: g.name! })));
      }
    } catch (error) {
      log.warn(`Shared Game Finder: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.refreshing = false;
    }
  }

  store(steamId: string, games: Array<{ appId: string; name: string }>, at = new Date()): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM owned_games WHERE steam_id = ?').run(steamId);
      const insert = this.db.prepare('INSERT INTO owned_games (steam_id, app_id, name, fetched_at) VALUES (?, ?, ?, ?)');
      for (const g of games) insert.run(steamId, g.appId, g.name, at.toISOString());
      // An empty marker row is not needed: fetched_at lives on each game. A private library just stays empty.
    })();
  }

  info(players: Array<{ nickname: string; steamId: string | null }>, demo: boolean): GameFinderInfo {
    if (!this.apiKey() && !demo) {
      return { available: false, reason: 'Needs a Steam API key. An admin can add one on the admin page.', games: [] };
    }
    const owners = new Map<string, { name: string; owners: string[] }>();
    for (const p of players) {
      if (!p.steamId) continue;
      const rows = this.db.prepare('SELECT app_id, name FROM owned_games WHERE steam_id = ?').all(p.steamId) as Array<{ app_id: string; name: string }>;
      for (const r of rows) {
        const entry = owners.get(r.app_id) ?? { name: r.name, owners: [] };
        entry.owners.push(p.nickname);
        owners.set(r.app_id, entry);
      }
    }
    const games = [...owners.entries()].filter(([, g]) => g.owners.length > 1)
      .sort((a, b) => b[1].owners.length - a[1].owners.length || a[1].name.localeCompare(b[1].name))
      .slice(0, SHOW).map(([appId, g]) => ({ appId, name: g.name, owners: g.owners }));
    return {
      available: true,
      reason: games.length ? null : 'No games in common yet. Libraries must be public on Steam; they load within a few minutes.',
      games,
    };
  }
}
