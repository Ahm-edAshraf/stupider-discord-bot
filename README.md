# Stupider Discord Bot

Bun + discord.js bot scaffold with slash commands and voice-channel join/leave support.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - optional `DISCORD_GUILD_ID` for fast development command deploys
   - optional `YOUTUBE_COOKIE` for YouTube metadata sign-in
   - optional `YOUTUBE_COOKIES_FILE` for more reliable `yt-dlp` playback
3. Install dependencies:

```bash
bun install
```

4. Deploy slash commands:

```bash
bun run deploy
```

5. Start the bot:

```bash
bun run start
```

Use `bun run dev` while editing locally.

## Music commands

The bot supports YouTube-first music playback:

```text
/play query:<youtube url or search>
/queue page:<optional page>
/nowplaying
/pause
/resume
/skip
/stop
/volume percent:<1-100>
/join
/leave
```

Music controls also appear as buttons under the public embeds. Anyone in the
same voice channel as the bot can use the controls.

Runtime volume changes are disabled for playback stability. The bot downloads
each requested track to temporary storage first, then plays the local audio file,
so users should adjust Discord's per-user volume instead of using `/volume`.

YouTube can block anonymous droplet playback. If playback starts failing, export
YouTube cookies in Netscape format to a file on the droplet and set
`YOUTUBE_COOKIES_FILE` in `.env`. Keep cookie values private.
The bot uses `yt-dlp --cookies` to download a temporary audio file before
playback. WebM/Opus downloads are played as Opus without FFmpeg when possible;
other formats fall back to FFmpeg from the local file. Temporary files are
deleted after the track finishes, errors, skips, or the queue is deleted.

Recommended droplet cookie setup:

```bash
cd /opt/stupider-discord-bot
nano youtube.cookies.txt
chmod 600 youtube.cookies.txt
```

Then set:

```env
YOUTUBE_COOKIES_FILE=/opt/stupider-discord-bot/youtube.cookies.txt
```

## Slash command cleanup

If Discord shows old or duplicate commands, clear the registered commands once:

```bash
bun run clear
bun run deploy
```

With `DISCORD_GUILD_ID` set, this clears both global commands and that server's
commands. Old global commands can take a while to disappear from Discord's UI.

## Discord developer portal

Create an application and bot at:

https://discord.com/developers/applications

Use OAuth2 URL Generator with:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`, `Connect`, `Speak`

## DigitalOcean droplet

On Ubuntu:

```bash
sudo apt update
sudo apt install -y unzip git ffmpeg python3
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Clone this project, create `.env`, then:

```bash
cd /opt
git clone https://github.com/Ahm-edAshraf/stupider-discord-bot.git
cd /opt/stupider-discord-bot
bun install --production
bun run clear
bun run deploy
bun run start
```

For long-running hosting, use `systemd` or a process manager. `systemd` is preferred on a small droplet.

Copy the included service file:

```bash
sudo cp /opt/stupider-discord-bot/deploy/stupider-discord-bot.service /etc/systemd/system/stupider-discord-bot.service
```

Service file contents:

```ini
[Unit]
Description=Stupider Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/stupider-discord-bot
EnvironmentFile=/opt/stupider-discord-bot/.env
ExecStart=/root/.bun/bin/bun run start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stupider-discord-bot
sudo journalctl -u stupider-discord-bot -f
```

## Updating the droplet

After the service is installed, update code and slash commands with one command:

```bash
cd /opt/stupider-discord-bot
sudo bash deploy/update.sh
```

That script pulls the latest GitHub code, installs dependencies, type-checks,
clears stale slash commands, deploys the current slash commands, and restarts
the `stupider-discord-bot` service.

## Music notes

Music playback is YouTube-first with an in-memory queue. `YOUTUBE_COOKIES_FILE`
is preferred on the droplet because it lets `yt-dlp` download authenticated
temporary audio files without piping the whole song through `yt-dlp` stdout.
