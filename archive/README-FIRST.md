# LAN OS — start here

This folder holds everything Claude Code needs to start building LAN OS.

## What's in this folder

| Path | What it is |
| --- | --- |
| `docs/requirements.md` | Product requirements: what to build |
| `design/prototype/` | Your approved design v02, including screenshots. Claude Code uses it only as a reference and never edits it |
| `config/theme.yaml` | Your colours, font sizes and spacing. This is the live copy the app will use |
| `docs/kickoff-prompt.md` | The prompt to paste into Claude Code |

## One-time setup (Windows)

1. Install **Node.js 22 LTS** from nodejs.org. Use the default options.
2. Install **Git** from git-scm.com. Use the default options.
3. Install **VS Code** and the **Claude Code** extension, then sign in.
4. Unzip this folder somewhere simple, for example `C:\Projects\lan-os`.
5. In VS Code, choose **File → Open Folder** and select the `lan-os` folder.
6. Open the terminal (**Terminal → New Terminal**) and run these three commands:
   ```
   git init
   git add .
   git commit -m "Requirements, design and theme"
   ```
   This saves a clean starting point, so you can always go back.

## Start building

1. Open Claude Code in VS Code.
2. Open `docs/kickoff-prompt.md`, copy everything below the first heading, and paste it into Claude Code.
3. Claude Code reads the files and replies with a short plan. Read it and reply "OK" (or tell it what to change).
4. It builds Milestone 0 and Milestone 1, step by step, and stops at the end with a summary.

Use one Claude Code session per milestone. When a milestone is done, start a new session for the next one and ask:
"Read CLAUDE.md and docs/build-plan.md, then build Milestone 2."

## Keys you'll need later (not now)

Demo mode works without any keys. For the real LAN:

- **Steam Web API key:** steamcommunity.com/dev/apikey (Milestone 1, going live).
- **Spotify developer app:** developer.spotify.com/dashboard (Milestone 2). The host account needs Premium.
- **Discord bot and AI key:** only for later milestones.

Claude Code will tell you exactly where each key goes in the `.env` file.
