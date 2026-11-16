#!/usr/bin/env bash
# Weekly encrypted backup of My Inbox to your Google Drive (folder "My Inbox backups").
# Backs up: all databases (chats, bridge logins), settings, keys. Not photos/videos (they stay in WhatsApp/Instagram).
# The file is locked with the backup password shown in the app (Accounts -> Backup). Keeps the last 8 weeks.
# Usage: ./backup.sh            (cron runs it every Sunday, and when you tap "Back up now")
set -uo pipefail
cd "$(dirname "$0")"
exec 9>/tmp/my-inbox-backup.lock
flock -n 9 || { echo "backup already running"; exit 0; }

STATUS=data/pushgw/backup-status.json
TOKEN=data/pushgw/gdrive-token.json
KEYF=data/pushgw/backup-key
CONF=data/rclone.conf
FOLDER="My Inbox backups"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
status() { # ok size_bytes message
  printf '{"time":"%s","ok":%s,"size":%s,"message":%s}\n' "$(now)" "$1" "${2:-0}" "$(printf '%s' "$3" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" > "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
}
fail() { echo "$(now) backup failed: $1"; status false 0 "$1"; rm -rf "$WORK"; rm -f data/pushgw/backup-request; exit 1; }

WORK=$(mktemp -d /tmp/inbox-backup.XXXXXX)
[ -f "$TOKEN" ] || fail "Google Drive is not connected"
[ -f "$KEYF" ] || fail "No backup password yet - open Accounts -> Backup in the app"

if ! command -v rclone >/dev/null; then
  apt-get -o DPkg::Lock::Timeout=300 install -y -qq rclone >/dev/null 2>&1 || fail "could not install rclone"
fi
# (Re)write rclone's config whenever you (re)connect Google Drive; rclone refreshes the token itself afterwards.
if [ ! -f "$CONF" ] || [ "$TOKEN" -nt "$CONF" ]; then
  printf '[gdrive]\ntype = drive\nscope = drive.file\ntoken = %s\n' "$(cat "$TOKEN")" > "$CONF"; chmod 600 "$CONF"
fi

echo "$(now) backup started"
# 1. Databases (chats, bridges, logins) - consistent dump while everything keeps running
docker compose exec -T postgres pg_dumpall -U synapse 2>/dev/null | gzip -6 > "$WORK/databases.sql.gz"
[ "${PIPESTATUS[0]}" = 0 ] && [ -s "$WORK/databases.sql.gz" ] || fail "database dump failed"

# 2. Settings and keys (not the media cache, logs or certificates)
tar -czf "$WORK/files.tar.gz" --exclude='data/synapse/media_store' --exclude='*.log*' \
  --exclude='data/pushgw/backup-request' --exclude='data/pushgw/backup-status.json' \
  .env data/synapse data/whatsapp data/instagram data/messenger data/pushgw 2>/dev/null || fail "could not pack settings"

# 3. One encrypted file
NAME="inbox-backup-$(date -u +%Y-%m-%d-%H%M).tar.enc"
tar -cf - -C "$WORK" databases.sql.gz files.tar.gz \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass file:"$KEYF" -out "$WORK/$NAME" || fail "encryption failed"
SIZE=$(stat -c %s "$WORK/$NAME")

# 4. Upload, then keep only the last 8 weeks
rclone --config "$CONF" copy "$WORK/$NAME" "gdrive:$FOLDER" --retries 3 >/dev/null 2>"$WORK/err" \
  || fail "upload to Google Drive failed: $(tail -c 300 "$WORK/err")"
rclone --config "$CONF" delete "gdrive:$FOLDER" --min-age 57d --include 'inbox-backup-*' >/dev/null 2>&1 || true

status true "$SIZE" "Saved $NAME to Google Drive"
echo "$(now) backup ok: $NAME ($SIZE bytes)"
rm -rf "$WORK"; rm -f data/pushgw/backup-request
