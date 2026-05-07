#!/usr/bin/env bash
# Deploy / update the app. Run as the app user from the project root.
# Usage: bash scripts/deploy.sh [--migrate]
set -euo pipefail

MIGRATE=false
for arg in "$@"; do
  [[ "$arg" == "--migrate" ]] && MIGRATE=true
done

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "── Pulling latest code ────────────────────"
git pull --ff-only

echo "── Installing dependencies ─────────────────"
pnpm install --frozen-lockfile

echo "── Building ────────────────────────────────"
pnpm build

if [ "$MIGRATE" = true ]; then
  echo "── Running migrations ──────────────────────"
  pnpm db:push
fi

echo "── Restarting app ──────────────────────────"
if pm2 describe leoprompt &>/dev/null; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
  pm2 save
fi

echo "── Done ────────────────────────────────────"
pm2 list
