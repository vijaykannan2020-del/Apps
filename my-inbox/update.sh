#!/usr/bin/env bash
# Get the latest My Inbox code from GitHub and restart. Keeps your data and settings.
# Also turns on automatic updates (checks GitHub every minute).
# Usage:  cd ~/my-inbox && ./update.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v git >/dev/null || apt-get install -y -qq git >/dev/null
curl -fsSL https://github.com/vijaykannan2020-del/Apps/archive/refs/heads/main.tar.gz \
  | tar xz --strip-components=2 Apps-main/my-inbox
chmod +x setup.sh update.sh auto-update.sh
docker compose up -d --build --remove-orphans
git ls-remote https://github.com/vijaykannan2020-del/Apps refs/heads/main | cut -f1 > .deployed-sha || true
echo "* * * * * root $PWD/auto-update.sh >> /var/log/my-inbox-update.log 2>&1" > /etc/cron.d/my-inbox-auto
chmod 644 /etc/cron.d/my-inbox-auto
echo "Updated. Automatic updates are on. Reload the Inbox app on your phone."
