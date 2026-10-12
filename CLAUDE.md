# LAN OS: notes for Claude Code

A local web app for a LAN weekend with about 7 friends. It runs on one Windows host PC and serves the projector **wall** (`/wall`), the **player dashboard** (`/app`), the **admin** page (`/admin`), first-run **setup** (`/setup`) and **LAN Wrapped** (`/recap`).

The owner is not a developer and works in VS Code on Windows. Write for a beginner, and give PowerShell commands, not bash.

## Layout

```
apps/server/        Fastify server. Node 22 runs the .ts files directly (no build step)
  src/config/       config loading, validation, hot reload, write-back; defaults/ = templates
  src/db/           SQLite: database.ts runs migrations/NNN_*.sql in order
  src/presence/     Steam presence (Web API or public profiles) and session tracking
  src/radio/        LAN Radio: Spotify (PKCE), fair queue
  src/polls/        polls and activities
  src/announce/     wall announcements (templates + optional AI)
  src/history/      LAN Wrapped, HTML export, Shared Game Finder
  src/http/         routes: auth, player, admin/setup
  src/live/hub.ts   owns all services and builds each screen's snapshot
  src/demo/         pretend Steam and Spotify, demo seed
  test/             Vitest tests
apps/web/           React + Vite: /wall, /app, /admin, /setup, /recap
packages/shared/    zod schemas, types and pure logic shared by server and web
config/             the YAML files the owner edits (+ README.md)
data/               database, backups, logs, crash reports, Spotify sign-in (git-ignored)
docs/going-live.md  owner's guide for the real LAN
tools/              start-with-Windows scripts
```

## Commands

- `npm test`, `npm run typecheck`, `npm run lint`
- `npm run build`: build the web app into `apps/web/dist` (the server serves it)
- `npm run demo` / `npm start` (on Windows: the two `Start LAN OS*.bat` files). Add `-- --no-browser` to skip opening a browser.
- `npm run dev:web`: Vite dev server with hot reload; run the server alongside it

## Rules

- Stack: Node 22, strict TypeScript, Fastify + one WebSocket channel, better-sqlite3 with plain SQL migrations, React + Vite, zod, `yaml` (Document API), Vitest. Ask before adding packages.
- Styles: `apps/web/src/styles/app.css` and `wall.css` are the approved design; don't edit them. Reuse their class names and put additions in `lan-os.css`, with colours from theme tokens. Wall text is never smaller than 22px.
- Nothing that belongs in config is hardcoded (dates, names, intervals, limits, colours). Every config setting has a comment with what it does, the allowed values and the default. Keep `apps/server/src/config/defaults/` in sync with `config/`.
- Secrets live only in `.env`, which the setup page writes. Never log or commit them.
- Write imports with `.ts` extensions and use only erasable TypeScript (no `enum`, no parameter properties, no namespaces).
- The `events` table is append-only (admins may only remove wrong rows). Schema changes go in a new migration; ask first.
- The host PC (requests from 127.0.0.1) is always admin. Spotify sign-in only works there (Spotify requires the 127.0.0.1 redirect).
- Steam presence reads public data only. "Game details: Friends only" is not visible to LAN OS.
- No sound from the wall. Status always shows as colour + icon + word.
- Commit after each step. Run tests, typecheck and lint before calling work done.
