#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/stupider-discord-bot"
SERVICE_NAME="stupider-discord-bot"

cd "$APP_DIR"

git pull --ff-only
bun install --production
bun run check
bun run clear
bun run deploy
systemctl restart "$SERVICE_NAME"
systemctl --no-pager --lines=20 status "$SERVICE_NAME"
