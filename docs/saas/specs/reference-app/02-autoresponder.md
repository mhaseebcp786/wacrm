# 02 — Autoresponder (auto-sender)

**Roadmap:** P0.2 (auto-sender half) · **the reference app route:** `/autoresponder` · **API:** `/api/autoresponder`, `POST /api/autoresponder/create`
**wacrm gap:** no first-message / after-inactivity automatic rich reply.

Reference only. Payloads below are verbatim from the live trial (2026-10-21; raw in scratchpad
console logs / `spec_*` artifacts).

## 1. What it is

Sends an automatic reply when a condition is met, **without** an agent. It reuses the shared
message object from [01-suggested-replies](01-suggested-replies.md) (all 9 message types), so an
auto-reply can be text, interactive, media, carousel, etc. Two-step wizard: Basic Info → Message.

## 2. Basic Info (step 1)

- **Name**.
- **Type** radio: `Non-Template` ("Service messages (Free)") or `Template` ("Pre-approved
  marketing/utility — chargeable", picks an approved template instead of a free-form message).
- **Send condition** select: `Only on first message` (→ `send_condition: "always"` with
  first-contact semantics) or `Resend after days` (→ `send_condition: "always"` + `delay: <N>`,
  N = 1..90 chosen from a dropdown). *Observed:* both options serialised `send_condition` as
  `"always"`; the distinguishing field is `delay`.
- **Restrict to specific hours** toggle → reveals **Days of week** (Sun–Sat multi-select) and a
  **Time window** (From/To, 12-hour with AM/PM). When on, serialises as
  `send_condition: "scheduled_hours"` + `schedule_days` (ISO weekday ints) + `schedule_time_from/to` (`HH:MM`).

## 3. Message (step 2)

Identical composer to Suggested Replies (Text/Interactive/Image/Video/Audio/Document/Carousel/
Location/Contact) when Type = Non-Template; a template picker when Type = Template.

## 4. Exact create payloads (captured)

**First-message / always, text:**
```json
{ "name": "spec_ar_welcome", "type": "non-template",
  "send_condition": "scheduled_hours", "message_type": "text",
  "payload": { "type": "text", "text": { "body": "Welcome to Invicto Associates LLP! We will get back to you shortly.", "preview_url": true } },
  "delay": 1, "is_active": true,
  "schedule_days": [1,2,3,4,5], "schedule_time_from": "09:00", "schedule_time_to": "10:00" }
```
Response nests the message under `non_template.payload` and `template: null`.

**Resend after N days, no restriction:**
```json
{ "name": "spec_ar_resend", "type": "non-template", "send_condition": "always",
  "message_type": "text",
  "payload": { "type": "text", "text": { "body": "Hello again from Invicto Associates LLP.", "preview_url": true } },
  "delay": 3, "is_active": true, "schedule_days": null, "schedule_time_from": null, "schedule_time_to": null }
```

List columns: Name, Type, Send Condition, Status (Active/…), Actions.

## 5. Mapping to this fork

- Sidecar `saas_autoresponders(id, account_id, name, mode[non_template|template], send_condition,
  delay_days, schedule_days int[], schedule_time_from, schedule_time_to, message_type, payload jsonb,
  template_id?, is_active)`.
- Evaluate in the **inbound webhook** before updating `conversations.last_inbound_at`:
  first-message = no prior inbound; resend = `now - last_inbound_at >= delay_days`; respect
  `schedule_days`/time window in the account timezone. This matches the roadmap P0.2 "auto_sender_rules" idea.
- Reuse the shared message-object sender for delivery (free-form only valid inside the 24h window;
  Template mode sidesteps the window).
