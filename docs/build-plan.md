# Build plan

Use one Claude Code session per milestone. To start the next one, ask:
"Read CLAUDE.md and docs/build-plan.md, then build Milestone N."

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

## Later milestones

- **M2 LAN Radio:** Spotify auth via the admin page, search and paste-link requests, a LAN OS-owned fair queue with DJ rotation that hands Spotify the next track about 15 s before the current one ends, duplicate warnings, removing your own request until it is sent, skip vote, "LAN Radio Offline" state, play history.
- **M3 Polls and activities:** main and side polls, creator-chosen anonymity, timer, all-voted and manual close; activities with Join / Maybe / Skip and ETA, min/max players, wall countdown, auto-suggest.
- **M4 Announcements:** activity-based triggers, merging, every 15–60 minutes, optional AI commentary with a template fallback, night-mode lines.
- **M5 History and LAN Wrapped:** nightly mini-recap and a host-triggered final recap, per-player recap, awards, timeline, styled HTML export, read-only archive, Shared Game Finder from owned Steam libraries.
- **M6 Finishing:** Discord highlight preview (read-only), Windows installer with auto-start and auto-restart, periodic backups, local DNS name.

## Open points for later

- Wall type sizes follow the prototype's fixed pixel sizes; wiring them to `theme.yaml`'s size tokens would let the owner resize wall text from the config.
- "Safety controls" (disable submissions, hide public content) arrive together with polls and music.
