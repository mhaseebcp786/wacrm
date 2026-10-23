# Deploying on AWS Lightsail (Mumbai)

A single small Lightsail instance in the same AWS region as your
Supabase project. Built for India-based users: the app server and the
database both sit in Mumbai (`ap-south-1`), so the many database
round-trips behind each inbound WhatsApp message stay at ~1–2 ms each.

```
Meta webhook ─┐
Browsers ─────┼─ HTTPS ─► Caddy :443 ─► app :3000 ─► Supabase (Mumbai)
              │                          ▲
              │                 cron ────┘  every 1 / 5 min
GitHub Actions ── SSH ─► docker compose pull && up -d
```

Everything for the server lives in [`deploy/lightsail/`](../deploy/lightsail);
the pipeline is [`.github/workflows/deploy-lightsail.yml`](../.github/workflows/deploy-lightsail.yml).

| Piece | What it does |
|---|---|
| `compose.yml` | `app` (image from GHCR), `caddy` (TLS + reverse proxy), `cron` (scheduled endpoints) |
| `Caddyfile` | Automatic Let's Encrypt certificate for `DOMAIN`, proxies to the app |
| `cron.sh` | Hits `/api/automations/cron` every minute and `/api/flows/cron` every 5 minutes |
| `backup.sh` | Nightly `pg_dump` of the Supabase database, 14 days kept on disk |
| `setup-server.sh` | One-time server bootstrap: Docker, swap, log caps, backup schedule |
| `.env.example` | Template for `/opt/wacrm/.env` on the server |

The image is built on GitHub's runners, never on the instance: `next
build` needs ~2 GB of RAM, while the running app idles at ~50 MB.

## Cost

| Item | USD / month |
|---|---|
| Lightsail 1 GB, dual-stack (IPv4 + IPv6), Mumbai | ~$7 + 18% GST |
| Automatic snapshots (incremental, ~$0.05/GB) | ~$1–2 |
| Static IP (free while attached) | $0 |
| Supabase Free | $0 |
| GitHub Actions + GHCR (private repo, within free minutes/storage) | $0 |

Mumbai plans include half the data-transfer allowance of other regions
(~1 TB on this plan) — far more than this app uses, since media is
served by Supabase, not the instance.

## 1. Supabase

1. Create a project with region **South Asia (Mumbai)**. A project's
   region can't be changed later. Save the database password.
2. Apply the schema from your machine, connecting as `postgres` through
   the **Session pooler** string (Connect button, with the password
   filled in):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   read -s "DBURL?Paste session pooler URL: "; echo   # zsh; keeps it out of history
   npx supabase db push --db-url "$DBURL"
   unset DBURL
   ```

   Don't run a bare `npx supabase db push`. Recent CLI versions log in
   as a temporary `cli_login_postgres` role and switch to `postgres`
   with `SET ROLE`, which drops `postgres`'s per-role `search_path`
   (`"$user", public, extensions`). Migration 001 then fails with
   `function uuid_generate_v4() does not exist`, because uuid-ossp
   lives in the `extensions` schema. Connecting as `postgres`
   directly keeps that `search_path`.

   The fork's own migrations are numbered `90001+`, so an upstream
   `047+` pulled in later sorts *before* already-applied ones. The CLI
   then refuses to push it as out of order; add `--include-all` to
   `db push` once you've checked the new upstream file.

3. **Authentication → URL Configuration**: Site URL
   `https://crm.yourdomain.in`; Redirect URLs `https://crm.yourdomain.in/**`
   (and `http://localhost:3000/**` for local dev). See
   [auth-emails.md](./auth-emails.md).
4. Note down the project URL, the anon key and the service-role key
   (Project Settings → API), and the **Session pooler** connection
   string (Connect button) for backups.

## 2. Lightsail instance

1. Lightsail console → **Create instance**:
   - Region **Mumbai (ap-south-1)**.
   - Platform **Linux/Unix**, blueprint **OS Only → Ubuntu 24.04 LTS**.
   - Network type **Dual-stack** (IPv4 + IPv6). Not IPv6-only:
     GitHub and GHCR have no IPv6, so the box couldn't pull images.
   - Plan **$7 (1 GB RAM, 2 vCPU, 40 GB SSD)**.
2. **Networking → Create static IP** and attach it to the instance.
3. **Networking → IPv4 firewall** (and the IPv6 firewall):
   allow SSH (22), HTTP (80), HTTPS (443). Optionally Custom UDP 443
   for HTTP/3.
   SSH has to stay open to any address because GitHub's runners don't
   have fixed IPs; Lightsail's Ubuntu image only accepts key logins.
4. **Snapshots → Automatic snapshots → Enable**, time **22:00 UTC**
   (03:30 IST) — one hour after the nightly database dump, so each
   snapshot carries the latest backup off the instance.

## 3. DNS

Create an `A` record `crm.yourdomain.in → <static IP>` (and optionally
`AAAA → <instance IPv6>`).

On Cloudflare, set the record to **DNS only** (grey cloud). Behind the
orange-cloud proxy every request would reach Caddy from a Cloudflare
IP, so the per-IP rate limits on invitation links would lump all users
together, and certificate issuance gets more fragile.

## 4. Bootstrap the server

From your machine (Lightsail's default key is downloadable under
**Account → SSH keys**):

```bash
scp -i LightsailDefaultKey-ap-south-1.pem deploy/lightsail/setup-server.sh ubuntu@<static IP>:
ssh -i LightsailDefaultKey-ap-south-1.pem ubuntu@<static IP>
bash setup-server.sh
exit   # log back in so the docker group applies
```

Create a dedicated deploy key for GitHub Actions and authorise it:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/wacrm_deploy -C wacrm-deploy -N ""
ssh-copy-id -i ~/.ssh/wacrm_deploy.pub -o "IdentityFile LightsailDefaultKey-ap-south-1.pem" ubuntu@<static IP>
```

Then create the server's environment file:

```bash
scp -i ~/.ssh/wacrm_deploy deploy/lightsail/.env.example ubuntu@<static IP>:/opt/wacrm/.env
ssh -i ~/.ssh/wacrm_deploy ubuntu@<static IP>
chmod 600 /opt/wacrm/.env
nano /opt/wacrm/.env
```

Fill in every value. Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
openssl rand -hex 32                                                       # AUTOMATION_CRON_SECRET
```

Two formatting rules for `.env`:

- Docker Compose expands `$` inside values. Wrap any value containing
  `$` in **single quotes** so it's taken literally.
- In `BACKUP_DATABASE_URL`, URL-encode special characters in the
  database password (`@` → `%40`, `$` → `%24`, `#` → `%23`, `/` → `%2F`).

Keep `ENCRYPTION_KEY` somewhere safe outside the server too — losing it
means every account has to re-enter its WhatsApp token.

## 5. GitHub

Push the code to a GitHub repository (private is fine), then under
**Settings → Secrets and variables → Actions**:

**Variables**

| Name | Value |
|---|---|
| `LIGHTSAIL_HOST` | The static IP. Deploys are skipped until this exists. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://crm.yourdomain.in` |
| `NEXT_PUBLIC_APP_LOCALE` | Optional, defaults to `en` |
| `LIGHTSAIL_USER` | Optional, defaults to `ubuntu` |

These are baked into the browser bundle, so they're variables, not
secrets. Keep them identical to the same keys in `/opt/wacrm/.env`.

**Secrets**

| Name | Value |
|---|---|
| `LIGHTSAIL_SSH_KEY` | Contents of `~/.ssh/wacrm_deploy` (the private key) |
| `LIGHTSAIL_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <static IP>` |

Before saving `LIGHTSAIL_KNOWN_HOSTS`, confirm the fingerprint matches
the server: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the
instance vs. `ssh-keyscan -t ed25519 <static IP> | ssh-keygen -lf -`
locally.

No registry credentials are needed: the workflow logs the server into
GHCR with the job's own short-lived `GITHUB_TOKEN` for each rollout.

### First deploy

Production is the **`saas-main`** branch (`main` only tracks upstream
wacrm and is never deployed). Push to `saas-main`. **CI** runs lint,
typecheck, tests and build; when it passes, **Deploy to Lightsail**
builds the image, copies the
`deploy/lightsail/` files to `/opt/wacrm/`, and starts the stack. The
job fails if the new app container doesn't turn healthy within three
minutes, and prints its logs.

To deploy without a new commit: **Actions → Deploy to Lightsail → Run
workflow**, with **saas-main** selected as the branch.

## 6. WhatsApp webhook

In the Meta app dashboard → WhatsApp → Configuration:

- Callback URL `https://crm.yourdomain.in/api/whatsapp/webhook`
- Verify token: the one you save in wacrm under **Settings → WhatsApp**
- Subscribe to `messages`, plus `message_template_status_update`,
  `message_template_quality_update` and
  `message_template_components_update` for template sync.

`META_APP_SECRET` in `/opt/wacrm/.env` must be that Meta app's secret,
or every webhook is rejected.

## 7. Check it

```bash
cd /opt/wacrm
docker compose ps                  # app healthy, caddy + cron up
docker compose logs -f app         # live app logs
docker compose logs cron           # only prints on failures
./backup.sh && ls -lh backups/     # test the backup once by hand
```

The `cron` service prints a line only when a call fails. A `401` there
means `AUTOMATION_CRON_SECRET` was changed without restarting the app.

## Day-to-day operations

| Task | Command (in `/opt/wacrm`) |
|---|---|
| Change a runtime setting | Edit `.env`, then `docker compose up -d` |
| Change a `NEXT_PUBLIC_*` value | Update the GitHub variable **and** `.env`, then re-run the deploy workflow |
| Restart the app | `docker compose restart app` |
| Roll back | `APP_IMAGE=ghcr.io/<owner>/<repo>:sha-<commit> docker compose up -d app` |
| Disk usage | `df -h /` and `docker system df` |
| OS updates | Security patches install automatically; `sudo reboot` occasionally — the stack comes back on its own |

Deploys keep about a week of previous images on the box, so recent
rollbacks don't need the registry. Older tags need a
`docker login ghcr.io` with a personal access token (`read:packages`).

A rollout restarts the app container, which means a few seconds where
requests fail. Meta retries webhook deliveries that fail, so inbound
messages aren't lost.

## Backups and restore

`backup.sh` dumps the `public`, `auth` and `storage` schemas nightly to
`/opt/wacrm/backups/` (log in `backups/backup.log`), and the Lightsail
snapshot copies them off the instance. **Uploaded files themselves
(avatars, chat media) stay in Supabase Storage and are not included** —
only their metadata.

Restore into a fresh project with the migrations applied:

```bash
docker run --rm -v /opt/wacrm/backups:/b postgres:17-alpine \
  pg_restore --no-owner --no-privileges --data-only \
  -d "<target session-pooler URL>" /b/wacrm-<timestamp>.dump
```

## When to scale up

- **Supabase Pro ($25/month)** comes first: when the database nears
  500 MB, storage nears 1 GB (inbound media is mirrored into
  `chat-media`; it can be turned off under Settings → WhatsApp →
  Attachment Storage), or monthly egress nears 5 GB. Pro also adds
  daily backups and removes free-tier pausing.
- **A bigger instance**: take a snapshot, create a 2 GB instance from
  it, move the static IP across. Run one instance only — the rate
  limiter keeps its counters in memory (`src/lib/rate-limit.ts`).
