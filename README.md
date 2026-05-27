# Discord Bot

Bun + discord.js bot scaffold with slash commands and voice-channel join/leave support.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - optional `DISCORD_GUILD_ID` for fast development command deploys
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

## Discord developer portal

Create an application and bot at:

https://discord.com/developers/applications

Use OAuth2 URL Generator with:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Use Slash Commands`, `Connect`, `Speak`

## DigitalOcean droplet

On Ubuntu:

```bash
sudo apt update
sudo apt install -y unzip git ffmpeg
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Clone or upload this project, create `.env`, then:

```bash
bun install --production
bun run deploy
bun run start
```

For long-running hosting, use `systemd` or a process manager. `systemd` is preferred on a small droplet.

Example service file at `/etc/systemd/system/discord-bot.service`:

```ini
[Unit]
Description=Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/discord-bot
EnvironmentFile=/opt/discord-bot/.env
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
sudo systemctl enable --now discord-bot
sudo journalctl -u discord-bot -f
```

## Music notes

The project already includes `@discordjs/voice` and `ffmpeg` is listed in the droplet setup. Actual music playback can be added next with a queue, audio extraction, and proper error handling.
