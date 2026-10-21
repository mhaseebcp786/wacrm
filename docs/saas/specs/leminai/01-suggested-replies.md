# 01 — Suggested Replies (rich canned replies)

**Roadmap:** P0.2 · **LeminAi route:** `/quick-replies` · **API:** `/api/quick-replies`
**wacrm gap:** today only plain-text templates; no saved interactive/media/carousel/list replies.

Reference only — no implementation here. All JSON below is **verbatim** from the live trial
(request bodies captured 2026-10-21; raw in scratchpad `qr_posts.json`, `qr_posts2.json`, and the
list GET). This is the canonical reference for the shared **message object** used by
[02-autoresponder](02-autoresponder.md), [03-chatbot](03-chatbot.md) and [16-flow-builder](16-flow-builder.md).

## 1. What it is

A library of pre-built messages an agent can insert into the inbox composer in one click (the
inbox `+` menu → "Quick reply"). Each saved reply is a **name + a Meta message object**. LeminAi
supports **9 message types**, each mapping to a WhatsApp Cloud API send body.

## 2. List & model

- `GET /api/quick-replies` → `{ data: [ { id, organization_id, name, message_type, payload, is_active, created_at } ] }`
- Create: `POST /api/quick-replies` with `{ name, message_type, payload }` → `201` + the stored row.
- List columns: Name, Type, Created At, Actions. Search box; `is_active` flag.

Suggested data model for this fork (sidecar): `saas_quick_replies(id, account_id, name,
message_type, payload jsonb, is_active, created_at)`. `payload` stores the Meta object as-is.

## 3. The nine message types — exact payloads

Create UI: Name + a type selector (Text · Interactive · Image · Video · Audio · Document ·
Carousel · Location · Contact) + a type-specific body, with a live WhatsApp preview.
Personalisation tokens `{{contact.name}}` / `{{contact.phone}}` are inserted via "Insert: Name / Phone".

### 3.1 Text
Field: textarea, max **4096**, `preview_url` on by default.
```json
{ "message_type": "text",
  "payload": { "type": "text", "text": { "body": "Hello {{contact.name}}, thanks for contacting Invicto Associates LLP.", "preview_url": true } } }
```

### 3.2 Interactive (4 sub-types via "Button Type")
Shared: optional **Header** (None | Text | Media[image/video/document]); body textarea max **1024**;
optional **Footer** max **60**. Button-type selector drives `interactive.type`:

**Reply Button** — up to **3** quick-reply buttons, label max **20**:
```json
{ "message_type": "interactive",
  "payload": { "type": "interactive", "interactive": {
    "type": "button",
    "body": { "text": "Which product line are you interested in?" },
    "footer": { "text": "Invicto Associates LLP" },
    "action": { "buttons": [
      { "type": "reply", "reply": { "id": "1792584007253_20acl", "title": "Laminates" } },
      { "type": "reply", "reply": { "id": "1792584010380_lq2ye", "title": "Wall panels" } }
    ] } } } }
```
Note the button `id` is a client-generated unique string.

**CTA Button** — single URL button, label max **20**, `url`:
```json
{ "message_type": "interactive",
  "payload": { "type": "interactive", "interactive": {
    "type": "cta_url",
    "body": { "text": "See our full product range." },
    "action": { "name": "cta_url", "parameters": { "display_text": "View range", "url": "https://www.invictoassociatesllp.in/products" } } } } }
```

**List Button** — button label max **20**; up to **10 sections / 10 rows total**; row title max
**24**, description max **72** (optional):
```json
{ "message_type": "interactive",
  "payload": { "type": "interactive", "interactive": {
    "type": "list",
    "body": { "text": "Choose a category" },
    "action": { "button": "Categories", "sections": [
      { "title": "Interiors", "rows": [
        { "id": "opt_1792584140199_hxzpu", "title": "Laminates", "description": "Veneer and acrylic laminates" } ] } ] } } } }
```

**Flow Button** — attaches a published WhatsApp Flow (see [07-forms-flows](07-forms-flows.md)):
fields Flow (published-flow picker), Button Label max **30** (no emoji), optional Entry Screen ID.
Trial had no published flows, so the exact `interactive.type: "flow"` body was not captured live;
Meta's shape is `action: { name: "flow", parameters: { flow_id, flow_cta, ... } }`.

### 3.3 Image
File picker (File Manager), caption textarea max **1024**. UI limit text: **≤5 MB (JPG/JPEG/PNG)**.
```json
{ "message_type": "image",
  "payload": { "type": "image", "image": { "link": "https://app.leminai.com/storage/orgs/2465/<uuid>-card-1.jpg", "caption": "Welmica Syncrow Woodgrain laminates" } } }
```

### 3.4 Video
Limit text **≤16 MB (MP4, 3GP, 3GPP)**; caption max 1024. Payload: `{ "type":"video", "video": { "link", "caption" } }`.

### 3.5 Audio
Two sub-modes via "Audio Type": **Voice Message** (OGG/OPUS mono only — "required for
transcription") vs **Basic Audio** (AAC/AMR/MP3/M4A/OGG). Limit **≤16 MB**.
Payload: `{ "type":"audio", "audio": { "link", "voice": true|false } }` (voice flag distinguishes PTT).

### 3.6 Document
Limit **≤100 MB (PDF/DOC/DOCX…)**; optional **Filename** (include extension) + caption max 1024.
Payload: `{ "type":"document", "document": { "link", "filename", "caption" } }`.

### 3.7 Carousel (service-window interactive carousel)
Message body textarea max **1024**. "Card Button Type" radio: **URL Button** or **Quick Reply**
(all cards must use the same type). 2–10 cards; per-card media (Image/Video — **type locked to the
first card**), card body max **160**, button label max **20**.

URL-button cards (every card `type: "cta_url"`):
```json
{ "message_type": "interactive",
  "payload": { "type": "interactive", "interactive": {
    "type": "carousel",
    "body": { "text": "Our latest laminate collections" },
    "action": { "cards": [
      { "card_index": 0, "type": "cta_url",
        "header": { "type": "image", "image": { "link": ".../card-1.jpg" } },
        "body": { "text": "Welmica Syncrow Woodgrain" },
        "action": { "name": "cta_url", "parameters": { "url": "https://www.invictoassociatesllp.in/products", "display_text": "View range" } } },
      { "card_index": 1, "type": "cta_url", "header": { "type": "image", "image": { "link": ".../card-2.jpg" } },
        "body": { "text": "Lavvic Acrylic Marble" },
        "action": { "name": "cta_url", "parameters": { "url": "...", "display_text": "View range" } } }
    ] } } } }
```

Quick-reply cards — **LeminAi emits `card.type: "button"`** with `action.buttons[].quick_reply`:
```json
{ "card_index": 0, "type": "button",
  "header": { "type": "image", "image": { "link": ".../card-1.jpg" } },
  "action": { "buttons": [ { "type": "quick_reply", "quick_reply": { "id": "qr_1792585152611_y2dfz", "title": "Know more" } } ] },
  "body": { "text": "Card 1" } }
```

> **Cross-check vs this fork — the one unresolved mismatch.** Meta's own carousel documentation
> uses `card.type: "cta_url"` for **every** card, including quick-reply cards, and puts the reply
> buttons inside `action.buttons`. This fork's `carousel-send.ts` follows Meta (always `cta_url`).
> LeminAi instead sends `card.type: "button"` for quick-reply cards. Both cannot be "the only
> correct" value. This is the same open question flagged in `docs/saas/features/01-carousel-messages.md`.
> **Resolve by a real Meta send before changing the fork** — do not assume LeminAi is authoritative;
> their draft may still be rejected/normalised by Meta at send time. Spec only; no change here.

### 3.8 Location
Fields: Latitude, Longitude, Name (optional), Address (optional).
Payload: `{ "type":"location", "location": { "latitude", "longitude", "name", "address" } }`.

### 3.9 Contact
Two sources: "From Contacts" (pick an existing contact) or "Enter Manually" (name/phone/email…).
Payload: Meta `contacts` array (`{ "type":"contacts", "contacts":[ { name, phones, emails,… } ] }`).

### 3.10 Catalog (mentioned in video, not in trial type list)
The walkthrough shows a Catalog option (single product / multiple product / catalog / product
carousel). Not present in the trial's type buttons (needs a connected catalog); see
[12-integrations](12-integrations.md) / roadmap P3.1.

## 4. Mapping to this fork

- Reuse the fork's existing carousel builders; add the eight other types as one
  `saas_message_payload` module (builder + per-type validator + inbox renderer + composer UI).
- The inbox composer `+` menu gains a "Quick reply" picker that inserts a saved `payload`.
- All media is a File-Manager URL (`image.link` etc.), matching the template media path already built.
- Enforce the exact limits in §3 in the validator (they are Meta limits, surfaced by LeminAi).
