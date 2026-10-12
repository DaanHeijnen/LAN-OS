// Fills the demo database with the design's sample moment: sessions that started
// a while ago, so durations like "2h 14m" and "3h ago" show straight away.
import type { Accounts } from '../auth/accounts.ts';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent, upsertLan } from '../db/events.ts';
import { saveProfile } from '../db/profiles.ts';
import { DEMO_GAMES, demoSteamId, OPENING_AGE_MINUTES } from './demo-steam.ts';

/** Which demo game each roster position starts in (matches demo-steam's opening state). */
const OPENING_GAME: Array<keyof typeof DEMO_GAMES | null> = ['drg', 'drg', 'valheim', 'valheim', 'rocket', null, null];
const OPENING_STATUS = ['in_game', 'in_game', 'in_game', 'in_game', 'away', 'desktop', 'offline'] as const;
/** Earlier sessions, so "Your last sessions" has content: [roster position, game, minutes long, ended minutes ago]. */
const EARLIER: Array<[number, keyof typeof DEMO_GAMES, number, number]> = [
  [0, 'valheim', 82, 300], [0, 'rocket', 48, 1200], [1, 'cs2', 41, 400], [2, 'factorio', 195, 700],
  // Tom went offline 3h ago, after Counter-Strike 2.
  [6, 'cs2', 165, 180],
];

export function seedDemo(db: Db, store: ConfigStore, accounts: Accounts, now = new Date()): void {
  const event = store.get('event');
  upsertLan(db, event, now);
  const players = store.get('players').players;
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const game = (key: keyof typeof DEMO_GAMES) => ({ game: DEMO_GAMES[key].gameextrainfo, app_id: DEMO_GAMES[key].gameid });

  db.transaction(() => {
    for (const [index, key, length, endedAgo] of EARLIER) {
      const player = players[index];
      if (!player) continue;
      appendEvent(db, event.lan_id, 'game_session_started', player.id, game(key), ago(endedAgo + length));
      appendEvent(db, event.lan_id, 'game_session_ended', player.id,
        { ...game(key), started_at: ago(endedAgo + length).toISOString(), seconds: length * 60 }, ago(endedAgo));
    }
    players.forEach((player, i) => {
      const index = i % OPENING_STATUS.length;
      const since = ago(OPENING_AGE_MINUTES[index]!);
      const key = OPENING_GAME[index];
      if (key) appendEvent(db, event.lan_id, 'game_session_started', player.id, game(key), since);
      appendEvent(db, event.lan_id, 'presence_changed', player.id,
        { status: OPENING_STATUS[index], ...(key ? game(key) : { game: null, app_id: null }) }, since);
      if (!accounts.joinLinkFor(player.id)) accounts.createJoinLink(player.id, now);
    });
    // Steam libraries for the Shared Game Finder.
    const library = [['548430', 'Deep Rock Galactic'], ['892970', 'Valheim'], ['252950', 'Rocket League'], ['730', 'Counter-Strike 2'],
      ['427520', 'Factorio'], ['105600', 'Terraria'], ['1086940', "Baldur's Gate 3"], ['413150', 'Stardew Valley'], ['620', 'Portal 2']];
    const insert = db.prepare('INSERT OR REPLACE INTO owned_games (steam_id, app_id, name, fetched_at) VALUES (?, ?, ?, ?)');
    players.forEach((_, i) => {
      library.filter((_, g) => (g + i) % 3 !== 0 || g < 2).forEach(([appId, name]) => insert.run(demoSteamId(i), appId, name, now.toISOString()));
    });
    // Nick is looking for players in the design.
    if (players[3]) saveProfile(db, event.lan_id, players[3].id, { looking: true }, now);
  })();
}
