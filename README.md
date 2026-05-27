# Stupider Discord Bot

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

Clone this project, create `.env`, then:

```bash
cd /opt
git clone https://github.com/Ahm-edAshraf/stupider-discord-bot.git
cd /opt/stupider-discord-bot
bun install --production
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

## Music notes

The project already includes `@discordjs/voice` and `ffmpeg` is listed in the droplet setup. Actual music playback can be added next with a queue, audio extraction, and proper error handling.
