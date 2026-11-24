#!/usr/bin/env bash
# CaseDesk server setup — safe to run again any time (auto-update.sh runs it after each update).
# Lives in /opt/casedesk on the same server as My Inbox and uses My Inbox's Caddy for HTTPS.
set -euo pipefail
main() {
cd "$(dirname "$0")"
log() { echo "$(date -u '+%F %T') $*"; }
conf() { grep -E "^$1=" deploy.conf 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }
setenv() { # setenv FILE KEY VALUE  (replace or append one line)
  touch "$1"
  if grep -qE "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi
}

command -v docker >/dev/null || { log "Docker is missing — install My Inbox first"; exit 1; }

# 1) Find My Inbox's Caddy container, its network and folder
CADDY=$(docker ps -q --filter label=com.docker.compose.service=caddy | awk 'NR==1')
[ -n "$CADDY" ] || { log "My Inbox Caddy is not running"; exit 1; }
INBOX_NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY" | awk '{print $1}')
INBOX_DIR=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$CADDY")

# 2) .env (secrets stay here, never in GitHub)
[ -f .env ] || { cp .env.example .env; chmod 600 .env; log "created .env"; }
setenv .env INBOX_NET "$INBOX_NET"
setenv .env PORT 8787
setenv .env USCIS_EB_CHART "$(conf USCIS_EB_CHART)"
setenv .env INGEST_LCA "$(conf INGEST_LCA)"
setenv .env INGEST_PERM "$(conf INGEST_PERM)"
DOMAIN=$(conf CASEDESK_DOMAIN)
[ -n "$DOMAIN" ] && setenv .env ALLOWED_ORIGIN '*'
mkdir -p data/content

# 3) Build and start the API
docker compose up -d --build --remove-orphans

# 4) Cron: auto-update every minute, data refresh every Sunday 03:00
echo "* * * * * root $PWD/auto-update.sh >> /var/log/casedesk-update.log 2>&1" > /etc/cron.d/casedesk-auto
echo "0 3 * * 0 root cd $PWD && docker compose exec -T api node scripts/update-data.mjs >> /var/log/casedesk-data.log 2>&1" > /etc/cron.d/casedesk-data
chmod 644 /etc/cron.d/casedesk-auto /etc/cron.d/casedesk-data

# First data load (runs in the background, ~5–15 min)
if { [ ! -f data/wages.json ] || [ ! -f data/employers.json ]; } && ! pgrep -f update-data.mjs >/dev/null; then
  log "first data load started (see /var/log/casedesk-data.log)"
  (sleep 20; docker compose exec -T api node scripts/update-data.mjs >> /var/log/casedesk-data.log 2>&1) &
fi

# 5) Domain: DuckDNS + HTTPS through My Inbox's Caddy
if [ -n "$DOMAIN" ]; then
  if [[ "$DOMAIN" == *.duckdns.org ]] && [ ! -f /etc/cron.d/duckdns-casedesk ]; then
    TOKEN=$(grep -o 'token=[^&]*' /etc/cron.d/duckdns 2>/dev/null | head -1 | cut -d= -f2 || true)
    if [ -n "$TOKEN" ]; then
      URL="https://www.duckdns.org/update?domains=${DOMAIN%.duckdns.org}&token=$TOKEN&ip="
      curl -fsS "$URL" >/dev/null && log "DuckDNS $DOMAIN points here"
      echo "*/5 * * * * root curl -fsS '$URL' >/dev/null 2>&1" > /etc/cron.d/duckdns-casedesk
      chmod 600 /etc/cron.d/duckdns-casedesk
    fi
  fi
  # Website domains (deploy.conf SITE_DOMAINS) share the same Caddy site block and certificates
  SITES="$DOMAIN"
  for d in $(conf SITE_DOMAINS | tr ',' ' '); do SITES="$SITES, $d"; done
  if [ -n "$INBOX_DIR" ] && ! grep -qxF "CASEDESK_SITE=$SITES" "$INBOX_DIR/.env" 2>/dev/null; then
    setenv "$INBOX_DIR/.env" CASEDESK_SITE "$SITES"
    (cd "$INBOX_DIR" && docker compose up -d caddy) && log "HTTPS on $SITES"
  fi
fi
log "CaseDesk API running"
}
main "$@"
