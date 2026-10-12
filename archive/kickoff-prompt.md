# LAN OS — Build kickoff (paste this into Claude Code)

You are a senior full-stack TypeScript engineer building LAN OS: a local web app for a 3-day LAN weekend with about 7 friends. It runs on one Windows host PC and has three screens:
- a projector **wall**
- a **player dashboard** in each player's browser
- an **admin** page

It tracks Steam activity, runs a shared Spotify queue and keeps a multi-year history of stats.

The owner is not a developer and works in VS Code on Windows. Every file, command and message must be understandable by a beginner. Give PowerShell commands, not bash.

## Read these first, in this order, before writing any code
1. `docs/requirements.md` — the product requirements. This is the source of truth for **what** to build.
2. `design/prototype/README.md`, then the prototype itself in `design/prototype/`. This is the approved visual design and the source of truth for **how it looks**:
   - `design/templates/wall.html`, `player.html`, `admin.html` — the markup
   - `assets/theme.css`, `app.css`, `wall.css` — the styles
   - `assets/app.js` — demo data and interactions
   - `screenshots/*.png` — the target look
3. `config/theme.yaml` — the palette, type sizes and spacing. These are the design tokens.

When this prompt and those files disagree, this prompt wins. The prototype is a reference only: it is a static demo that keeps its state in localStorage. Do NOT edit anything in `design/prototype/`.

---

## Context (locked decisions)

### Product
- Purpose: show who is playing what and for how long (including who is playing nothing), run LAN Radio (Spotify), and build history and stats across LAN weekends.
- Players: about 7, preconfigured by an admin. Each gets a personal join link and signs in with Steam (OpenID). Sessions auto-restore. A short per-player PIN protects returning on a new browser.
- Admins: several trusted players, with the role set in config. Separate admin page plus an admin tab in the player app.
- LAN only, no remote access. Local features must work without internet. Steam, Spotify, Discord and AI degrade gracefully when unavailable.
- Next LAN: 19 Nov 2026 19:00 to 22 Nov 2026 15:00, Europe/Amsterdam. Set in `config/event.yaml`, never hardcoded.

### Decisions already made (do not re-ask)
- "Looking for players" is a status on the player card, not a separate board.
- A countdown appears only for a scheduled poll or activity. There is no standalone countdown feature.
- Humour: short, factual-sounding lines based on real activity. No persona or announcer character. A manual night mode switches announcements to a playful drinking-game tone. Admins can turn humour off.
- No sound from the projector. Optional sound cues play on player dashboards only.
- The projector runs 24/7. Admins can dim it, blank it, pause it and toggle night mode.
- Host: Windows 10/11 only for now.
- Admins can push a plain-text projector message. There is no styled announcement builder.
- Music requests: unlimited per player, ordered by DJ rotation (round-robin between requesters).
- **Join game:** when Steam's `GetPlayerSummaries` exposes a lobby (`lobbysteamid`) or a server (`gameserverip`) for a friend, show "Join game" and link to `steam://joinlobby/<appid>/<lobbyid>/<steamid64>` or `steam://connect/<ip:port>`. Otherwise show the "Steam ↗" fallback, which opens the friend's profile in the Steam client (`steam://url/SteamIDPage/<steamid64>`). Verify the field names against the current Steam Web API docs before implementing.
- Defaults for the gaps:
  - The clock shows "Day X" and hours remaining.
  - Players can override their detected game or add a non-Steam game.
  - An activity starts at its scheduled time or when the organizer presses Start, whichever comes first.
  - When everyone is in the same game, show one short large announcement, nothing more.

Record these decisions in `docs/decisions.md`.

---

## Stack (locked — do not substitute)
- Node.js 22 LTS, TypeScript (strict), npm workspaces monorepo.
- **Server:** Fastify plus WebSockets, with one realtime channel for all live updates. SQLite via better-sqlite3 with plain SQL migrations.
- **Web:** React + Vite. One build, three routes: `/wall`, `/app` (player) and `/admin`.
- **Validation:** zod for config, API payloads and WebSocket messages. Types are shared via `packages/shared`.
- **Config:** YAML via the `yaml` package's Document API, so comments survive when the admin UI writes changes back.
- **Tests:** Vitest.

## UI implementation rules
- **Aurora first (organisation requirement):** every UI element must come from our Aurora design system where Aurora provides it (buttons, inputs, toggles, tabs, badges, menus, panels and so on).
  - Before building any element, check Aurora. Apply the LAN OS look by setting Aurora's theme tokens from `config/theme.yaml`.
  - If Aurora has no matching component (player row, same-game group, wall panels, the 1920×1080 wall canvas), compose it from Aurora primitives. List each one in `docs/aurora-gaps.md` as a candidate to add to Aurora.
  - If you cannot find or install Aurora in this environment, STOP and ask me where to get it. Do not build a parallel component library.
- **Match the design:**
  - Each screen must match its screenshot in layout, hierarchy, spacing, colour and type sizes.
  - Port the prototype's markup and CSS into React components. Keep its class and token names where practical, so the two can be compared side by side.
  - Remove the prototype-only preview chrome: the wall toolbar ("Fit to window", "Preview announcement"), the "Demo data" footers and the localStorage sync.
- **Wall:**
  - Render a fixed 1920×1080 canvas scaled to fit the screen, which works at 1080p and 1440p. There is no toolbar.
  - Text is never smaller than `size_minimum` from `theme.yaml`.
  - Status is always shown as colour + icon + word.
  - The wall is read-only.
- **Theme pipeline:**
  - Generate the CSS tokens from `config/theme.yaml`, both the day set and the `:root[data-theme="night"]` night set, the same way `design/prototype/design/build.mjs` does.
  - Regenerate them when the file changes, with no restart.
  - Port the prototype's contrast check into a Vitest test: wall primary text must be at least 7:1 and everything else at least 4.5:1.

---

## Config files (critical requirement)
The owner edits these by hand in VS Code, so readability comes first.

```
config/
  README.md            plain-English guide: what each file controls and how to change it safely
  event.yaml           LAN name, start/end date-time, timezone
  players.yaml         roster: nickname, steam id (optional), role (player/admin), hidden from wall
  wall.yaml            projector: panels shown, order, night mode, dim level
  music.yaml           LAN Radio: fairness, duplicates, fallback playlist, skip-vote threshold, who may pause/skip/volume
  voting.yaml          default poll timer, change-vote window, max side polls
  activities.yaml      activity types, default player limits, reminder lead time
  announcements.yaml   frequency, which triggers are on, humour on/off, night-mode lines
  integrations.yaml    Steam poll interval, Spotify/Discord/AI on/off
  server.yaml          port, local hostname, backup interval, log retention
  theme.yaml           ALREADY EXISTS — the approved design tokens. Keep its structure and comments
.env                   secrets ONLY (API keys, tokens). Never committed
.env.example           every secret, each with a comment saying where to get it
data/                  database, backups, logs, crash reports. Git-ignored, never hand-edited
```

Rules for every config file. `theme.yaml` already follows them, so use it as the style example:
- One topic per file, kebab-case file names, snake_case keys, at most 2 levels of nesting.
- A comment above every setting saying what it does, the allowed values and the default.
- Human-friendly values: `"15s"`, `"30m"`, `"2026-11-19 19:00"`, `true`/`false`. No milliseconds, no epoch timestamps, no magic numbers.
- No secrets in YAML.
- Validate with zod at startup. On a bad value, print one friendly line, for example `config/music.yaml → skip_vote_threshold must be a number between 1 and 7 (you wrote "half")`. Never print a stack trace.
- If a file is missing, recreate it from a commented default template.
- Hot-reload a file when it changes.
- When the admin UI changes a setting, write it back to the same file with comments and order intact.

---

## Your task for THIS session: Milestone 0 + Milestone 1 only

### Milestone 0 — Foundations
1. Scaffold the monorepo: `apps/server`, `apps/web`, `packages/shared`, `config/`, `data/`, `docs/`. Leave `design/prototype/` untouched.
2. Build the config system above. Create the 9 new YAML files with commented defaults and write `config/README.md`. Wire `theme.yaml` into the theme pipeline.
3. Create the SQLite schema and migrations:
   - append-only raw events, each tagged with a `lan_id`: game session started/ended, presence change, song requested/played, vote cast, activity, announcement
   - player profiles reset per LAN; events and stats are kept across LANs
4. Auth:
   - personal join links (`/join/<token>`), generated by an admin
   - Steam OpenID sign-in
   - a persistent session cookie and an optional 4-digit PIN
   - the admin role from `players.yaml`, plus an admin password in `.env`
5. Demo mode (`npm run demo`):
   - use the prototype's fixtures in `assets/app.js` as the starting point: the 7 players, games, queue, poll and activity
   - make it live: players switch games, go away and go offline over time
   - fake the Spotify playback
   - no API keys needed
   - every later feature must work in demo mode
6. One-command start: `npm run start`, plus a double-clickable `Start LAN OS.bat` in the repo root. On start, print the wall, player and admin URLs in plain English.
7. Crash handling: write uncaught errors to `data/logs/crashes/` and show the latest ones on the admin page.
8. Write `CLAUDE.md` (conventions and commands for future sessions), `docs/decisions.md`, `docs/build-plan.md` and `docs/aurora-gaps.md`.

### Milestone 1 — Projector wall, Steam presence, basic player and admin
1. Steam presence service:
   - poll `GetPlayerSummaries` for all players in one call, at the `integrations.yaml → steam_poll_interval` (default `"15s"`)
   - derive the game (name, app id, cover from the Steam CDN) and the state: in game / desktop / away (Steam Away/Snooze) / offline / hidden
   - measure session duration from when LAN OS first detects the game
   - work out joinability (see Join game above)
   - when Steam fails, show "Unknown" plus an integration warning, keep the last known state, and label it "stale since hh:mm"
2. Wall: build it exactly as `screenshots/wall.png` and the wall template:
   - header with health dots, clock, Day X and hours left
   - "In the room" roster with same-game groups and offline players greyed out
   - LAN Radio, Room decisions and Next up panels on the right
   - the announcement overlay and the paused state
   - night mode, as in `screenshots/wall-night.png` and `wall-night-announcement.png`
   - The Radio, poll and activity panels show demo-mode data for now; their real logic comes in later milestones.
   - The wall auto-reconnects after a server or browser restart with no clicks.
3. Player dashboard: build the layout from `screenshots/player.png` and `player-compact.png`. In this milestone only these work for real:
   - the "Who's playing what" roster, with the Join game / Steam ↗ buttons
   - "Your status": Looking for players, hide from wall and manual game override
   - panel collapse, hide and reorder, plus the compact view
   - Other panels (LAN Radio, polls, activity, Shared Game Finder, last sessions) render from demo data and are visibly marked "coming soon" when their action is used.
4. Admin: build the layout from `screenshots/admin.png`. In this milestone only these work for real:
   - player roster CRUD, written back to `players.yaml`
   - generating and copying join links
   - night mode, dim/blank/pause wall, and the plain-text projector message
   - integration health and the crash log
   - Show the other controls but leave them disabled with a "later" hint.

---

## Later milestones — do NOT build now, only list them in `docs/build-plan.md`
- **M2 LAN Radio:** Spotify auth via the admin page, search and paste-link requests, a LAN OS-owned fair queue with DJ rotation that hands Spotify the next track about 15 s before the current one ends, duplicate warnings, removing your own request until it is sent, skip vote, "LAN Radio Offline" state, play history.
- **M3 Polls and activities:** main and side polls, creator-chosen anonymity, timer/all-voted/manual close; activities with Join/Maybe/Skip and ETA, min/max players, wall countdown, auto-suggest.
- **M4 Announcements:** activity-based triggers, merging, every 15–60 min, optional AI commentary with template fallback, night-mode lines.
- **M5 History and LAN Wrapped:** nightly mini-recap and host-triggered final recap, per-player recap, awards, timeline, styled HTML export, read-only archive, Shared Game Finder from owned Steam libraries.
- **M6 Finishing:** Discord highlight preview (read-only), Windows installer with auto-start and auto-restart, periodic backups, local DNS name.

## Scope
- Work only inside this repository. Never modify `design/prototype/`.
- Never change Windows settings, the registry, firewall rules or hosts files. If a step needs one of those, write instructions in `docs/` instead.

## Forbidden
- Building later-milestone features.
- Adding features, panels, settings or abstractions not listed here, or "improving" the approved design. Build only what is asked.
- Hardcoding dates, names, intervals, limits or colours that belong in config.
- Putting secrets in YAML, code, logs or commits.
- Swapping the locked stack, or using a component library other than Aurora.
- Leaving "TODO: implement" stubs inside the M0/M1 scope.

## Stop and ask me before
- Adding any dependency not named in the Stack section (name it and say why).
- Changing the database schema after the first migration is committed.
- Deleting any file you didn't create in this session.
- Any step that needs a real API key. Use demo mode and tell me which `.env` value is needed.
- Any deviation from the approved design, or a requirement that is ambiguous and not covered above.

## Working style
- First read all the files listed at the top. Then output a short implementation plan for M0 and M1 (a numbered list, at most 25 lines) and wait for my OK.
- Commit after each numbered step with a clear message.
- After each step, output: `DONE: <what> — see it: <URL or command>`.
- Write Vitest tests for:
  - config validation and its error messages
  - the theme contrast check
  - presence state derivation
  - session-duration tracking
  - joinable-link building
- Run `npm run lint`, `npm run typecheck` and `npm test` before declaring a milestone done.

## Done when (all checked in demo mode)
- [ ] After `npm install`, double-clicking `Start LAN OS.bat` starts everything and prints the 3 URLs.
- [ ] The 9 new config files plus `theme.yaml` have a comment on every setting, and `config/README.md` explains them in plain English.
- [ ] Putting an invalid value in any config file gives a one-line friendly error.
- [ ] Editing `players.yaml` while the app runs updates the wall within 5 s. Editing a colour in `theme.yaml` updates the wall without a restart.
- [ ] A change made in the admin UI is written back to `players.yaml` with its comments preserved.
- [ ] The wall at 1920×1080 matches `screenshots/wall.png` in layout, groups, type sizes and colours, and night mode matches `wall-night.png`.
- [ ] The player dashboard and admin layouts match their screenshots.
- [ ] Killing and restarting the server makes the wall recover on its own within 30 s.
- [ ] A crash appears in `data/logs/crashes/` and on the admin page.
- [ ] The hide-from-wall toggle takes effect within one update cycle.
- [ ] Join game appears only for joinable sessions; others show Steam ↗.
- [ ] Lint, typecheck and tests all pass, including the contrast test.
- [ ] `CLAUDE.md`, `docs/decisions.md`, `docs/build-plan.md` and `docs/aurora-gaps.md` exist.

When every box is checked, stop. Give me a summary of at most 15 lines: what works, how to try it, which `.env` values to fill in to go live with Steam (and where to get them), and what Milestone 2 needs from me.
