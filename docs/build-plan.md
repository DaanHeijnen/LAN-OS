# Build plan

All milestones are built. For changes, start a Claude Code session and ask it to read CLAUDE.md first.

Status: ✅ done · 🟡 in progress · ⬜ not started

## Milestone 0: Foundations ✅

1. ✅ Monorepo: `apps/server`, `apps/web`, `packages/shared`, `config/`, `data/`, `docs/`. Node runs the TypeScript directly.
2. ✅ Config system: 9 commented YAML files plus `theme.yaml`, zod validation with one-line friendly errors, recreated from templates when missing, hot reload, comment-preserving write-back. `config/README.md`.
3. ✅ SQLite schema and migrations: `lans`, append-only `events` tagged with `lan_id`, per-LAN `player_profiles`, `join_links`, `sessions`, `player_pins`, `runtime_state`.
4. ✅ Auth: `/join/<token>` links made by an admin, Steam OpenID sign-in, a session cookie that lasts a year, an optional 4-digit PIN, admin role from `players.yaml` or the admin password from `.env`.
5. ✅ Demo mode (`npm run demo`): the prototype's 7 players and games, which change over time, plus sample music that plays through, a poll and an activity. Uses its own database.
6. ✅ One-click start: `Start LAN OS.bat` and `Start LAN OS (demo).bat` install on first run, build, print the 3 addresses, and restart after a crash.
7. ✅ Crash reports in `data/logs/crashes/`, shown on the admin page, removed after `server.yaml → log_retention`.
8. ✅ `CLAUDE.md`, `docs/decisions.md`, this plan, `docs/going-live.md`.

## Milestone 1: Projector wall and Steam presence ✅

1. ✅ Steam presence: one `GetPlayerSummaries` call per poll at `steam_poll_interval`. Covers in game, desktop, away, offline, hidden and unknown ("stale since hh:mm"), session times from first sight, Join game / Steam ↗ links, and sessions restored after a restart.
2. ✅ Wall at 1920×1080, scaled to fit, matching `wall.png`: header with health dots, clock, Day X and hours left; same-game groups; offline players greyed out; music, poll and activity panels (sample data); announcement overlay; paused, blanked and dimmed states; night mode. It reconnects by itself.
3. ✅ Player dashboard matching `player.png` and `player-compact.png`: live roster with Join game / Steam ↗, "Your status" (Looking for players, hide from wall, manual game, PIN), panel collapse, hide and reorder, and compact view. Other panels are labelled as samples.
4. ✅ Admin matching `admin.png`: roster add, edit and remove (written to `players.yaml`), join links, night mode, brightness, panels, blank and pause, the projector message, integration health, pause Steam, and the crash log. Later controls are disabled with a "later" hint.

### Checked in demo mode

- Editing `players.yaml` reaches the wall in under 0.5 s; a `theme.yaml` colour too, without a restart.
- An invalid value gives one friendly line and the last good settings stay in use.
- Admin changes are written back with every comment kept.
- Killing and restarting the server: the wall recovered on its own in about 4 s.
- A crash was written to `data/logs/crashes/` and listed on the admin page.
- Hide from wall reached the wall within about 0.2 s.
- Join game appears only for lobbies and servers; everyone else gets Steam ↗.
- `npm run lint`, `npm run typecheck` and `npm test` pass.

## Milestone 2: LAN Radio ✅

Spotify connected inside LAN OS (PKCE, no client secret), search (10 results, Spotify's limit) and paste-link requests, LAN OS's own fair queue with DJ rotation (least recently served goes first), hand-over to Spotify `hand_over_before_end` before the song ends, duplicate warnings, removing your own request until it's sent, skip votes, pause/skip/volume permissions from `music.yaml`, fallback playlist, "LAN Radio Offline" with automatic retry, every played song logged with its requester. Demo mode uses a pretend Spotify.

## Milestone 3: Polls and activities ✅

Main poll plus side polls (`max_side_polls`), own choices or Yes/No/Maybe, creator-chosen anonymity, results live, vote changes within `change_vote_window`, closing by timer, when everyone voted, or by the creator or an admin, ties decided by the host. Activities with Join / Maybe / Skip and ETA, min/max players, start at the time or by Start, auto-end, wall countdown, dashboard reminders, auto-suggest when several players are free. Popups and optional sound cues on dashboards only.

## Milestone 4: Announcements ✅

Triggers (long sessions, poll results, everyone in the same game, rare combinations, activities starting soon), `min_gap` / `average_gap`, merging (only the most important moment is shown), humour on/off, night-mode drinking-game lines, optional Claude wording with template fallback.

## Milestone 5: History and LAN Wrapped ✅

Recap page per LAN and per day or the last 24 hours (the nightly mini-recap), host-published final recap, awards, timeline, personal recaps, hours-by-time-of-day chart, music stats and the weekend playlist, standalone HTML export, archive of every LAN and the LAN Time Capsule comparison. Shared Game Finder from Steam libraries (needs a Steam API key). Admins can remove incorrect events.

## Milestone 6: Finishing ✅

In-app setup page (no file editing), Steam presence without an API key, "Sign in through Steam" with "Which one are you?", automatic backups, `lan-os.local` announced on the network, start-with-Windows scripts, Discord highlights (read-only), safety controls.

## Ideas for later

- Wall type sizes follow the prototype's fixed pixel sizes; wiring them to `theme.yaml`'s size tokens would let the owner resize wall text from the config.
- A real Windows installer (the start file plus start-with-Windows covers the need for now).
