# Build plan

Use one Claude Code session per milestone. To start the next one, ask:
"Read CLAUDE.md and docs/build-plan.md, then build Milestone N."

Status: ✅ done · 🟡 in progress · ⏸ waiting on the owner · ⬜ not started

## Milestone 0: Foundations

1. ✅ Monorepo: `apps/server`, `apps/web`, `packages/shared`, `config/`, `data/`, `docs/`. Node runs the TypeScript directly.
2. ✅ Config system: 9 commented YAML files plus `theme.yaml`, zod validation with one-line friendly errors, recreated from templates when missing, hot reload, comment-preserving write-back. `config/README.md`.
3. ✅ SQLite schema and migrations: `lans`, append-only `events` tagged with `lan_id`, per-LAN `player_profiles`, `join_links`, `sessions`, `player_pins`, `runtime_state`.
4. ⬜ Server shell: Fastify, one WebSocket channel, `/theme.css` regenerated on every `theme.yaml` change, health endpoint, crash log in `data/logs/crashes/`, auto-reconnect protocol.
5. ⬜ Auth: `/join/<token>` links made by an admin, Steam OpenID sign-in, persistent session cookie, optional 4-digit PIN, admin role from `players.yaml` and admin password from `.env`.
6. ⬜ Demo mode (`npm run demo`): simulates the 7 players and every integration, with a separate database.
7. ⬜ `Start LAN OS.bat`: installs on first run, starts the server, prints the 3 URLs, restarts after a crash.

## Milestone 1: Projector wall and Steam presence

1. ✅ Presence derivation (in game, desktop, away, offline, hidden, unknown), session tracking, Join game and Steam ↗ links.
2. ⬜ Steam poller (`GetPlayerSummaries`, interval from `integrations.yaml`), with events stored and sessions restored after a restart.
3. ⏸ Web app shell (React + Vite, `/wall`, `/app`, `/admin`) on **Aurora**, themed from `theme.yaml`. Waiting for the Aurora package.
4. ⏸ Wall at 1920×1080, scaled: player cards with same-game groups, clock (Day X, hours left, uptime), health dots, music, poll and activity panels from demo data, night mode, dim, blank and pause, plus the projector message.
5. ⏸ Player dashboard: "Who's playing what" with Join game / Steam ↗, quick-action buttons, "Your status" (Looking for players, hide from wall, manual game), panel collapse, hide and reorder, compact view. Other panels are marked "coming soon".
6. ⏸ Admin: roster CRUD written to `players.yaml`, join links, night mode, dim, blank and pause, projector message, integration health, crash log. Later controls are disabled with a "later" hint.
7. ⬜ `CLAUDE.md`, `docs/aurora-gaps.md`, and a final check of every "Done when" item.

## Later milestones (do not build yet)

- **M2 LAN Radio:** Spotify auth via the admin page, search and paste-link requests, a LAN OS-owned fair queue with DJ rotation that hands Spotify the next track about 15 s before the current one ends, duplicate warnings, removing your own request until it is sent, skip vote, "LAN Radio Offline" state, play history.
- **M3 Polls and activities:** main and side polls, creator-chosen anonymity, timer, all-voted and manual close; activities with Join / Maybe / Skip and ETA, min/max players, wall countdown, auto-suggest.
- **M4 Announcements:** activity-based triggers, merging, every 15–60 minutes, optional AI commentary with a template fallback, night-mode lines.
- **M5 History and LAN Wrapped:** nightly mini-recap and a host-triggered final recap, per-player recap, awards, timeline, styled HTML export, read-only archive, Shared Game Finder from owned Steam libraries.
- **M6 Finishing:** Discord highlight preview (read-only), Windows installer with auto-start and auto-restart, periodic backups, local DNS name.
