#!/usr/bin/env bash
# Runs every minute (cron). If casedesk/server changed on GitHub, install it and run setup.sh.
# Never touches data/ or .env.
set -euo pipefail
main() {
cd "$(dirname "$0")"
exec 9>/tmp/casedesk-update.lock; flock -n 9 || exit 0
REPO=https://github.com/vijaykannan2020-del/Apps
SHA=$(git ls-remote "$REPO" refs/heads/main 2>/dev/null | cut -f1)
[ -n "$SHA" ] || exit 0
[ "$SHA" = "$(cat .deployed-sha 2>/dev/null || true)" ] && exit 0
TMP=$(mktemp -d); trap 'rm -rf "$TMP" "$TMP.tgz"' EXIT
curl -fsSL "$REPO/archive/$SHA.tar.gz" -o "$TMP.tgz"
tar xzf "$TMP.tgz" -C "$TMP" --strip-components=3 "Apps-$SHA/casedesk/server"
# public pages (invite /get, privacy) next to it; served from ./site (docker-compose.yml)
mkdir -p "$TMP/site"; tar xzf "$TMP.tgz" -C "$TMP/site" --strip-components=3 "Apps-$SHA/casedesk/site" 2>/dev/null || true
rm -f "$TMP.tgz"
if diff -qr --exclude=data --exclude=.env --exclude=.deployed-sha "$TMP" . >/dev/null 2>&1; then
  echo "$SHA" > .deployed-sha; exit 0
fi
echo "$(date -u '+%F %T') updating to ${SHA:0:7}"
cp -r "$TMP"/. .
chmod +x setup.sh auto-update.sh
./setup.sh
echo "$SHA" > .deployed-sha
}
main "$@"
exit $?
