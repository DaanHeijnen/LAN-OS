# LAN OS: notes for Claude Code

A local web app for a 3-day LAN weekend with about 7 friends. It runs on one Windows host PC and has three screens: the projector **wall** (`/wall`), the **player dashboard** (`/app`) and the **admin** page (`/admin`).

The owner is not a developer and works in VS Code on Windows. Write for a beginner, and give PowerShell commands, not bash.

## Read first

1. `docs/build-plan.md`: what's done and what's next
2. `docs/decisions.md`: locked decisions; don't re-ask them
3. `docs/requirements.md`: what to build
4. `design/prototype/`: how it looks (screenshots in `screenshots/`). **Reference only; never edit it.**
5. `config/README.md`: the config files

## Layout

```
apps/server/        Fastify server. Node 22 runs the .ts files directly (no build step)
  src/config/       config loading, validation, hot reload, write-back; defaults/ = templates
  src/db/           SQLite: database.ts runs migrations/NNN_*.sql in order
  src/presence/     Steam presence and session tracking
  test/             Vitest tests
apps/web/           React + Vite: /wall, /app, /admin. Styles copied from the prototype
packages/shared/    zod schemas, types and pure logic shared by server and web
config/             the YAML files the owner edits (+ README.md)
data/               database, backups, logs, crash reports (git-ignored)
docs/               requirements, decisions, build plan, going live
design/prototype/   the approved design v02 (read-only)
archive/            old setup docs, kept for context only
```

## Commands

- `npm test`: Vitest
- `npm run typecheck`: TypeScript in every workspace
- `npm run lint`: ESLint
- `npm run build`: build the web app into `apps/web/dist` (the server serves it)
- `npm run demo`: run with simulated players and integrations (`Start LAN OS (demo).bat` on Windows)
- `npm start`: run for real (`Start LAN OS.bat` on Windows)
- `npm run dev:web`: Vite dev server with hot reload; run the server alongside it

## Rules

- Use the locked stack only. Ask before adding any dependency outside it.
- The prototype is the design system. Reuse its class names; never edit `apps/web/src/styles/app.css` or `wall.css` (copies of the prototype). Put additions in `lan-os.css`, using theme tokens for colour.
- Nothing that belongs in config is hardcoded (dates, names, intervals, limits, colours). Secrets go only in `.env`.
- Every config setting has a comment with what it does, the allowed values and the default. Keep templates in `apps/server/src/config/defaults/` in sync with `config/`.
- Write imports with `.ts` extensions and use only erasable TypeScript (no `enum`, no parameter properties, no namespaces).
- The `events` table is append-only. Ask before changing the schema with a new migration.
- Commit after each step. Run tests and typecheck before calling a milestone done.
