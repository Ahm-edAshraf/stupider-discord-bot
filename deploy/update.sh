#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/stupider-discord-bot"
SERVICE_NAME="stupider-discord-bot"
BUN_BIN="${BUN_BIN:-}"

if [[ -z "$BUN_BIN" ]]; then
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
  elif [[ -x "/root/.bun/bin/bun" ]]; then
    BUN_BIN="/root/.bun/bin/bun"
  elif [[ -x "$HOME/.bun/bin/bun" ]]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  else
    echo "bun was not found. Install it with: curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
fi

cd "$APP_DIR"

git pull --ff-only
"$BUN_BIN" install
"$BUN_BIN" run check
"$BUN_BIN" run clear
"$BUN_BIN" run deploy
systemctl restart "$SERVICE_NAME"
systemctl --no-pager --lines=20 status "$SERVICE_NAME"
