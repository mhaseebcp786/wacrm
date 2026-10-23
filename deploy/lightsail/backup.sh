#!/usr/bin/env bash
# Nightly Postgres backup of the Supabase project.
#
# The Supabase Free plan has no backups of its own. This dumps the
# schemas wacrm's data lives in — public (CRM data), auth (users,
# so logins survive a restore) and storage (file metadata; the files
# themselves stay in Supabase Storage and are NOT included) — into
# /opt/wacrm/backups as pg_dump custom-format files, keeping the last
# BACKUP_KEEP_DAYS days. Lightsail's automatic snapshots then carry
# those files off the instance.
#
# Installed into the ubuntu user's crontab by setup-server.sh. Run by
# hand to test:  /opt/wacrm/backup.sh
#
# Restore (into an empty project with the migrations applied):
#   pg_restore --no-owner --no-privileges --data-only \
#     -d "$TARGET_DATABASE_URL" backups/wacrm-<timestamp>.dump

set -euo pipefail

cd "$(dirname "$0")"

# Read single keys out of .env instead of sourcing it: values such as
# keys and passwords may hold characters a shell would interpret.
env_value() {
  local line
  line=$(grep -E "^$1=" .env | tail -n 1 || true)
  line=${line#*=}
  line=${line%\"}; line=${line#\"}
  line=${line%\'}; line=${line#\'}
  printf '%s' "$line"
}

DB_URL=$(env_value BACKUP_DATABASE_URL)
KEEP_DAYS=$(env_value BACKUP_KEEP_DAYS)
KEEP_DAYS=${KEEP_DAYS:-14}
# pg_dump must be at least the server's major version. New Supabase
# projects run Postgres 17; bump this if yours reports a newer one.
PG_IMAGE=$(env_value BACKUP_PG_IMAGE)
PG_IMAGE=${PG_IMAGE:-postgres:17-alpine}

if [[ -z "$DB_URL" ]]; then
  echo "BACKUP_DATABASE_URL is not set in /opt/wacrm/.env — skipping backup" >&2
  exit 1
fi

mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="backups/wacrm-${stamp}.dump"

# The URL goes in through the environment, not argv, so it doesn't
# show up in `ps` on the host. --user keeps the dump owned by this
# user rather than root.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e DB_URL="$DB_URL" \
  -v "$PWD/backups:/backups" \
  "$PG_IMAGE" \
  sh -c 'pg_dump "$DB_URL" --format=custom --no-owner --no-privileges \
    --schema=public --schema=auth --schema=storage \
    --file="/backups/$(basename "$0")"' "$target"

echo "$(date -u +%FT%TZ) wrote ${target} ($(du -h "$target" | cut -f1))"

find backups -name 'wacrm-*.dump' -type f -mtime +"$KEEP_DAYS" -delete
