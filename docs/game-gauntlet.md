# Game Gauntlet

An eight-player PC games night run with LAN OS. Six games, one champion: four fixed games, plus two
**wildcards** drawn at random from the **game pot** that players fill on their dashboards.

- 8 players, 8 PCs, start 18:00, awards finished at 00:00
- 4 h 10 playing, 1 h 50 breaks and changeovers
- Every player plays every game. No knockouts.

## How LAN OS runs the night

| Screen | Where | What it does |
| --- | --- | --- |
| **Wall** `/wall` | The projector, on the host PC | Scoreboard, the live game, the lineup, LAN Radio and the room. Shows the pot draw and every game result. |
| **Player dashboard** `/app` | Each player's second monitor | Join a friend's game, request songs, vote to skip, polls, standings, and **throw a game in the pot**. |
| **Admin** `/admin` | The host PC or the host's phone | Set up the lineup, approve pot games, draw the wildcards, score rounds, finish games. |

**Player dashboard on a second monitor:** sign in with Steam on `http://lan-os.local:8080/app`, then press
the **compact view** button (top right) so it fits a side screen. Each player's layout is remembered.

**Projector:** on the host PC open `http://127.0.0.1:8080/wall` full screen (F11) on the projector.

## Before the night

1. **Lineup:** on the admin page, under *Tournament*, press **Set up Game Gauntlet**. This creates the tournament
   with the four fixed games from `config/tournament.yaml` (`planned_lineup`).
2. **Open the pot:** players add their game on their dashboard under *Game pot* (name, download link, how a match
   works). The rules are below.
3. **Approve:** on the admin page under *Game pot*, approve or reject each pot game (with a reason). A player whose game
   was rejected can add another one. Close the pot with the switch when you start installing.
4. **Install:** put the four fixed games and **every approved pot game** on all 8 PCs. Any two can be drawn.
5. **Test evening:** see the checklist at the bottom.

## The schedule

| Time | Block | Minutes |
| --- | --- | --- |
| 18:00–18:15 | Welcome, check-in and **pot draw** | 15 |
| 18:15–19:05 | **1 · AssaultCube**: 1v1 round robin | 50 |
| 19:05–19:20 | Break | 15 |
| 19:20–20:10 | **2 · Bash Fighter**: 1v1 round robin | 50 |
| 20:10–20:40 | Food break, halfway standings | 30 |
| 20:40–21:05 | **3 · SuperTuxKart**: 3 races | 25 |
| 21:05–21:20 | Break and Wildcard 1 briefing | 15 |
| 21:20–22:00 | **4 · Wildcard 1** (from the pot) | 40 |
| 22:00–22:15 | Break | 15 |
| 22:15–23:00 | **5 · Freeflier**: 3 timed maps | 45 |
| 23:00–23:10 | Break and Wildcard 2 briefing | 10 |
| 23:10–23:50 | **6 · Wildcard 2** (from the pot) | 40 |
| 23:50–00:00 | Final scoreboard and awards | 10 |

## The game pot

Every player can put one game in the pot (`pot_games_per_player`). At 18:00 the host presses **Draw the wildcards** on the
admin page (*Game pot*). LAN OS picks two approved games at random, puts them into the lineup at places 4 and 6
(`pot_draw_positions`), closes the pot and announces them on the wall.

A pot game must:

1. be **free**, or already owned by all 8 players
2. play **8 players in one match** (free-for-all or race), so it fits a 40-minute slot. No 1v1-only games
3. run on **all 8 PCs** over the LAN without a long account setup
4. show a clear **final ranking** at the end of a match
5. not be one of the four fixed games

If the pot has fewer than two approved games, fill the empty slot by hand on the admin page (*Add game*), for
example a SuperTuxKart battle round.

## Scoring

**Inside a game**, every round is scored by finishing order on the admin page. A round gives
10–8–6–5–4–3–2–1 by place (`placement_points`), and the rounds add up to the game score.

**When a game is finished**, everyone is ranked by game score and gets championship points by place:
10–8–6–5–4–3–2–1. Six games make a maximum of 60. Ties share the higher place. The overall tie-break is
most games won.

| Game | How to score it in LAN OS |
| --- | --- |
| AssaultCube, Bash Fighter | Run the round robin on paper (win 3, draw 1, loss 0). When all 7 rounds are done, enter the final round-robin ranking as **one round**. |
| SuperTuxKart | One round per race, three rounds. |
| Freeflier | One round per map, ranked by best time. A player who doesn't finish is left out of that round. |
| Wildcards | One round per match, 2–3 matches. |

## The games

### 1 · AssaultCube (shooter)

- **Get it:** the Gamer Gauntlet zip, original from assault.cubers.net. Free, open source.
- **Host:** run 4 servers on the host PC, one per station (A–D), on ports 28763, 28765, 28767 and 28769.
  Deathmatch, map `ac_complex`, 5 minutes, max 3 clients, a password, master server off.
- **Join:** Multiplayer → server browser → `Gauntlet-A` to `-D`, or `/connect HOST-IP PORT`.
- **Play:** WASD move, mouse aim, left click shoot, right click scope, Space jump, R reload, Tab scoreboard.
- **Rules:** 7 rounds of 1v1, 4 duels at once, everyone meets everyone once. Most frags wins the duel.

### 2 · Bash Fighter (fighting, browser)

- **Get it:** the Gamer Gauntlet zip. Open the start file in Chrome, Edge or Firefox.
- **Host:** 4 match rooms or PC pairs, labelled A–D.
- **Rules:** 7 rounds of 1v1, best of 3 per duel, free character choice, no pausing.

### 3 · SuperTuxKart (racing)

- **Get it:** the Gamer Gauntlet zip, original from supertuxkart.net. Free, open source.
- **Host:** Online → Local networking → Create server, name `Gauntlet`, 8 players, password. Normal race,
  Intermediate. Tracks: Black Forest, Zen Garden, Lighthouse.
- **Join:** Online → Local networking → `Gauntlet`.
- **Play:** arrows drive, Space item, N nitro, V drift, Backspace rescue, B look back.
- **Rules:** 3 races, all 8 together, items on, any kart.

### 4 and 6 · Wildcards (from the pot)

- The host explains the drawn game's controls and rules in the break before it.
- Play matches for the full 40 minutes. Each match is one round.

### 5 · Freeflier (parkour)

- **Get it:** the Gamer Gauntlet zip.
- **Rules:** the same 3 maps for everyone, 3 attempts per map within 12 minutes, best time counts. No finish
  inside the time limit means no points for that map. Banned shortcuts are announced before the start.

## Host run sheet

| When | Host |
| --- | --- |
| 18:00 | Everyone signed in on `/app`. Explain the points. Press **Draw the wildcards** and read them out from the wall. Press **Start tournament**. |
| 18:15 | Start AssaultCube servers and the game in LAN OS. Call each round of duels. |
| 19:05 | Enter the AssaultCube ranking as one round, press **Finish**. |
| 19:20 | Bash Fighter, the same way. |
| 20:10 | Halfway standings are on the wall. Start the SuperTuxKart server. |
| 20:40 | One round per race. Finish after race 3. |
| 21:05 | Start Wildcard 1's server or lobby, explain it. |
| 22:00 | Finish Wildcard 1. Load Freeflier maps. |
| 22:15 | One round per map. |
| 23:00 | Finish Freeflier. Start Wildcard 2. |
| 23:50 | Finish Wildcard 2, then **Finish & show podium**. |

## Test evening checklist

- [ ] AssaultCube: 4 servers at once, every PC sees all four.
- [ ] Bash Fighter: 4 separate 1v1 matches at the same time.
- [ ] SuperTuxKart: an 8-player LAN server and everyone can pick the same track.
- [ ] Freeflier: the same build on every PC, the 3 maps load, times are visible.
- [ ] Every pot game: 8 players in one LAN match, with a ranking at the end.
- [ ] LAN OS: wall on the projector, every player signed in on their second monitor, a test round scored and removed.
- [ ] Time one round-robin round and one Freeflier map, to check the schedule.
