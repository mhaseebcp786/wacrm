#!/usr/bin/env bash
# One-time bootstrap for a fresh Lightsail Ubuntu 24.04 instance.
#
# Run as the default `ubuntu` user (it calls sudo where needed):
#   curl -fsSL <raw URL of this file> -o setup-server.sh   # or scp it
#   bash setup-server.sh
#
# Safe to re-run: every step checks before it changes anything.
#
# What it does:
#   1. Installs Docker Engine + the Compose plugin from Docker's apt repo.
#   2. Caps Docker's own log size (compose.yml also rotates per service).
#   3. Adds a 2 GB swap file — headroom for a 1 GB instance during
#      image pulls and traffic spikes.
#   4. Creates /opt/wacrm (where the deploy workflow puts compose.yml,
#      Caddyfile, cron.sh and backup.sh) owned by this user.
#   5. Schedules backup.sh nightly at 02:30 IST (21:00 UTC).

set -euo pipefail

APP_DIR=/opt/wacrm
SWAP_FILE=/swapfile
SWAP_SIZE=2G

log() { printf '\n==> %s\n' "$*"; }

if [[ $EUID -eq 0 ]]; then
  echo "Run this as the ubuntu user, not root — it uses sudo itself." >&2
  exit 1
fi

log "Updating packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine"
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker already installed — skipping"
fi

if [[ ! -f /etc/docker/daemon.json ]]; then
  log "Capping Docker log size"
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' \
    | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
fi
sudo systemctl enable --now docker

if ! id -nG "$USER" | grep -qw docker; then
  log "Adding $USER to the docker group (takes effect on next login)"
  sudo usermod -aG docker "$USER"
fi

if ! sudo swapon --show | grep -q "$SWAP_FILE"; then
  log "Creating ${SWAP_SIZE} swap file"
  sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE"
  sudo chmod 600 "$SWAP_FILE"
  sudo mkswap "$SWAP_FILE"
  sudo swapon "$SWAP_FILE"
  grep -q "$SWAP_FILE" /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
  # Only swap under real memory pressure.
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-wacrm-swap.conf >/dev/null
  sudo sysctl -p /etc/sysctl.d/99-wacrm-swap.conf
fi

log "Preparing ${APP_DIR}"
sudo mkdir -p "$APP_DIR/backups"
sudo chown -R "$USER:$USER" "$APP_DIR"

CRON_LINE="0 21 * * * ${APP_DIR}/backup.sh >> ${APP_DIR}/backups/backup.log 2>&1"
if ! crontab -l 2>/dev/null | grep -qF "${APP_DIR}/backup.sh"; then
  log "Scheduling nightly backup (02:30 IST)"
  (crontab -l 2>/dev/null || true; echo "$CRON_LINE") | crontab -
fi

log "Done"
cat <<EOF

Next steps (docs/deploy-lightsail.md has the detail):
  1. Log out and back in so the docker group applies.
  2. Create ${APP_DIR}/.env from deploy/lightsail/.env.example
     and lock it down:  chmod 600 ${APP_DIR}/.env
  3. Push to main (or run the "Deploy to Lightsail" workflow by hand).
     The workflow copies compose.yml, Caddyfile, cron.sh and backup.sh
     here and starts the stack.
EOF
