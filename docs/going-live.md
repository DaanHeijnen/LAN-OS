# Going live

Demo mode needs nothing. These steps are for the real LAN on the host PC.

## 1. Fill in the .env file

1. In the main LAN OS folder, copy `.env.example` and name the copy `.env`.
2. Open `.env` in VS Code and fill in:
   - `STEAM_API_KEY`: go to https://steamcommunity.com/dev/apikey, sign in with the host's Steam account, enter any domain name (for example `lan-os.local`) and copy the key.
   - `ADMIN_PASSWORD`: choose a password for the admin page. Share it only with the admins.
3. Save. Restart LAN OS so it reads the new values.

## 2. Check the roster and the dates

- `config/players.yaml`: everyone's nickname, and `role: admin` for the admins. Steam IDs can stay `""`; they fill in automatically the first time each player signs in with Steam.
- `config/event.yaml`: the LAN name, a new `lan_id`, and the start and end times.

## 3. Start LAN OS

Double-click `Start LAN OS.bat`. The window prints three addresses, like `http://192.168.1.10:8080/wall`.

The first time, Windows may ask whether Node.js may use the network. Choose **Private networks** and click **Allow**. Without that, the other PCs can't reach LAN OS. LAN OS never changes firewall settings itself.

## 4. Hand out the join links

1. Open the admin page and sign in with the admin password.
2. Under **People & access**, click **Make link** for each player, then **Copy link** and send it to them (for example through Discord).
3. Each player opens their link once and signs in with Steam. Their browser stays signed in for the whole weekend.

Players' Steam profiles and game details must be set to **Public**, or LAN OS can't see what they're playing.

## 5. The projector

Open the wall address on the PC that feeds the projector, then press **F11** for full screen. If LAN OS restarts, the wall reconnects on its own.
