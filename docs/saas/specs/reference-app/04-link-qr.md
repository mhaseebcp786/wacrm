# 04 — Link & QR generator (trackable chat links, auto-tag)

**Roadmap:** P0.3 · **the reference app route:** `/link-qr` · **API:** `/api/links`, `/api/links/dropdowns`
**wacrm gap:** none today.

Reference only. Observed on the live trial (2026-10-21). **Partial:** the trial org had no phone
number connected, so the generator showed *"Phone Number Missing — connect your WABA first"* and
link creation could not be exercised end to end; UI structure and endpoints below are confirmed,
the exact `POST /api/links` body is inferred from the form + roadmap.

## 1. What it is

Creates a `wa.me`-style deep link and a QR code with a **pre-filled message**, and attaches a
**contact group** and a **label** that are auto-applied to anyone who starts the chat through it.
Used for exhibitions, YouTube descriptions, etc. ("scan to start a WhatsApp chat").

## 2. UI / form

- **Text Message** (the pre-filled message the customer sees).
- **Select Group** (dropdown from `/api/links/dropdowns` → `{ groups:[], labels:[] }`).
- **Select Label**.
- Live **Generated Link** (Copy) + **QR CODE PREVIEW** (Download QR).
- **Save Link** persists it; **Saved Links** table: Messages, Link, Created, Group Name, Label Name,
  Actions (copy/download/delete), paginated 25/page.

## 3. Endpoints

- `GET /api/links/dropdowns` → `{ status, groups, labels }` (populate the two selects).
- `GET /api/links` → `{ status, links: [...] }` (saved links table).
- `POST /api/links` (not captured — no WABA) with, per form + roadmap, approximately
  `{ message, group_id, label_id }` → returns `deep_link_url` and a QR image URL.

## 4. Meta mechanism & mapping to this fork

The reference app almost certainly uses Meta's **QR Code Management API**
(`POST /{phone_number_id}/message_qrdls` with `prefilled_message` + `generate_qr_image`), which
returns `code`, `deep_link_url` (`https://wa.me/message/<code>`) and a QR image — matching the
roadmap P0.3 blueprint (≤2000 codes/number, 140-char prefilled message).

Fork implementation (later): sidecar `saas_qr_links(account_id, meta_qr_code, prefilled_message,
deep_link_url, qr_image_url, auto_group_id, auto_label_id)`; in the inbound webhook, match the first
inbound message text against saved `prefilled_message`s to auto-assign the group + label (and
optionally open a pipeline deal). Needs a connected phone number to test.
