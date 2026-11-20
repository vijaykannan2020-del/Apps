#!/usr/bin/env bash
# Forge server setup — safe to run again any time (auto-update.sh runs it after each update).
# Lives in /opt/forge on the same server as My Inbox and uses My Inbox's Caddy for HTTPS (path /forge/).
set -euo pipefail
main() {
cd "$(dirname "$0")"
log() { echo "$(date -u '+%F %T') $*"; }
setenv() { touch "$1"; if grep -qE "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi; }

command -v docker >/dev/null || { log "Docker is missing — install My Inbox first"; exit 1; }
CADDY=$(docker ps -q --filter label=com.docker.compose.service=caddy | awk 'NR==1')
[ -n "$CADDY" ] || { log "My Inbox Caddy is not running"; exit 1; }
INBOX_NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY" | awk '{print $1}')

[ -f .env ] || { touch .env; chmod 600 .env; }
setenv .env INBOX_NET "$INBOX_NET"
setenv .env PORT 8790
setenv .env SYNAPSE_URL http://synapse:8008
# re-install the newest Claude Code / Codex once a week (year+week number)
setenv .env AGENTS_REFRESH "$(date -u +%G%V)"

mkdir -p data
chown -R 1000:1000 data   # the container runs as uid 1000 ("node")
chmod 700 data

docker compose --env-file .env up -d --build --remove-orphans

echo "* * * * * root $PWD/auto-update.sh >> /var/log/forge-update.log 2>&1" > /etc/cron.d/forge-auto
# Monday 05:10 server time: pick up new agent versions (rebuild only if the week changed)
echo "10 5 * * 1 root $PWD/setup.sh >> /var/log/forge-update.log 2>&1" > /etc/cron.d/forge-weekly
chmod 644 /etc/cron.d/forge-auto /etc/cron.d/forge-weekly
log "Forge API running"
}
main "$@"
