#!/usr/bin/env bash
# One-time setup for My Inbox on a fresh Ubuntu/Debian VPS.
# Usage:  sudo ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo ./setup.sh"
[ -f data/synapse/homeserver.yaml ] && die "Already set up. To start: docker compose up -d"

# ---------- questions (or env vars for automatic setup) ----------
# Automatic mode: set INBOX_DOMAIN, INBOX_USER, INBOX_PASS (and optionally DUCKDNS_TOKEN) before running.
DOMAIN=${INBOX_DOMAIN:-}
ADMIN=${INBOX_USER:-}
PASS=${INBOX_PASS:-}
if [ -z "$DOMAIN" ]; then read -rp "Your domain pointing at this server (e.g. inbox.example.com): " DOMAIN; fi
[ -n "$DOMAIN" ] || die "Domain is required"
if [ -z "$ADMIN" ]; then read -rp "Username you'll log in with [vijay]: " ADMIN; fi
ADMIN=${ADMIN:-vijay}
ADMIN=$(echo "$ADMIN" | tr 'A-Z' 'a-z')
if [ -z "$PASS" ]; then read -rsp "Password for $ADMIN: " PASS; echo; fi
[ ${#PASS} -ge 8 ] || die "Use at least 8 characters"

# ---------- DuckDNS: point the free address at this server and keep it updated ----------
if [ -n "${DUCKDNS_TOKEN:-}" ] && [[ "$DOMAIN" == *.duckdns.org ]]; then
  say "Pointing $DOMAIN at this server"
  SUB=${DOMAIN%.duckdns.org}
  URL="https://www.duckdns.org/update?domains=$SUB&token=$DUCKDNS_TOKEN&ip="
  curl -fsS "$URL" && echo
  echo "*/5 * * * * root curl -fsS '$URL' >/dev/null 2>&1" > /etc/cron.d/duckdns
  chmod 600 /etc/cron.d/duckdns
  sleep 20
fi

# ---------- docker ----------
# On a brand-new server, automatic updates may hold the package lock for a few minutes
for _ in $(seq 1 120); do
  fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1 || break
  sleep 5
done
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"

# ---------- security basics ----------
say "Securing the server (firewall, auto-updates, swap)"
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=600 update -qq
apt-get -o DPkg::Lock::Timeout=600 install -y -qq ufw fail2ban unattended-upgrades git curl >/dev/null
if iptables -S INPUT 2>/dev/null | grep -q 'icmp-host-prohibited'; then
  # Oracle Cloud images ship their own iptables rules (ufw conflicts with them): open web ports before Oracle's REJECT rule
  for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
    iptables -C INPUT $rule -m state --state NEW -j ACCEPT 2>/dev/null || iptables -I INPUT 5 $rule -m state --state NEW -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
else
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi
systemctl enable --now fail2ban >/dev/null 2>&1 || true
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------- secrets ----------
rnd() { openssl rand -hex 32; }
PG_PASS=$(rnd)
DP_TOKEN=$(rnd)
cat > .env <<EOF
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$PG_PASS
EOF
chmod 600 .env

mkdir -p data/synapse/appservices data/whatsapp data/instagram data/messenger data/postgres data/caddy data/pushgw
DOMAIN_RE=$(printf '%s' "$DOMAIN" | sed 's/\./\\./g')

# ---------- Synapse ----------
say "Generating Synapse keys"
docker run --rm -v "$PWD/data/synapse:/data" \
  -e SYNAPSE_SERVER_NAME="$DOMAIN" -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate

cat > data/synapse/homeserver.yaml <<EOF
server_name: "$DOMAIN"
public_baseurl: "https://$DOMAIN/"
pid_file: /data/homeserver.pid
listeners:
  - port: 8008
    tls: false
    type: http
    x_forwarded: true
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client]
        compress: false
database:
  name: psycopg2
  args:
    user: synapse
    password: "$PG_PASS"
    database: synapse
    host: postgres
    cp_min: 3
    cp_max: 10
log_config: "/data/$DOMAIN.log.config"
media_store_path: /data/media_store
signing_key_path: "/data/$DOMAIN.signing.key"
registration_shared_secret: "$(rnd)"
macaroon_secret_key: "$(rnd)"
form_secret: "$(rnd)"
report_stats: false
enable_registration: false
# Private server: no federation with the rest of Matrix
federation_domain_whitelist: []
trusted_key_servers: []
suppress_key_server_warning: true
max_upload_size: 100M
# Let Synapse reach the push gateway on the internal Docker network
ip_range_whitelist: ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16']
app_service_config_files:
  - /data/appservices/whatsapp.yaml
  - /data/appservices/instagram.yaml
  - /data/appservices/messenger.yaml
  - /data/appservices/doublepuppet.yaml
EOF

# Double puppeting: messages you send from your phone show up as you, not as a ghost
cat > data/synapse/appservices/doublepuppet.yaml <<EOF
id: doublepuppet
url:
as_token: "$DP_TOKEN"
hs_token: "$(rnd)"
sender_localpart: "$(openssl rand -hex 8)"
rate_limited: false
namespaces:
  users:
    - regex: '@.*:$DOMAIN_RE'
      exclusive: false
EOF

# ---------- bridges ----------
# write_bridge <name> <port> <command prefix>
write_bridge() {
  local NAME=$1 PORT=$2 PREFIX=$3 AS HS
  AS=$(rnd); HS=$(rnd)

  cat > "data/$NAME/registration.yaml" <<EOF
id: $NAME
url: http://$NAME:$PORT
as_token: "$AS"
hs_token: "$HS"
sender_localpart: "$(openssl rand -hex 8)"
rate_limited: false
namespaces:
  users:
    - regex: '^@${NAME}bot:$DOMAIN_RE\$'
      exclusive: true
    - regex: '^@${NAME}_.*:$DOMAIN_RE\$'
      exclusive: true
de.sorunome.msc2409.push_ephemeral: true
receive_ephemeral: true
EOF
  cp "data/$NAME/registration.yaml" "data/synapse/appservices/$NAME.yaml"

  # Minimal config; the bridge fills every other option with its defaults on first start
  cat > "data/$NAME/config.yaml" <<EOF
homeserver:
  address: http://synapse:8008
  domain: $DOMAIN
appservice:
  address: http://$NAME:$PORT
  hostname: 0.0.0.0
  port: $PORT
  id: $NAME
  bot:
    username: ${NAME}bot
  as_token: "$AS"
  hs_token: "$HS"
  username_template: ${NAME}_{{.}}
database:
  type: postgres
  uri: postgres://synapse:$PG_PASS@postgres/$NAME?sslmode=disable
bridge:
  command_prefix: '$PREFIX'
  private_chat_portal_meta: true
  permissions:
    "*": relay
    "$DOMAIN": user
    "@$ADMIN:$DOMAIN": admin
double_puppet:
  secrets:
    $DOMAIN: as_token:$DP_TOKEN
backfill:
  enabled: true
  max_initial_messages: 50
encryption:
  allow: false
EOF
}

write_bridge whatsapp 29318 '!wa'
write_bridge instagram 29319 '!ig'
write_bridge messenger 29320 '!fb'

chown -R 991:991 data/synapse

# ---------- start ----------
say "Starting everything (first pull takes a few minutes)"
docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up -d --force-recreate --remove-orphans

say "Waiting for Synapse"
for _ in $(seq 1 90); do
  if docker compose exec -T synapse curl -fsS http://localhost:8008/health >/dev/null 2>&1; then break; fi
  sleep 2
done
docker compose exec -T synapse curl -fsS http://localhost:8008/health >/dev/null || die "Synapse did not start. Check: docker compose logs synapse"

say "Creating your account"
docker compose exec -T synapse register_new_matrix_user \
  -c /data/homeserver.yaml -u "$ADMIN" -p "$PASS" -a http://localhost:8008

# ---------- weekly self-update ----------
cat > /etc/cron.d/my-inbox-update <<EOF
# Every Sunday 4am: update Synapse, bridges, Caddy and the push service
0 4 * * 0 root cd $PWD && docker compose pull -q && docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null 2>&1
EOF

# ---------- automatic code updates from GitHub (every minute) ----------
command -v git >/dev/null || apt-get -o DPkg::Lock::Timeout=600 install -y -qq git >/dev/null
git ls-remote https://github.com/vijaykannan2020-del/Apps refs/heads/main | cut -f1 > .deployed-sha || true
echo "* * * * * root $PWD/auto-update.sh >> /var/log/my-inbox-update.log 2>&1" > /etc/cron.d/my-inbox-auto
chmod 644 /etc/cron.d/my-inbox-auto

say "Done!"
echo "Open https://$DOMAIN on your phone and log in as '$ADMIN'."
echo "Then tap the account icon (top right) to connect WhatsApp, Instagram and Messenger,"
echo "and turn on notifications there (on iPhone: Add to Home Screen first)."
echo "Bridge logs:  docker compose logs -f whatsapp instagram messenger"
