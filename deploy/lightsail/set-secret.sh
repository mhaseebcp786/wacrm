#!/usr/bin/env bash
# Set one variable in /opt/wacrm/.env without the value appearing on
# screen, in shell history, or in `ps`.
#
#   ./set-secret.sh SUPABASE_SERVICE_ROLE_KEY
#
# Prompts for the value (input hidden), then replaces any existing line
# for that variable. The value is written single-quoted so Docker
# Compose takes it literally, `$` included. Run `docker compose up -d`
# afterwards for the app to pick it up.

set -euo pipefail

cd "$(dirname "$0")"

key=${1:?usage: $0 VARIABLE_NAME}
if [[ ! $key =~ ^[A-Z][A-Z0-9_]*$ ]]; then
  echo "Not a valid variable name: $key" >&2
  exit 1
fi

# `read` returns non-zero at end of input with no trailing newline (a
# piped value); that's still a value, so only the empty case fails.
read -rsp "Paste the value for $key (input is hidden), then press Enter: " value || true
echo

if [[ -z $value ]]; then
  echo "Empty value — nothing changed." >&2
  exit 1
fi
if [[ $value == *"'"* ]]; then
  echo "The value contains a single quote; edit .env by hand instead." >&2
  exit 1
fi

touch .env
chmod 600 .env
tmp=$(mktemp .env.XXXXXX)
grep -v -E "^${key}=" .env > "$tmp" || true
printf "%s='%s'\n" "$key" "$value" >> "$tmp"
chmod 600 "$tmp"
mv "$tmp" .env

echo "$key saved (${#value} characters)."
