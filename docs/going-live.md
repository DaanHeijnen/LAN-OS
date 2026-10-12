# Going live

Everything is set up inside LAN OS. You don't need to edit any files.

## 1. Start LAN OS on the host PC

1. Install **Node.js 22 LTS** from nodejs.org (default options).
2. Double-click **`Start LAN OS.bat`**. The first time, it installs itself (about a minute).
3. Windows may ask whether Node.js may use the network. Choose **Private networks** and click **Allow**. Without that, the other PCs can't reach LAN OS.
4. Your browser opens the **setup page**. Keep the black window open while LAN OS runs.

## 2. The setup page (on the host PC)

Work through the steps; each one turns green when it's done.

| Step | What you do |
| --- | --- |
| Admin password | Choose one, so other admins can open the admin page from their PC |
| Your LAN | Name and dates. Tick "This is a new LAN" for each new weekend, so stats stay separate per LAN |
| Who's coming | Remove the example players and, if you like, type your friends' names. Mark admins with ☆ |
| Steam | Nothing to do: it works with public Steam profiles. A free Steam API key adds Away status, Join game for lobbies and the Shared Game Finder |
| LAN Radio | Create a free Spotify developer app (the page shows exactly how), paste its Client ID, click **Connect Spotify**, and log in with the host's Spotify **Premium** account. Then open the Spotify app on the host PC and press play once |
| Extras | Optional: an Anthropic API key for AI-written wall lines, and a Discord bot for highlights |

## 3. Players join

Each friend opens the sign-in address shown on the setup page (for example `http://192.168.1.10:8080/app/sign-in`, or `http://lan-os.local:8080/app` on most PCs) and clicks **Sign in through Steam**.

- The first time, they pick their name from the list, or add themselves.
- After that their browser stays signed in for the weekend.
- Their Steam profile and **Game details** must be set to **Public**, so LAN OS can see what they play.

## 4. The projector

On the PC that feeds the projector, open the wall address (for example `http://192.168.1.10:8080/wall`) and press **F11** for full screen. The wall reconnects by itself if LAN OS restarts.

## Good to know

- **Starting with Windows:** double-click `tools/Start with Windows.bat` once. `tools/Stop starting with Windows.bat` undoes it.
- **Backups** are saved automatically in `data/backups/`.
- **If LAN OS crashes**, the start window restarts it after 5 seconds. The crash appears on the admin page.
- **Keys and passwords** are stored in the `.env` file in the main folder. You never need to open it, and it is never shared.
- **At the end of the LAN**, click **Publish** under LAN Wrapped on the admin page. Everyone gets the recap, and **Download as HTML** saves a copy that opens anywhere.
