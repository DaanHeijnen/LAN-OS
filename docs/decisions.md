# Decisions

Locked decisions for LAN OS. Don't re-ask these; change them only on the owner's request.

## Product

- **Purpose:** show who is playing what and for how long (including who is playing nothing), run LAN Radio (Spotify), and build history and stats across LAN weekends.
- **Players:** about 7, preconfigured in `config/players.yaml`. Each gets a personal join link and signs in with Steam (OpenID). Sessions restore automatically; an optional 4-digit PIN protects returning on a new browser.
- **Admins:** several trusted players, with `role: admin` in `players.yaml`, plus an admin password in `.env`. There is a separate admin page and an admin tab in the player app.
- **Network:** LAN only, with no remote access. Local features work without internet. Steam, Spotify, Discord and AI degrade gracefully.
- **Next LAN:** 19 Nov 2026 19:00 to 22 Nov 2026 15:00, Europe/Amsterdam. It is set in `config/event.yaml` and never hardcoded.
- **Host:** Windows 10/11 only for now.

## Wall and dashboards

- "Looking for players" is a status on the player card, not a separate board.
- A countdown appears only for a scheduled poll or activity. There is no standalone countdown.
- There is no sound from the projector. Optional sound cues play on player dashboards only.
- The projector runs 24/7. Admins can dim it, blank it, pause it and toggle night mode.
- Admins can push a plain-text projector message. There is no styled announcement builder.
- The clock shows "Day X" and the hours remaining.
- When everyone is in the same game, the wall shows one short, large announcement and nothing more.
- Players can override their detected game or add a non-Steam game.

## Humour

- Lines are short and factual-sounding, based on real activity. There is no persona or announcer character.
- Manual night mode switches announcements to a playful drinking-game tone.
- Admins can turn humour off (`announcements.yaml → humour`).

## Music and activities

- Music requests are unlimited per player and ordered by DJ rotation (round-robin between requesters).
- An activity starts at its scheduled time or when the organizer presses Start, whichever comes first.

## Join game

- When Steam's `GetPlayerSummaries` exposes a lobby (`lobbysteamid`) or a server (`gameserverip`) for a friend, show "Join game". It links to `steam://joinlobby/<appid>/<lobbyid>/<steamid64>` or `steam://connect/<ip:port>`.
- Otherwise show "Steam ↗", which opens `steam://url/SteamIDPage/<steamid64>`.
- **Checked against the docs (Oct 2026):** `personastate` (0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 looking to trade, 6 looking to play), `gameid`, `gameextrainfo` and `gameserverip` are documented. `"0.0.0.0:0"` means "no server". `lobbysteamid` is not in Valve's public docs, although Steam returns it for joinable lobbies. LAN OS treats it as optional, so a missing value safely falls back to "Steam ↗".

## Presence rules (implementation)

- Steam Away or Snooze shows **Away**, even while in a game. The game name stays visible and its session keeps running.
- A manual game override applies only while the player is online.
- When Steam can't be reached, the status shows **Unknown** with the time of the last update. Running sessions are not ended.
- Session time is measured from the moment LAN OS first sees a game, not from Steam's own data.
- Hide-from-wall is stored in `players.yaml → hidden_from_wall`, so the admin page, the player toggle and hand edits share one source.

## Technical

- **Stack (locked):** Node.js 22 LTS, strict TypeScript, npm workspaces, Fastify with one WebSocket channel, SQLite via better-sqlite3 with plain SQL migrations, React + Vite (`/wall`, `/app`, `/admin`), zod, `yaml` (Document API) and Vitest.
- **No build step on the server:** Node 22 runs the TypeScript files directly (type stripping), so source files use only erasable TypeScript syntax and import with `.ts` extensions.
- **Times:** stored in UTC (ISO 8601) in the database. Config files use local `"YYYY-MM-DD HH:MM"` in the event timezone.
- **Demo mode** uses its own database file, so demo data never mixes with real history.
- **UI:** there is no separate component library. The approved prototype in `design/prototype/` is the design system: its CSS is copied unchanged into `apps/web/src/styles/` and its markup and class names are ported into React components. Additions live only in `lan-os.css`.
- **Extra packages** (beyond the locked stack): `@fastify/websocket` (the WebSocket channel), `@vitejs/plugin-react` (React in Vite), and `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` (for `npm run lint`).
- **Wall type sizes** follow the prototype's `wall.css` exactly, which is what the screenshots show. `theme.yaml`'s size tokens are generated as CSS variables, but the copied wall styles use fixed pixel sizes, so changing a size in `theme.yaml` doesn't resize the wall yet. Colours, spacing tokens and night mode do follow `theme.yaml` live.
- **Panels from later milestones** (LAN Radio, polls, activities, Shared Game Finder) show sample data, labelled "sample" or "coming soon". Their buttons explain that instead of pretending to work. "Your last sessions" already uses real data.
- **Join links** are made by an admin (demo mode makes them automatically). The token is kept in the database so the link can be copied again; making a new link retires the old one.
- **Admin access:** a signed-in player with `role: admin`, or the `ADMIN_PASSWORD` from `.env`. In demo mode, join links sign in without Steam.
- **Exit codes:** LAN OS exits with 2 on a config problem (the start file waits for a fix) and 1 on a crash (the start file restarts it after 5 seconds).

## Milestones 2–6 (owner's request: a finished product with sign-in inside the app)

- **Setup happens in the app.** The setup page writes keys to `.env` and settings to `config/`. The owner never edits files.
- **The host PC is always admin.** Requests from the host PC itself (127.0.0.1) get admin access; other PCs need an admin player or the admin password.
- **Steam without an API key.** Presence comes from public Steam profiles (`steamcommunity.com/profiles/<id>/?xml=1`): in game, online and offline, the game, and server IPs. A Steam Web API key is optional and adds Away, lobby joins and the Shared Game Finder (owned games are only available through the API).
- **"Sign in through Steam" for everyone.** A known Steam account goes straight in. A new one picks an unlinked name ("Which one are you?") or adds itself as a new player; trusted friends on a LAN, and admins can remove anyone. Join links and PINs still work.
- **Spotify needs a developer app.** Spotify only lets registered apps log in, and since February 2026 the app owner must have Premium. The setup page walks the host through creating one; LAN OS uses PKCE, so only the Client ID is needed. Spotify requires the redirect address `http://127.0.0.1:<port>/auth/spotify/callback`, so connecting happens on the host PC.
- **DJ rotation:** requesters take turns; whoever was served least recently goes first.
- **Panels when nothing is active:** the poll panel shows picked Discord highlights or stays quiet; the activity panel invites a proposal.
- **Demo mode** seeds the design's sample moment as real data (sessions, the "Next break?" poll, the "Pizza break" activity, the radio queue) and uses a pretend Spotify.
- **Second migration** (`002_radio_polls_activities.sql`) adds radio requests, polls and votes, activities and RSVPs, and owned games.
- **Extra packages:** `@anthropic-ai/sdk` for the optional AI wording (model `claude-opus-5-5`, low effort, server-side fallbacks). Multicast DNS for `lan-os.local` is implemented without a package.
