# LAN OS settings

Everything about how LAN OS behaves is set in the files in this folder. You change them in VS Code like any text file.

## How to change a setting safely

1. Open the file, for example `wall.yaml`.
2. Read the comment (the grey line starting with `#`) above the setting. It says what the setting does, which values are allowed and what the default is.
3. Change the value after the colon, then save the file.
4. LAN OS picks up the change by itself within a few seconds. You don't need to restart, except for `port` and `hostname` in `server.yaml`.

If a value isn't allowed, LAN OS ignores the change, keeps using the last good version, and tells you in one line what's wrong, for example:

```
config/music.yaml → skip_vote_threshold must be a whole number between 1 and 7 (you wrote "half")
```

The same line appears on the admin page. Fix the value, save, and the warning disappears.

## Writing values

| Kind of value | How to write it | Example |
| --- | --- | --- |
| On or off | `true` or `false` | `night_mode: false` |
| A length of time | a number plus `s` (seconds), `m` (minutes), `h` (hours) or `d` (days), between quotes | `steam_poll_interval: "15s"` |
| A date and time | `"YYYY-MM-DD HH:MM"`, 24-hour clock, between quotes | `starts_at: "2026-11-19 19:00"` |
| Text | between quotes | `name: "LAN Weekend '26"` |
| A list | between square brackets, separated by commas | `panels: [music, poll, activity]` |
| A colour | a hex code between quotes | `surface_card: "#1E2A43"` |

Keep the spaces at the start of a line as they are. YAML uses them to know what belongs together.

## The files

| File | What it controls |
| --- | --- |
| `event.yaml` | The LAN itself: its name, a short code for the stats, and when it starts and ends |
| `players.yaml` | Who can join, their nickname, Steam ID, and whether they are an admin. Also editable on the admin page |
| `wall.yaml` | The projector: which panels show and in what order, night mode and brightness. Also editable on the admin page |
| `music.yaml` | LAN Radio: taking turns, duplicate songs, the fallback playlist, skip votes, and who may pause, skip or change the volume |
| `voting.yaml` | Polls: how long they stay open, how long votes can be changed, how many side polls |
| `activities.yaml` | Group activities: which kinds exist, default player limits, when the reminder appears |
| `announcements.yaml` | Wall announcements: humour on or off, how often, which events trigger them, night-mode lines |
| `integrations.yaml` | Steam, Spotify, Discord and AI: on or off, and how often Steam is checked |
| `tournament.yaml` | The tournament: points per place, bingo card size, suggested bingo time and points, how long a game result shows on the wall |
| `server.yaml` | The host PC: port, local name, backups and how long logs are kept |
| `theme.yaml` | Colours, text sizes and spacing of every screen. This is the approved design |

## Good to know

- **Missing file?** LAN OS recreates it with the default settings and comments when it starts.
- **Admin page changes** are written into these same files. Your comments stay where they are.
- **Passwords and API keys never go here.** They go in the `.env` file in the main folder. `.env.example` lists each one and where to get it.
- **The `data/` folder** holds the database, backups and logs. LAN OS manages it; don't edit it by hand.
