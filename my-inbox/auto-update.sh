#!/usr/bin/env bash
# Runs every minute (cron). If the my-inbox folder on GitHub changed, install it and restart.
# Never touches data/ or .env.
set -euo pipefail
# Everything is inside main() so bash reads the whole script before running it:
# an update that replaces this file mid-run can no longer make it skip steps.
main() {
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
# WhatsApp only sends "typing…" to devices it thinks are online — mark the bridge online while you type
if grep -qE '^\s*send_presence_on_typing: false' data/whatsapp/config.yaml 2>/dev/null; then
  sed -i -E 's/^(\s*)send_presence_on_typing: false/\1send_presence_on_typing: true/' data/whatsapp/config.yaml
  echo "$(date -u '+%F %T') WhatsApp typing indicators turned on"
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
# Calls: TURN relay (coturn) so voice/video calls connect through any network
DOMAIN=$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
if [ -n "$DOMAIN" ] && [ -f data/synapse/homeserver.yaml ]; then
  mkdir -p data/turn
  [ -s data/turn/secret ] || { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40 > data/turn/secret; chmod 600 data/turn/secret; }
  TSEC=$(cat data/turn/secret)
  PUB=$(cat data/turn/public-ip 2>/dev/null || true)
  if [ -z "$PUB" ] || [ "$(date +%M)" = "07" ]; then NEWPUB=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true); [ -n "$NEWPUB" ] && PUB=$NEWPUB && echo "$PUB" > data/turn/public-ip; fi
  PRIV=$(hostname -I 2>/dev/null | awk '{print $1}')
  EXT="$PUB"; [ -n "$PRIV" ] && [ "$PRIV" != "$PUB" ] && EXT="$PUB/$PRIV"
  CONF="listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$TSEC
realm=$DOMAIN
min-port=49160
max-port=49200
external-ip=$EXT
no-tls
no-dtls
no-cli
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
${PRIV:+allowed-peer-ip=$PRIV}
total-quota=50
log-file=stdout"
  if [ -n "$PUB" ] && [ "$CONF" != "$(cat data/turn/turnserver.conf 2>/dev/null)" ]; then
    printf '%s\n' "$CONF" > data/turn/turnserver.conf; chmod 644 data/turn/turnserver.conf
    docker compose restart coturn >/dev/null 2>&1 || true
    echo "$(date -u '+%F %T') call relay (TURN) configured for $EXT"
  fi
  # firewall on the server itself (Oracle images use iptables; others ufw)
  if iptables -S INPUT 2>/dev/null | grep -q 'icmp-host-prohibited'; then
    CH=0
    for rule in "-p udp --dport 3478" "-p tcp --dport 3478" "-p udp --dport 49160:49200"; do
      iptables -C INPUT $rule -m state --state NEW -j ACCEPT 2>/dev/null || { iptables -I INPUT 5 $rule -m state --state NEW -j ACCEPT; CH=1; }
    done
    if [ "$CH" = 1 ]; then command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true; fi
  elif command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active' && ! ufw status | grep -q '49160:49200/udp'; then
    ufw allow 3478 >/dev/null; ufw allow 49160:49200/udp >/dev/null
  fi
  HS=data/synapse/homeserver.yaml
  if ! grep -q '^# my-inbox: turn v1' "$HS"; then
    cp "$HS" "$HS.bak-turn"
    printf '%s\n' "# my-inbox: turn v1" "turn_uris:" "  - \"turn:$DOMAIN:3478?transport=udp\"" "  - \"turn:$DOMAIN:3478?transport=tcp\"" \
      "turn_shared_secret: \"$TSEC\"" "turn_user_lifetime: 1h" "turn_allow_guests: false" >> "$HS"
    docker compose restart synapse >/dev/null 2>&1 || true
    OK=0; for _ in $(seq 1 45); do sleep 2; if docker compose exec -T synapse curl -fsS http://localhost:8008/health >/dev/null 2>&1; then OK=1; break; fi; done
    if [ "$OK" = 1 ]; then echo "$(date -u '+%F %T') calls enabled in Synapse"
    else cp "$HS.bak-turn" "$HS"; echo "# my-inbox: turn v1 (rolled back)" >> "$HS"; docker compose restart synapse >/dev/null 2>&1 || true; echo "$(date -u '+%F %T') TURN config rolled back"; fi
  fi
fi
# Health snapshot for /push/health (on/off status only — no secrets)
{
  CT=$(docker compose ps -a --format '{{.Service}}={{.State}}' 2>/dev/null | tr '\n' ' ')
  CL=$(docker compose logs --no-color --tail 6 coturn 2>&1 | sed 's/"/'"'"'/g' | tail -6 | tr '\n' '|' | cut -c1-900)
  printf '{"ts":"%s","services":"%s","turnConf":%s,"publicIp":%s,"synapseTurn":%s,"listen3478":%s,"coturnLog":"%s"}\n' \
    "$(date -u '+%F %T')" "$CT" \
    "$([ -s data/turn/turnserver.conf ] && echo true || echo false)" \
    "$([ -s data/turn/public-ip ] && echo true || echo false)" \
    "$(grep -q '^# my-inbox: turn v1$' data/synapse/homeserver.yaml 2>/dev/null && echo true || echo false)" \
    "$( (ss -lntu 2>/dev/null | grep -q ':3478 ') && echo true || echo false)" \
    "$CL"
} > data/pushgw/health.json.tmp 2>/dev/null && mv data/pushgw/health.json.tmp data/pushgw/health.json
# self-check: if the push/backup service code changed but its container wasn't rebuilt, rebuild it now
PGH=$(cat pushgw/Dockerfile pushgw/server.mjs 2>/dev/null | sha256sum | cut -c1-16)
if [ -n "$PGH" ] && [ "$PGH" != "$(cat .pushgw-built 2>/dev/null || true)" ]; then
  if docker compose up -d --build pushgw >/dev/null 2>&1; then echo "$PGH" > .pushgw-built; echo "$(date -u '+%F %T') push/backup service rebuilt"; fi
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
cat pushgw/Dockerfile pushgw/server.mjs | sha256sum | cut -c1-16 > .pushgw-built
echo "$SHA" > .deployed-sha
}
main "$@"
exit $?
