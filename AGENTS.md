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
- AI provider: Groq chat completions API
- AI memory: Bun SQLite at `AI_DB_PATH`
- Hosting target: DigitalOcean Ubuntu droplet
- Droplet app path: `/opt/stupider-discord-bot`
- systemd service: `stupider-discord-bot`

## User Preferences

- Always commit and push repo changes after completing edits.
- Keep `.env` and secrets out of git.
- Use Bun for JS/TS commands.
- Prefer practical, low-friction deployment steps for the small DigitalOcean droplet.
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
bun run sync:cookies -- -RestartService
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
/join
/leave
/ai
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
- Stream selection prefers low-bitrate WebM/Opus audio formats to reduce stutter on the droplet.
- Playback uses `yt-dlp --cookies` to download each track to temporary storage before playback.
- Temp files are returned to `discord-player` as local file paths for local-file FFmpeg playback.
- Temporary music files are deleted after finish, error, skip, or queue deletion.
- Runtime volume/DSP is disabled for playback stability; users should adjust Discord's per-user volume instead of relying on `/volume`.
- Do not pipe full playback through `yt-dlp` stdout unless URL playback breaks; the long-running pipe can peg one CPU core and cause Discord audio stutter/catch-up.
- `youtube-dl-exec` is in `trustedDependencies` so Bun runs its installer and downloads `yt-dlp`.
- The droplet should have `python3` installed because `youtube-dl-exec` checks for it during install.
- Do not commit real cookie values.
- Any user in the same voice channel as the bot may control playback.
- Queue state is in-memory and clears on restart.

## AI Notes

- AI chat is optional and disabled unless `AI_ENABLED=true` and `GROQ_API_KEY` are set.
- The bot requires Discord's privileged Message Content Intent for normal chat replies.
- v1 uses Groq only, defaulting to `llama-3.1-8b-instant`.
- AI memory is local SQLite at `AI_DB_PATH`, default `./data/ai.sqlite`.
- `data/` is ignored and must not be committed.
- Raw AI chat messages are retained for `AI_MESSAGE_RETENTION_DAYS`, default 30 days.
- Default behavior is aggressive friend-server replies until caps are reached.
- Default cap is `AI_DAILY_REPLY_CAP_PER_GUILD=300`; global token cap is `AI_GLOBAL_DAILY_TOKEN_CAP=450000`.
- AI admin commands require Manage Server permission.
- AI personality should be chaotic and roast-y, but avoid protected-class slurs, real threats, sexual content involving minors, self-harm encouragement, and private info leaks.

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
Use `DISCORD_GUILD_IDS` for multiple comma-separated guild IDs. `DISCORD_GUILD_ID`
still works for one guild and is included with `DISCORD_GUILD_IDS` when both are set.

## Cookie Sync

Cookies must still be exported from a browser/extension in Netscape format, but
`deploy/sync-cookies.ps1` automates local copy and droplet upload. Configure
`YOUTUBE_COOKIES_FILE` and `STUPIDER_DROPLET_HOST`, then run:

```bash
bun run sync:cookies -- -RestartService
```

The script uses `scp`/`ssh`, updates `/opt/stupider-discord-bot/youtube.cookies.txt`
by default, sets `chmod 600`, and can restart the systemd service.

## Files To Know

- `src/bot.ts`: Discord client startup and interaction handling.
- `src/commands.ts`: Slash command definitions and handlers.
- `src/music/`: Music player setup, embeds, controls, and playback actions.
- `src/ai/`: AI chat controller, Groq client, SQLite memory, and admin command helpers.
- `src/deploy-commands.ts`: Registers current slash commands.
- `src/clear-commands.ts`: Clears global and configured guild slash commands.
- `deploy/update.sh`: One-command droplet update script.
- `deploy/sync-cookies.ps1`: Local helper to copy Netscape cookies to the droplet.
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
