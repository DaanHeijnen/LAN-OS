# LAN OS

A local web app for our LAN weekend. It runs on one Windows PC and gives the room three screens:

- **Projector wall:** who's playing what and for how long, LAN Radio, the current poll, what's next, and short announcements.
- **Player dashboard:** request songs for the shared Spotify queue, vote, plan activities, join friends' games, and set your status.
- **Admin page:** players, projector controls, music, moderation, health and backups.

Everything is logged, so the weekend ends with **LAN Wrapped**: stats, awards and a timeline, kept year after year.

## Start it

You need Node.js 22 LTS (22.18 or newer) from nodejs.org.

- **Try it with pretend players and music:** double-click `Start LAN OS (demo).bat`.
- **For the real LAN:** double-click `Start LAN OS.bat` and follow the setup page that opens. `docs/going-live.md` walks you through it.

Players sign in with their Steam account. LAN Radio uses the host's Spotify Premium account, connected on the setup page.

## Folders

| Folder | What's in it |
| --- | --- |
| `config/` | All settings, as readable YAML files. Start with `config/README.md` |
| `apps/` | The app itself: `server` and `web` |
| `packages/shared/` | Code shared by the server and the web app |
| `docs/` | Going live, requirements, decisions and the build plan |
| `tools/` | Start-with-Windows on and off |
| `design/prototype/` | The approved design (reference only) |
| `data/` | Database, backups and logs, created when LAN OS runs |
| `archive/` | Old setup notes, kept for context |

## For developers (PowerShell)

```powershell
npm install
npm run build      # build the web app
npm run demo       # or: npm start
npm test; npm run typecheck; npm run lint
```
