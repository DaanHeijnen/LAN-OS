// Fills the demo database with the design's sample moment: sessions that started
// a while ago, so durations like "2h 14m" and "3h ago" show straight away.
import type { Accounts } from '../auth/accounts.ts';
import type { ConfigStore } from '../config/store.ts';
import type { Db } from '../db/database.ts';
import { appendEvent, upsertLan } from '../db/events.ts';
import { saveProfile } from '../db/profiles.ts';
import { DEMO_GAMES, demoSteamId, OPENING_AGE_MINUTES } from './demo-steam.ts';
import { DEMO_CATALOGUE } from './fake-spotify.ts';

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
    // The design's poll "Next break?" (Alex asked; 6 of 7 voted) and the activity "Pizza break" (in 18 minutes).
    const ids = players.map(p => p.id);
    if (ids.length >= 7) {
      const poll = Number(db.prepare(`INSERT INTO polls (lan_id, created_by, question, mode, options, anonymous, is_main, created_at, closes_at)
        VALUES (?, ?, 'Next break?', 'choice', ?, 0, 1, ?, ?)`).run(event.lan_id, ids[4], JSON.stringify(['Pizza', 'Walk outside', 'Keep playing']),
        ago(4).toISOString(), new Date(now.getTime() + 20 * 60_000).toISOString()).lastInsertRowid);
      const vote = db.prepare('INSERT INTO poll_votes (poll_id, player_id, option_index, first_voted_at, voted_at) VALUES (?, ?, ?, ?, ?)');
      [[1, 0], [2, 0], [4, 0], [3, 1], [5, 1], [6, 2]].forEach(([p, o]) => vote.run(poll, ids[p!], o, ago(3).toISOString(), ago(3).toISOString()));
      const activity = Number(db.prepare(`INSERT INTO activities (lan_id, created_by, title, kind, starts_at, min_players, max_players, created_at)
        VALUES (?, ?, 'Pizza break', 'food_break', ?, 2, 7, ?)`).run(event.lan_id, ids[4], new Date(now.getTime() + 18 * 60_000).toISOString(), ago(10).toISOString()).lastInsertRowid);
      const rsvp = db.prepare("INSERT INTO activity_rsvps (activity_id, player_id, answer, eta_minutes, answered_at) VALUES (?, ?, 'join', ?, ?)");
      [4, 1, 2, 5, 6].forEach((p, i) => rsvp.run(activity, ids[p], i ? 5 : null, ago(8).toISOString()));
    }
    // LAN Radio: "Take On Me" requested by Nick is playing; four requests wait in the fair queue.
    if (ids.length >= 7) {
      const song = (title: string) => DEMO_CATALOGUE.find(t => t.title === title)!;
      const request = db.prepare(`INSERT INTO radio_requests (lan_id, player_id, track_uri, title, artist, album_art, duration_ms, state, requested_at, sent_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`);
      const add = (player: number, title: string, state: 'sent' | 'waiting', minutesAgo: number) => {
        const t = song(title);
        request.run(event.lan_id, ids[player], t.uri, t.title, t.artist, t.durationMs, state, ago(minutesAgo).toISOString(), state === 'sent' ? ago(3).toISOString() : null);
      };
      add(3, 'Take On Me', 'sent', 9);
      add(0, 'Mr. Brightside', 'waiting', 8);
      add(4, 'Africa', 'waiting', 7);
      add(2, 'Blinding Lights', 'waiting', 6);
      add(5, 'Take Five', 'waiting', 5);
    }
    // Nick is looking for players in the design.
    if (players[3]) saveProfile(db, event.lan_id, players[3].id, { looking: true }, now);
  })();
}
