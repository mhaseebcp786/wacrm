#!/bin/sh
# Scheduler for the two cron endpoints (runs in the `cron` service of
# compose.yml, on busybox sh + wget).
#
#   /api/automations/cron — every minute. Drains automation Wait steps
#     and wait-for-reply timeouts; the interval is the worst-case delay
#     on a Wait step finishing.
#   /api/flows/cron       — every 5 minutes. Times out abandoned flow
#     runs, which otherwise block new flows for that contact forever.
#
# Calls go straight to app:3000 on the compose network, not through
# Caddy, so they don't depend on DNS or the certificate. Requests run
# one after another, so a slow drain can never overlap the next one.

set -u

BASE_URL="http://app:3000"
FLOWS_EVERY=5

hit() {
  if ! out=$(wget -q -O - -T 55 \
    --header "x-cron-secret: ${AUTOMATION_CRON_SECRET}" \
    "${BASE_URL}$1" 2>&1); then
    echo "$(date -u +%FT%TZ) $1 failed: ${out}"
  fi
}

echo "$(date -u +%FT%TZ) cron runner started"
tick=0
while true; do
  hit /api/automations/cron
  if [ $((tick % FLOWS_EVERY)) -eq 0 ]; then
    hit /api/flows/cron
  fi
  tick=$((tick + 1))
  sleep 60
done
