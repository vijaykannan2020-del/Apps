#!/usr/bin/env bash
# Weekly: delete the server's copies of SHARED reels/posts and link-preview images older than 7 days.
# Normal photos and videos people send you are kept. Nothing changes in WhatsApp or Instagram.
# Usage: ./media-cleanup.sh            (delete)
#        ./media-cleanup.sh --dry-run  (only show what would be deleted)
set -euo pipefail
cd "$(dirname "$0")"
DRY=${1:-}
DAYS=7
dc() { docker compose "$@"; }
psql_q() { dc exec -T postgres psql -U synapse -d synapse -At -F ' ' -c "$1"; }
CUTOFF="(extract(epoch from now())*1000 - $DAYS*86400000)"

# 1) reels / shared Instagram posts (video or photo whose caption or link points at an Instagram reel/post)
REELS=$(psql_q "
select coalesce(c->>'url',''), coalesce(c->'info'->>'thumbnail_url','')
from (select e.origin_server_ts ts, (j.json::json)->'content' c
      from events e join event_json j using(event_id) where e.type='m.room.message') x
where ts < $CUTOFF and c->>'msgtype' in ('m.video','m.image')
  and (coalesce(c->>'body','') ~* 'instagram\.com/(reel|reels|p)/' or coalesce(c->>'external_url','') ~* 'instagram\.com/(reel|reels|p)/');")

# 2) link-preview images attached to shared links
PREVIEWS=$(psql_q "
select lp->>'og:image'
from (select e.origin_server_ts ts, (j.json::json)->'content' c
      from events e join event_json j using(event_id) where e.type='m.room.message') x,
     lateral json_array_elements(case when json_typeof(c->'com.beeper.linkpreviews')='array' then c->'com.beeper.linkpreviews' else '[]'::json end) lp
where ts < $CUTOFF and lp->>'og:image' like 'mxc://%';")

MXCS=$(printf '%s\n%s\n' "$REELS" "$PREVIEWS" | tr ' ' '\n' | grep '^mxc://' | sort -u || true)
COUNT=$(printf '%s' "$MXCS" | grep -c . || true)
echo "$(date -u '+%F %T') found $COUNT shared-reel/link media files older than $DAYS days"
[ "$DRY" = "--dry-run" ] && { printf '%s\n' "$MXCS" | head -20; exit 0; }
[ "$COUNT" -gt 0 ] || exit 0

# admin token for a dedicated cleanup account (created once, stored on the server only)
if [ ! -s data/cleanup-token ]; then
  PASS=$(openssl rand -hex 24)
  dc exec -T synapse register_new_matrix_user -c /data/homeserver.yaml -u inbox-cleanup -p "$PASS" -a http://localhost:8008 >/dev/null
  dc exec -T synapse curl -fsS -X POST http://localhost:8008/_matrix/client/v3/login -H 'Content-Type: application/json' \
    -d "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"inbox-cleanup\"},\"password\":\"$PASS\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])' > data/cleanup-token
  chmod 600 data/cleanup-token
fi
TOKEN=$(cat data/cleanup-token)

DELETED=0
while read -r MXC; do
  [ -n "$MXC" ] || continue
  SRV=${MXC#mxc://}; SRV=${SRV%%/*}; ID=${MXC##*/}
  if dc exec -T synapse curl -fsS -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" \
       "http://localhost:8008/_synapse/admin/v1/media/$SRV/$ID" 2>/dev/null; then DELETED=$((DELETED+1)); fi
done <<< "$MXCS"
echo "$(date -u '+%F %T') deleted $DELETED files"
