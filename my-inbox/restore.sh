#!/usr/bin/env bash
# Restore My Inbox from a backup made by backup.sh.
# 1. Set up a fresh server with setup.sh as usual (same domain).
# 2. Copy the backup file from Google Drive "My Inbox backups" to the server, then:
#      sudo ./restore.sh inbox-backup-YYYY-MM-DD-HHMM.tar.enc
#    It asks for the backup password shown in the app (Accounts -> Backup).
# Everything on this server (chats, logins, settings) is replaced by the backup.
set -euo pipefail
cd "$(dirname "$0")"
FILE=${1:?usage: ./restore.sh inbox-backup-....tar.enc}
[ -f "$FILE" ] || { echo "file not found: $FILE"; exit 1; }
read -rsp "Backup password: " KEY; echo

WORK=$(mktemp -d /tmp/inbox-restore.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
printf '%s' "$KEY" > "$WORK/key"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:"$WORK/key" -in "$FILE" | tar -xf - -C "$WORK" \
  || { echo "Wrong password or damaged file."; exit 1; }
DOMAIN_NOW=$(grep '^DOMAIN=' .env | cut -d= -f2)

echo "Stopping everything…"
docker compose down
echo "Restoring settings and keys…"
tar -xzf "$WORK/files.tar.gz" -C .
DOMAIN_OLD=$(grep '^DOMAIN=' .env | cut -d= -f2)
[ "$DOMAIN_OLD" = "$DOMAIN_NOW" ] || echo "Note: backup was for $DOMAIN_OLD (this server: $DOMAIN_NOW). Keeping the backup's domain."

echo "Restoring databases…"
rm -rf data/postgres && mkdir -p data/postgres
docker compose up -d postgres
for _ in $(seq 1 60); do docker compose exec -T postgres pg_isready -U synapse -d synapse >/dev/null 2>&1 && break; sleep 2; done
sleep 3
gunzip -c "$WORK/databases.sql.gz" | docker compose exec -T postgres psql -q -U synapse -d postgres -v ON_ERROR_STOP=0 >/dev/null 2>"$WORK/psql.err" || true
grep -v 'already exists' "$WORK/psql.err" | head -5 || true

echo "Starting everything…"
docker compose up -d --build --remove-orphans
echo "Done. Open the app and sign in with your old password."
