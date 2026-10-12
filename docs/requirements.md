# LAN OS — Product requirements

Oct 12, 2026 · @Daan

LAN OS is a local web app that turns a 3-day LAN weekend into a shared, live overview: who is playing what and for how long, what music is on, and what the group is doing next — and it keeps the stats across years.

## Goal and use

The goal is a LAN weekend where everyone can see, without asking, what the others are doing, and where the music and the group plans run themselves. LAN OS must add value or it won't get used, so it stays quiet, automatic and useful.

It does three jobs:

1. **Show the room.** A projector shows live player cards all weekend: who is in which game, for how long, who is on the desktop, who is away. Players in the same game are grouped.
2. **Run the shared stuff.** Everyone adds songs to one Spotify queue that stays fair. Anyone can start a quick poll ("play game X in 20 minutes?") or propose an activity. Players can join a friend's game from their own dashboard where Steam allows it.
3. **Remember the weekend.** Every game session, song, vote and activity is logged. At the end, the host triggers a recap with stats and awards, and the data carries over to build a multi-year history.

**How it's used during the weekend:**

- **The projector:** on all the time, glanced at from 2–4 m.
- **Player dashboards:** opened on a second monitor or during loading screens and breaks, mainly to add music, check who's playing what, and start a vote.
- **Admins:** a few trusted players who step in rarely. Most things run automatically.

## Users and setting

Seven friends, one room, about 72 hours, mostly playing different Steam games at the same time. The focus is casual and social, not competitive.

| Who / what | Details |
| --- | --- |
| Players | About 7, preconfigured by an admin. Each gets a personal join link and signs in with Steam. Desktop browser only |
| Admins | Several trusted players. Separate admin page plus an admin tab in the player app |
| Host PC | Windows 10/11, runs LAN OS and plays Spotify (Premium) on the room speakers |
| Projector | 1920×1080 or 2560×1440, fed through another PC, viewed from 2–4 m |
| Network | Mixed ethernet and Wi-Fi, reliable internet, LAN-only access |
| Next LAN | 19 Nov 2026 19:00 to 22 Nov 2026 15:00 |

## Requirements by area

The wall, Steam presence and LAN Radio are the core; everything else builds on them.

### Projector wall

- Fixed layout all weekend. Content may expand briefly, but panels don't move or cycle.
- Priority order: player cards, now playing, vote results, announcements, activities, clock.
- **Player cards:** Steam avatar, nickname, status, game cover, game name and session duration. Shown as 7 equal cards or a compact list. Players in the same game are visually connected. Offline players are greyed out with their last known game.
- **Clock:** small corner widget with 24h time, Day 1/2/3, hours remaining until the LAN ends, and server uptime.
- **Music panel:** song, artwork, progress, requester and queue size. The next song is shown when it's almost up.
- When nothing is active, show the extended music queue or LAN stats, or stay quiet.
- **Announcements:** large overlay for major events, small banner for minor ones, one visual style. Related events are merged and the most important is shown. No sound.
- **Night mode:** manual toggle. Dims the wall and switches announcements to a playful drinking-game tone.
- **Status:** small health dots for Steam, Spotify and server.
- **Look:** clean, minimal, dark and muted, stats only. Readable from 4 m.

### Player dashboard

- Opens on an overview of the wall plus the music queue, active votes and one-click quick actions: request song, vote, propose activity, set status, see who's playing what.
- Panels can be rearranged, hidden and collapsed. A compact mini version is available for second monitors.
- Shows each player's current game, session duration and recent history.
- **Join game:** a button on a friend's card when Steam exposes a joinable lobby or server. Otherwise an "Open in Steam" fallback that opens the friend's profile or chat in the Steam client.
- **Shared Game Finder:** games several players own, from their Steam libraries. Shown on the dashboard only, never the wall.
- **Manual controls:** a "Looking for players" status, a privacy toggle that hides the player from the wall, and a manual game override for non-Steam or misdetected games.
- No notifications outside the tab, except optional sound cues for important items.
- The session restores automatically, with a quick PIN on a new browser.

### Steam integration

- Uses the Steam Web API only, with no program installed on players' PCs. Polled about every 15 seconds.
- **States:** in game, desktop (online, no game), away (Steam Away/Snooze), offline, hidden.
- Session duration is measured by LAN OS from when it first sees a game. It is tracked per player and per game.
- When Steam can't be reached, show "Unknown" and an integration warning, and keep the last known state with a timestamp.
- Players' Steam game details must be public.

### LAN Radio (Spotify)

- Players search Spotify inside LAN OS or paste Spotify links. Requests are accepted immediately with no approval and no content filters.
- **Fair queue:** LAN OS keeps its own queue with DJ rotation (round-robin between requesters), so one new request never waits behind someone's whole backlog. It hands Spotify the next track shortly before the current one ends.
- **Duplicates:** never allowed in the pending queue; the requester gets a warning.
- Players can remove their own request until it's sent to Spotify.
- The requester is shown everywhere.
- **Controls:** host and co-hosts, with separate permissions for pause, skip, volume and requests. Anyone can start a skip vote that passes by majority.
- **Empty queue:** the normal playlist continues, with a prompt inviting requests.
- **Spotify down:** show "LAN Radio Offline", stop accepting requests with an explanation, auto-retry and notify the host.
- Every song played is logged with its requester for the multi-year stats.

### Polls and activities

- **Creating polls:** anyone can create one. The creator sets the options, the mode (single choice or yes/no/maybe) and anonymity.
- **Poll rules:** one main poll plus smaller side polls can run at once. Results are visible immediately. Votes can be changed for a short window.
- **Closing:** by timer, when everyone has voted, or by the creator or host. Ties are decided by the host.
- **Discovery:** dashboard badge, in-browser popup, wall announcement, and a sound cue on dashboards.
- **Activities:** anyone can propose a specific game, a group session, a food/drink break or an IRL activity. Players answer Join / Maybe / Skip with an ETA. Min/max players are set by the creator or taken from known game capacities.
- **Activity start:** at the scheduled time or when the organizer presses Start. A wall countdown and a dashboard reminder come first.
- **Auto-suggest:** suggest a group activity when several players are available at once.
- Activities are logged with participants and duration.

### Announcements

- **Triggers:** long sessions, polls closing, all players in the same game, and funny rare combinations.
- **Frequency:** at most every 15–30 minutes, about hourly on average.
- **Wording:** short, factual-sounding lines generated from real activity, e.g. "Nick has been in Factorio for 4h 12m straight". Names and roasts are allowed within the group. No persona or announcer character. Template lines are the fallback when AI is unavailable.
- Admins can switch humour off and push a plain-text projector message.

### History and LAN Wrapped

- **Data:** all raw events are stored per LAN and kept across years: game sessions, presence, songs, votes and activities. Profiles reset each LAN; stats stay.
- **Recaps:** a nightly mini-recap, plus a final recap triggered by the host on the last day.
- **Format:** a scrollable web dashboard with a timeline of major events, a personal recap per player, and non-competitive awards (e.g. The Explorer, The Night Owl).
- **Game stats:** combined hours, most played, unique games, longest sessions, biggest same-game groups, most varied player, activity by hour.
- **Music stats:** total songs, most requested, top artists, contributions per player, and a weekend playlist.
- **Saving:** kept as a read-only archive and a well-styled HTML export. LANs can be compared year over year (LAN Time Capsule).

### Admin

- A separate admin page plus an admin tab in the player app.
- **People and content:** manage players and join links, moderate music and polls.
- **Projector controls:** brightness/theme, night mode, hide panels, presentation mode, plain-text message, pause/restore live activity.
- **Health:** integration status, pause integrations, and the crash log.
- **Emergency controls:** hide public content, disable submissions, clear an announcement, disconnect a user, stop music requests.
- History can only be corrected by removing incorrect events.
- A demo mode simulates all 7 players and all integrations for testing.
- **Discord (later):** the host selects highlights that rotate in a small preview on the wall. The bot never posts.

## Non-functional requirements

LAN OS must run unattended for 72 hours and be set up and maintained by someone who isn't a developer.

| Area | Requirement |
| --- | --- |
| Hosting | Windows 10/11 host. Windows installer or one double-click start. Local DNS name for the address |
| Reliability | Auto-restart after a crash and restore state. Every crash logged and shown on the admin page. The wall and dashboards reconnect on their own |
| Outages | Small indicator plus the last known state with a timestamp. Local features keep working without internet |
| Backups | Automatic, periodically during the weekend |
| Configuration | Readable YAML files, one per topic (event, players, wall, music, voting, activities, announcements, integrations, server, theme). A comment on every setting. Friendly error messages. Hot reload. Admin UI edits write back to the same files. Secrets only in `.env` |
| UI | Built on the Aurora design system. One click for common actions |
| Privacy | Registering implies consent to Steam tracking. History and music/vote history are visible to everyone. Players can hide from the wall but can't delete history. All raw data is kept |
| Security | LAN only. Personal join links, Steam sign-in, per-player PIN, admin password. Trusted-friends approach plus emergency admin tools |
| Architecture | Balanced: simple enough to maintain, structured enough to grow over future LANs and other groups |

## Out of scope

These were considered and explicitly rejected:

- Animated player constellation and its replay
- Event name, logo or lore
- A program installed on players' PCs
- Phone and tablet support
- Talking system or announcer character, and any sound from the projector
- Separate Looking for Group board (a status on the card covers it)
- Standalone group countdowns, LAN Pulse, music reactions and song voting
- Food run board, physical LAN button, next-LAN countdown
- Posting anything to Discord, quote of the weekend
- Competitive rankings or leaderboards
- Access from outside the LAN

## Release plan

Milestones 0–2 are the minimum for the November LAN; 3–6 follow in build order. The projector experience comes first.

1. **M0 Foundations:** project setup, config files, database with cross-LAN history, join links and Steam sign-in, demo mode, crash logging.
2. **M1 Projector wall and Steam presence:** player cards, session times, grouping, clock, Join game button, basic admin and player dashboard.
3. **M2 LAN Radio:** Spotify search and links, fair queue with DJ rotation, skip vote, offline handling, play history.
4. **M3 Polls and activities:** main and side polls, activity proposals with RSVP, wall countdown, auto-suggest.
5. **M4 Announcements:** activity-based triggers, AI commentary with template fallback, night-mode lines.
6. **M5 History and LAN Wrapped:** nightly and final recaps, personal recaps, awards, timeline, HTML export, archive, Shared Game Finder.
7. **M6 Finishing:** Discord highlight preview, Windows installer with auto-start, periodic backups, local DNS name.

## Success criteria and assumptions

LAN OS succeeds if people use it without being reminded: they look up at the wall and add music all weekend.

- Anyone can see at a glance, from 4 m, who is playing what and for how long, including who isn't playing.
- Every player adds songs to LAN Radio during the weekend, and nobody complains about the queue order.
- The wall runs the full 72 hours without anyone having to fix it.
- After the LAN, the recap exists as an archive and the data is ready to compare with next year.

**Assumptions**

- All players use Steam, with game details set to public.
- The host's Spotify account is Premium and stays signed in on the host PC.
- "Join game" only works for games that expose a lobby or server through Steam. Others get the "Open in Steam" fallback.
- AI commentary needs internet and an API key; without them, template lines are used.
