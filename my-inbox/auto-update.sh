#!/usr/bin/env bash
# Runs every minute (cron). If the my-inbox folder on GitHub changed, install it and restart.
# Never touches data/ or .env.
set -euo pipefail
cd "$(dirname "$0")"
exec 9>/tmp/my-inbox-update.lock; flock -n 9 || exit 0   # never run two updates at once
CRON="* * * * * root $PWD/auto-update.sh >> /var/log/my-inbox-update.log 2>&1"
[ "$(cat /etc/cron.d/my-inbox-auto 2>/dev/null)" = "$CRON" ] || { echo "$CRON" > /etc/cron.d/my-inbox-auto; chmod 644 /etc/cron.d/my-inbox-auto; }
# weekly cleanup of shared reels/link media (Sunday 3:30am server time)
CLEAN="30 3 * * 0 root $PWD/media-cleanup.sh >> /var/log/my-inbox-cleanup.log 2>&1"
[ "$(cat /etc/cron.d/my-inbox-cleanup 2>/dev/null)" = "$CLEAN" ] || { echo "$CLEAN" > /etc/cron.d/my-inbox-cleanup; chmod 644 /etc/cron.d/my-inbox-cleanup; }
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
chmod +x setup.sh update.sh auto-update.sh media-cleanup.sh
docker compose up -d --build --remove-orphans
echo "$SHA" > .deployed-sha
