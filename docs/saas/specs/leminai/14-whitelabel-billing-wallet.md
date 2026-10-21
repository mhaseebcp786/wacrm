# 14 — White-label, subscription plans & prepaid wallet

**Roadmap:** P3.2 · **LeminAi routes:** `/billing/subscription`, `/billing/wallet`, `/whitelabel-setup`,
`/whitelabel-users` · **APIs:** `/api/billing/plan`, `/api/billing/overview`, `/api/billing/rate-cards`,
`/api/public-config`
**wacrm fork context:** this fork is itself a multi-tenant SaaS (see AGENTS.md); these are the
monetisation surfaces.

Reference only. Live trial, 2026-10-21 (`spec_subscription.json`, `spec_wallet.json`,
`spec_whitelabel.json`). White-label setup is paid-only (redirected to `/home` + "Upgrade Plan").

## 1. Subscription plans (captured)

- Billing toggle **Quarterly / Annually**.
- Plans seen: **Trial** (₹0 / 15 days, current), **Enhanced** (₹599/mo + GST; ₹8,482/yr),
  **Premium** (₹999/mo + GST; ₹14,146/yr). "Show all features (27)" — plans gate feature access.
- `GET /api/billing/plan` → `{ id, organization_id, plan_id, started_at, expires_at, status,
  plan:{ id, name, ... } }`. Trial row: `plan_id:4`, expires 2026-11-05.

## 2. Prepaid wallet (captured)

- **Available Balance** (trial seeded **10.00 INR**). Tabs **Overview** / **Transactions**:
  Total Recharged, Total Spent, Credit Spend (last 30 days), By Category, Spend by Source.
- Trial notice: *"Direct credit recharges are available for paid subscription plans."* (recharge gated).
- `GET /api/billing/overview` drives the wallet widgets; rate cards (`/api/billing/rate-cards`,
  `/api/billing/call-rate-cards`) provide per-category INR prices (see [11-campaigns-broadcast](11-campaigns-broadcast.md) §3).
- Deduction model (roadmap): on Meta `statuses[]` webhook with a `pricing` object
  (`billable:true`, category), deduct the rate-card cost from the wallet.

## 3. White-label (captured partial + `/api/public-config`)

- `/whitelabel-setup` and `/whitelabel-users` ("Manage Users") are paid-plan features.
- `GET /api/public-config` exposes white-label knobs: `is_whitelabel`, `theme_color`,
  `whitelabel_server_ip`, plus branding (manifest `storage/branding/...`), recaptcha, facebook app
  id, WhatsApp-OTP config. Branding resolves per host/domain.

## 4. Mapping to this fork

- This fork's AGENTS.md already mandates `saas_*` sidecar tables and a two-tier operator/tenant
  model. These map to roadmap P3.2: `tenant_branding(custom_domain, app_name, logo_url,
  primary_color, support_url)`, `subscription_plans(features jsonb, max_agents, monthly_price)`,
  `wallets(account_id, balance_micros, currency)`, `wallet_ledger(account_id, amount_micros,
  direction, meta_message_id, category)`.
- Feature-gate by plan in RLS/server actions; resolve branding in middleware by `Host`.
- Wallet deduction hooks the existing status webhook. Spec only.
