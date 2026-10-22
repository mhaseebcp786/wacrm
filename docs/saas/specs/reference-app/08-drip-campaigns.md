# 08 — Drip Campaigns

**Roadmap:** P1.2 · **the reference app route:** `/drip-campaigns` (`/drip-campaigns/create`) · **API:** `/api/drip-campaigns`
**wacrm gap:** only a basic `Wait` step inside automations; no dedicated multi-step template sequence.

Reference only. Live trial builder captured 2026-10-21 (`spec_drip.json`, `spec_drip.png`).

## 1. What it is

An automated sequence of **approved template** messages sent to a contact at defined intervals
after they are enrolled. Header: *"Automated template sequences triggered by delivery, keywords, or API."*

## 2. Settings (captured)

- **Name** (required) + **Description** (optional).
- **Trigger Type** radio: **Manual** · **Keyword** · **API** (how contacts are enrolled).
- **Target Contact Groups** (optional multi-select) — contacts in these groups (and later additions)
  auto-enroll.
- **Exit on keyword match** toggle → **Exit Keywords** (chips) — sending any unenrolls the contact.
- **Skip missed specific-time steps** toggle — if a contact enrolls after a step's scheduled time,
  skip it.

## 3. Message sequence (captured)

- Ordered **Steps**; each: **Template** (approved-template picker) + **Wait / Delay**.
- Delay mode radio: **Wait duration** · **At specific time** · **Immediate**; duration unit select
  **Immediate / Minutes / Hours / Days**.
- **Add Step** to append; right-side **Summary**: total steps, trigger, templates configured `n/N`.
- **Create Campaign** / Discard.

Wait semantics (video): step 1 delay counts from enrollment; each later step's delay counts from
when the previous message was sent.

## 4. List

Columns: Campaign, Trigger, Steps, Enrollments, Status, Created, Actions. `GET /api/drip-campaigns?per_page=100`
returns a paginated list.

## 5. Mapping to this fork

- Sidecar tables matching roadmap P1.2: `saas_drip_campaigns(account_id, name, trigger_type,
  target_group_ids, exit_on_keyword, exit_keywords text[], skip_missed)`,
  `saas_drip_steps(campaign_id, step_number, delay_mode, delay_value, delay_unit, template_id, variable_map jsonb)`,
  `saas_drip_enrollments(campaign_id, contact_id, current_step, next_send_at, status)`.
- Enrollment via keyword (inbound webhook), manual, or API. Exit-on-reply/keyword flips status.
- Extend the existing `/api/automations/cron` (or a new cron) to send due steps
  (`next_send_at <= now()`), respecting rate limits. Templates only (marketing/utility), so no 24h-window issue.
