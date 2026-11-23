#!/usr/bin/env bash
# Sideline IPTV bridge setup — safe to run again any time (auto-update.sh runs it after each update).
# Lives in /opt/sideline on the same server as My Inbox and uses My Inbox's Caddy for HTTPS (path /sideline/).
set -euo pipefail
main() {
cd "$(dirname "$0")"
log() { echo "$(date -u '+%F %T') $*"; }
setenv() { touch "$1"; if grep -qE "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi; }

command -v docker >/dev/null || { log "Docker is missing — install My Inbox first"; exit 1; }
CADDY=$(docker ps -q --filter label=com.docker.compose.service=caddy | awk 'NR==1')
[ -n "$CADDY" ] || { log "My Inbox Caddy is not running"; exit 1; }
INBOX_NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY" | awk '{print $1}')
DOMAIN=$(docker inspect "$CADDY" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DOMAIN=' | cut -d= -f2- | tr -d '"')
[ -n "$DOMAIN" ] || { log "Could not read the inbox DOMAIN from Caddy"; exit 1; }

[ -f .env ] || { touch .env; chmod 600 .env; }
mkdir -p data
[ -s data/secret ] || { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40 > data/secret; chmod 600 data/secret; }

setenv .env INBOX_NET "$INBOX_NET"
setenv .env PORT 8791
setenv .env PUBLIC_URL "https://$DOMAIN/sideline"
setenv .env APP_ORIGIN "https://vijaykannan2020-del.github.io"
setenv .env SECRET "$(cat data/secret)"
setenv .env MAX_IPTV 1

chown -R 1000:1000 data   # the container runs as uid 1000 ("node")
chmod 700 data

docker compose --env-file .env up -d --build --remove-orphans

echo "* * * * * root $PWD/auto-update.sh >> /var/log/sideline-update.log 2>&1" > /etc/cron.d/sideline-auto
chmod 644 /etc/cron.d/sideline-auto
log "Sideline IPTV bridge running at https://$DOMAIN/sideline"
}
main "$@"
