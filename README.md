# LAN OS

A local web app for our LAN weekend. A projector wall shows who's playing what, each player gets a dashboard, and admins get a control room. It runs on one Windows PC on the LAN.

> **Status:** under construction. See `docs/build-plan.md`.

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

## Run it (once it's built)

You need Node.js 22 LTS. In the VS Code terminal (PowerShell):

```powershell
npm install
npm run demo
```
