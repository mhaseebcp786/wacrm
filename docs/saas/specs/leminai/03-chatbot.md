# 03 — Chatbot (keyword & event auto-replies)

**Roadmap:** P0.2 / P1 · **LeminAi route:** `/chatbot` · **API:** `/api/chatbots`, `POST /api/chatbots`
**wacrm gap:** wacrm automations are keyword/trigger-based but have no single-shot "if message
matches X, send this rich message" bot with CTWA/catalog/flow triggers.

Reference only. Verbatim payloads from the live trial (2026-10-21).

## 1. What it is

A single-turn automated responder: when an inbound message matches a **send condition**, it sends
one message built with the shared message object ([01-suggested-replies](01-suggested-replies.md)).
Two-step wizard: Basic Info → Message. Type radio `Non-Template` / `Template` as in Autoresponder.

## 2. Send conditions (the valuable part)

Selector options and the extra field each reveals (all captured live):

| Condition (`send_condition`) | Extra input | Fires when |
|---|---|---|
| `exact_match` | Keywords (chips, Enter to add) | message == a keyword |
| `contains` | Keywords | message contains a keyword |
| `button_reply` | Button Text (optional; blank = any) | a reply button with that text is tapped |
| `list_reply` | Row Text (optional; blank = any) | a list row with that text is selected |
| `whatsapp_flow_response` / flow | WhatsApp Form picker (optional; blank = any) | a Flow form is submitted |
| `first_message` | — | contact's very first message |
| `anything_else` (fallback) | — | any message not matched by another bot |
| `meta_ads_ctwa` | — | message arrives via a Click-to-WhatsApp ad (see [05](05-ctwa-and-meta-ads.md)) |
| `catalog_order` | Product picker (optional; blank = any) | customer places a WhatsApp catalog order |

## 3. Exact create payloads (captured)

**CTWA trigger:**
```json
{ "name": "spec_cb_ctwa", "type": "non-template", "send_condition": "meta_ads_ctwa",
  "lead_form_id": null, "keywords": [], "message_type": "text",
  "payload": { "type": "text", "text": { "body": "Thanks for clicking our ad! How can we help?", "preview_url": true } },
  "is_active": true }
```

**First message:**
```json
{ "name": "spec_cb_first", "type": "non-template", "send_condition": "first_message",
  "lead_form_id": null, "keywords": [], "message_type": "text",
  "payload": { "type": "text", "text": { "body": "Welcome to Invicto Associates LLP!", "preview_url": true } },
  "is_active": true }
```

Common fields: `keywords` is a string array (used by exact/contains); `lead_form_id` links a Meta
lead form for CTWA/leadgen flows. Response nests the message under `non_template.payload`; list
columns Name, Type, Condition, Total triggers (`trigger_count`), Status; actions
pause/activate/edit/delete.

## 4. Relationship to wacrm automations

wacrm already has an automations/chat-flow engine. The chatbot is a **simpler, flatter** primitive:
one trigger → one rich message. Two reasonable fork approaches (decide at implementation time, not here):
1. Add these trigger types + the shared message object as new automation trigger/action nodes, or
2. Build a dedicated `saas_chatbots` sidecar evaluated in the inbound webhook.
The distinctive, must-have triggers absent from wacrm today are **`button_reply` / `list_reply`
exact-text matching**, **`whatsapp_flow_response`**, **`meta_ads_ctwa`**, and **`catalog_order`**.

## 5. Mapping to this fork

- `saas_chatbots(id, account_id, name, mode, send_condition, keywords text[], button_text,
  row_text, flow_id, product_id, lead_form_id, message_type, payload jsonb, is_active, trigger_count)`.
- Inbound webhook resolves the first matching active bot by condition precedence (specific match >
  first_message > fallback). Reuse the shared sender.
