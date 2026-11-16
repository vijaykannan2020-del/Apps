#!/usr/bin/env bash
# Get the latest My Inbox code from GitHub and restart. Keeps your data and settings.
# Usage:  cd ~/my-inbox && ./update.sh
set -euo pipefail
cd "$(dirname "$0")"
curl -fsSL https://github.com/vijaykannan2020-del/Apps/archive/refs/heads/main.tar.gz \
  | tar xz --strip-components=2 Apps-main/my-inbox
chmod +x setup.sh update.sh
docker compose up -d --build --remove-orphans
echo "Updated. Reload the Inbox app on your phone."
