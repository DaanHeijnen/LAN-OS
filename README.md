# LAN OS

A local web app for our LAN weekend. A projector wall shows who's playing what, each player gets a dashboard, and admins get a control room. It runs on one Windows PC on the LAN.

> **Status:** Milestones 0 and 1 are done: projector wall, Steam presence, player dashboard and admin page. See `docs/build-plan.md`.

## Folders

| Folder | What's in it |
| --- | --- |
| `config/` | All settings, as readable YAML files. Start with `config/README.md` |
| `apps/` | The app itself: `server` and `web` |
| `packages/shared/` | Code shared by the server and the web app |
| `docs/` | Requirements, decisions and the build plan |
| `design/prototype/` | The approved design (reference only) |
| `data/` | Database, backups and logs, created when LAN OS runs |
| `archive/` | Old setup notes, kept for context |

## Run it

You need Node.js 22 LTS (version 22.18 or newer).

- **Try it with pretend players:** double-click `Start LAN OS (demo).bat`.
- **For the real LAN:** follow `docs/going-live.md`, then double-click `Start LAN OS.bat`.

The window shows three addresses: the projector wall, the player dashboard and the admin page. Keep the window open while LAN OS runs.

From the VS Code terminal (PowerShell) the same works with:

```powershell
npm install
npm run build
npm run demo
```
