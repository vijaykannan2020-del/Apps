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
# weekly encrypted backup to Google Drive (Sunday 4:00am server time) + "Back up now" from the app
BACK="0 4 * * 0 root $PWD/backup.sh >> /var/log/my-inbox-backup.log 2>&1"
[ "$(cat /etc/cron.d/my-inbox-backup 2>/dev/null)" = "$BACK" ] || { echo "$BACK" > /etc/cron.d/my-inbox-backup; chmod 644 /etc/cron.d/my-inbox-backup; }
if [ -f data/pushgw/backup-request ] && [ -x backup.sh ] && ! pgrep -f "$PWD/backup.sh" >/dev/null; then
  setsid nohup "$PWD/backup.sh" >> /var/log/my-inbox-backup.log 2>&1 < /dev/null &
fi
# settings fixes for the bridge configs (only these lines are touched; data is otherwise left alone)
if grep -qE '^\s*enable_status_broadcast: true' data/whatsapp/config.yaml 2>/dev/null; then
  sed -i -E 's/^(\s*)enable_status_broadcast: true/\1enable_status_broadcast: false/' data/whatsapp/config.yaml
  echo "$(date -u '+%F %T') WhatsApp Status bridging turned off"
  docker compose restart whatsapp >/dev/null 2>&1 || true
fi
# Synapse features for scheduled messages and link previews (added once; rolled back if Synapse won't start)
HS=data/synapse/homeserver.yaml
if [ -f "$HS" ] && ! grep -q '^# my-inbox: features v1' "$HS"; then
  cp "$HS" "$HS.bak-features"
  cat >> "$HS" <<'EOF'
# my-inbox: features v1
experimental_features:
  msc4140_enabled: true
max_event_delay_duration: 30d
url_preview_enabled: true
url_preview_ip_range_blacklist:
  - '127.0.0.0/8'
  - '10.0.0.0/8'
  - '172.16.0.0/12'
  - '192.168.0.0/16'
  - '100.64.0.0/10'
  - '192.0.0.0/24'
  - '169.254.0.0/16'
  - '192.88.99.0/24'
  - '198.18.0.0/15'
  - '192.0.2.0/24'
  - '198.51.100.0/24'
  - '203.0.113.0/24'
  - '224.0.0.0/4'
  - '::1/128'
  - 'fe80::/10'
  - 'fc00::/7'
  - '2001:db8::/32'
  - 'ff00::/8'
  - 'fec0::/10'
EOF
  docker compose restart synapse >/dev/null 2>&1 || true
  OK=0; for _ in $(seq 1 45); do sleep 2; if docker compose exec -T synapse curl -fsS http://localhost:8008/health >/dev/null 2>&1; then OK=1; break; fi; done
  if [ "$OK" = 1 ]; then echo "$(date -u '+%F %T') enabled scheduled messages + link previews"
  else cp "$HS.bak-features" "$HS"; echo "# my-inbox: features v1 (rolled back)" >> "$HS"; docker compose restart synapse >/dev/null 2>&1 || true; echo "$(date -u '+%F %T') feature config rolled back"; fi
fi
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
chmod +x setup.sh update.sh auto-update.sh media-cleanup.sh backup.sh restore.sh
docker compose up -d --build --remove-orphans
echo "$SHA" > .deployed-sha
