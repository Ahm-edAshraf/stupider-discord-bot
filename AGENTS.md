# AGENTS.md

## Project

This repo is `stupider-discord-bot`, a Bun + discord.js Discord bot.

Current stack:

- Runtime: Bun
- Language: TypeScript
- Discord library: `discord.js`
- Voice support: `@discordjs/voice`
- Music framework: `discord-player`
- YouTube extractor: `discord-player-youtubei`
- YouTube helper binary package: `youtube-dl-exec`
- Env config: `dotenv`
- Hosting target: DigitalOcean Ubuntu droplet
- Droplet app path: `/opt/stupider-discord-bot`
- systemd service: `stupider-discord-bot`

## User Preferences

- Always commit and push repo changes after completing edits.
- Keep `.env` and secrets out of git.
- Use Bun for JS/TS commands.
- Prefer practical, low-friction deployment steps for the small 1 vCPU / 1 GB RAM droplet.
- Keep docs and deployment commands updated when behavior changes.
- Update this file when important project decisions, workflows, or standing instructions change.
- Music UX should use public embeds with buttons; errors should be private when practical.

## Common Commands

Local/dev:

```bash
bun install
bun run check
bun run deploy
bun run start
```

Music slash commands:

```text
/play
/queue
/nowplaying
/pause
/resume
/skip
/stop
/volume
```

Clear stale Discord slash commands:

```bash
bun run clear
bun run deploy
```

Droplet update:

```bash
cd /opt/stupider-discord-bot
sudo bash deploy/update.sh
```

The update script pulls latest code, installs all deps, type-checks,
clears stale commands, deploys current slash commands, and restarts systemd.
It resolves Bun from `PATH`, `/root/.bun/bin/bun`, or `$HOME/.bun/bin/bun`
because `sudo` can hide Bun from the shell PATH on the droplet.
It also requires either `python3` or `python` before running `bun install`.

## Music Notes

- v1 is YouTube-first.
- `YOUTUBE_COOKIE` is optional for YouTube metadata sign-in.
- `YOUTUBE_COOKIES_FILE` is preferred for playback and should point to a Netscape cookies.txt file.
- When `YOUTUBE_COOKIES_FILE` is set, streaming uses `youtube-dl-exec` with `--cookies`.
- yt-dlp is run with Bun as the JS runtime and `remoteComponents=ejs:npm` for YouTube EJS challenge solving.
- Stream selection prefers low-bitrate audio-only formats to reduce stutter on the droplet.
- Playback uses `yt-dlp --cookies --get-url` to resolve an authenticated Googlevideo URL, then returns that URL to `discord-player`.
- Do not pipe full playback through `yt-dlp` stdout unless URL playback breaks; the long-running pipe can peg one CPU core and cause Discord audio stutter/catch-up.
- `youtube-dl-exec` is in `trustedDependencies` so Bun runs its installer and downloads `yt-dlp`.
- The droplet should have `python3` installed because `youtube-dl-exec` checks for it during install.
- Do not commit real cookie values.
- Any user in the same voice channel as the bot may control playback.
- Queue state is in-memory and clears on restart.

## Deployment Notes

The systemd service file is:

```text
deploy/stupider-discord-bot.service
```

Install it on the droplet with:

```bash
sudo cp /opt/stupider-discord-bot/deploy/stupider-discord-bot.service /etc/systemd/system/stupider-discord-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now stupider-discord-bot
```

View logs:

```bash
sudo journalctl -u stupider-discord-bot -f
```

## Discord Slash Commands

If Discord shows duplicate or old commands, the likely cause is stale global
and/or guild command registration. Use:

```bash
bun run clear
bun run deploy
```

With `DISCORD_GUILD_ID` set, guild commands update quickly. Global commands may
take longer to disappear from Discord's UI.

## Files To Know

- `src/bot.ts`: Discord client startup and interaction handling.
- `src/commands.ts`: Slash command definitions and handlers.
- `src/music/`: Music player setup, embeds, controls, and playback actions.
- `src/deploy-commands.ts`: Registers current slash commands.
- `src/clear-commands.ts`: Clears global and configured guild slash commands.
- `deploy/update.sh`: One-command droplet update script.
- `deploy/stupider-discord-bot.service`: systemd service file.
- `.env.example`: Required environment variables template.

## Git Hygiene

- Before committing, check `git status --short`.
- Commit only intended files.
- Never commit `.env`, tokens, or `node_modules`.
- After committing, push to:

```text
https://github.com/Ahm-edAshraf/stupider-discord-bot.git
```

Use short Conventional Commit messages.
