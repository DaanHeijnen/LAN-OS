# LAN OS — Interface prototype v02

Three interconnected **front-end designs**, based on the supplied LAN OS requirements, original wall mockup, `theme.yaml`, palette, and generator. The screens use fictional demo data for the seven players. This is a UI prototype, **not a functioning LAN OS server**.

## See it

**Preview with Node.js (recommended for cross-tab demo interactions):**

```bash
node preview.mjs
```

Open **http://127.0.0.1:8765/**. Keep it running while opening the Player, Admin, and Wall views in separate tabs. Controls share demo state using `localStorage`, so an admin's night mode or announcement can appear on the wall. This preview server listens on **localhost only** and has no external dependencies.

To view a single screen without a server, open `wall-standalone.html`, `player-standalone.html`, or `admin-standalone.html` directly. Cross-tab state synchronization may vary with browser `file://` storage rules.

On Windows, double-click `start-preview.bat` if Node.js is installed.

## Pages

- **`wall.html`** — fixed 1920×1080 projected layout, scaled to fit a 1080p or 1440p browser/display. Seven player rows, shared-game grouping, Steam states, session times, LAN Radio, main poll, activity, small clock and service health. Read-only. Night theme, brightness, sticky panel layout, and big/small announcements are demonstrated. Fullscreen mode removes the preview toolbar.
- **`player.html`** — desktop/second-monitor dashboard. A seven-person roster with joinable vs. Steam fallback affordances, fair song queue, live poll, activity RSVP, recent sessions, Shared Game Finder, personal status/visibility controls, panel visibility/reordering, and compact view.
- **`admin.html`** — rare-use control room. Projector preview and settings, host message, people/join-link mockup, Steam/Spotify/server health, moderation, poll closure, integration pause, backup placeholder, and reversible safety controls.
- **`index.html`** — design overview and entry points.
- **`design/palette.html`** — palette and contrast ratios, rebuilt from theme tokens.

## What works in this prototype

- Request a song from a demo catalogue, add it to a round-robin queue, warn on duplicates, and remove your own pending request.
- Vote or change your vote in the main poll, RSVP to an activity, propose a new activity, and create a side poll.
- Switch Looking for players, hide the current player from the wall (shows an anonymous placeholder to maintain layout), set a manual game override, inspect player sessions, and change dashboard panel order/visibility.
- On admin: toggle night mode, brightness, wall panels, projector pause, submissions, privacy, music playback/request controls, poll closure, and Steam polling. Publish/clear a wall announcement.
- On wall: fixed, projector-scaled layout with night mode and announcement previews.
- Demo state persists locally and syncs between same-origin tabs. **Reset it using `http://127.0.0.1:8765/index.html?reset=1`.**

The Spotify search catalogue, Steam actions, session durations, game ownership, logs, service health, invite links, history, and timing are demo data. No real music is played, no real Steam lobby is joined, and no server configuration or user data is modified.

The sample moment is **Saturday 21 November 2026 at 02:47**, during the event (19–22 November). The sample timer is **36h 13m remaining** until Sunday 22 November at 15:00. The demo timer stays static rather than advancing in real time.

## Editable source and build

```
config/theme.yaml          Single source of truth for palette, type and spacing
assets/app.css             Desktop UI styles
assets/wall.css            Projector composition and scale
assets/app.js              Demo fixtures, interactions, cross-tab state
assets/theme.css           Generated design tokens

design/templates/*.html    Source markup for the four pages
design/build.mjs           Theme parser, contrast checks, HTML + palette build
design/palette.html        Generated palette checks
design/mockups/*.html      Compatibility redirects to the new pages
```

Edit `config/theme.yaml` and run:

```bash
node design/build.mjs
```

The builder rewrites `assets/theme.css`, `design/palette.html`, `index.html`, `admin.html`, `player.html`, and `wall.html`, and reports contrast issues. Do **not** edit generated root HTML; edit `design/templates/*.html` instead. Extra desktop decor uses some fixed deep blue-grays while the core chromatic system uses the theme tokens.

The old submitted wall, palette and generator are preserved in `design/wall-original.html` and `design/palette-original.html`, and `design/build-original.mjs` for comparison.

## Why the layouts differ

**Projector: glanceable and stable.** Player identities/session time are highest priority, grouped games are visibly connected, status is communicated by color + icon + word, and large text stays inside a fixed reference canvas at least 22px at 1080p. Announcements overlay rather than rearrange the screen; no wall-only join button or notification sound.

**Player: one-click participation.** Song request, poll, activity and status actions sit above the fold on desktop; additional panels can be collapsed, reordered or removed for second monitors. The Shared Game Finder stays here rather than cluttering the wall. Steam Join only appears for a supported lobby; others show a client fallback.

**Admin: calm until needed.** Health and projector settings precede content intervention, and emergency controls are visually separated below. A host can send a plain-text message without disturbing the usual wall layout.

## Scope / implementation note

Based on the requirements, a production implementation would still require Steam authentication and presence polling, Spotify Premium integration with authoritative queueing, event and multi-year history storage, YAML read/write, role-based permissions, crash recovery, backup scheduling, and delivery of projector announcements. This prototype models the user experience only, including those systems' **display states** and simulated control affordances.
