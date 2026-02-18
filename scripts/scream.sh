#!/usr/bin/env bash
# Shell wrapper for the Discord voice scream bot
# Usage: ./scream.sh <guildId> [channelId]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env if it exists
ENV_FILE="$HOME/.openclaw/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

exec node "$SCRIPT_DIR/scream.mjs" "$@"
