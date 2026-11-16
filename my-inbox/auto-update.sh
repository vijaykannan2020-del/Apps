#!/usr/bin/env bash
# Runs every 5 minutes (cron). If the my-inbox folder on GitHub changed, install it and restart.
# Never touches data/ or .env.
set -euo pipefail
cd "$(dirname "$0")"
REPO=https://github.com/vijaykannan2020-del/Apps
SHA=$(git ls-remote "$REPO" refs/heads/main 2>/dev/null | cut -f1)
[ -n "$SHA" ] || exit 0
[ "$SHA" = "$(cat .deployed-sha 2>/dev/null || true)" ] && exit 0
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$REPO/archive/$SHA.tar.gz" | tar xz -C "$TMP" --strip-components=2 "Apps-$SHA/my-inbox"
if diff -qr --exclude=data --exclude=.env --exclude=.deployed-sha "$TMP" . >/dev/null 2>&1; then
  echo "$SHA" > .deployed-sha; exit 0          # other apps changed, not this one
fi
echo "$(date -u '+%F %T') updating to ${SHA:0:7}"
cp -r "$TMP"/. .
chmod +x setup.sh update.sh auto-update.sh
docker compose up -d --build --remove-orphans
echo "$SHA" > .deployed-sha
