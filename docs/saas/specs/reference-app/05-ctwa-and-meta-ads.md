# 05 — CTWA attribution & Meta Ads lead forms

**Roadmap:** P0.4 (CTWA) + P2.2 (Lead Ads) · **the reference app routes:** `/meta-adds`, chatbot `meta_ads_ctwa` trigger
**wacrm gap:** the webhook ignores `referral` (CTWA) and there is no Facebook lead-ad ingest.

Reference only. Live trial, 2026-10-21. The OAuth URL below is the **actual** value the trial
returned; lead-form ingestion itself needs a connected Facebook page (not done on the trial).

## 1. Two related capabilities

1. **CTWA attribution** — when a customer taps a Click-to-WhatsApp ad, Meta attaches a `referral`
   object to the first inbound webhook message. The reference app exposes this as a **chatbot trigger**
   (`send_condition: "meta_ads_ctwa"`, see [03-chatbot](03-chatbot.md)) so a bot can greet ad clickers.
2. **Meta Ads Lead Forms** (`/meta-adds`) — connect a Facebook page and ingest Instant-Form
   (`leadgen`) submissions as contacts, then fire automated WhatsApp messages.

## 2. Meta Ads page (`/meta-adds`)

- Buttons: **Connect Facebook**, **Refresh**.
- Table (post-connect): Facebook Page · Page ID · Lead Forms · Webhook Status · Actions, with a
  per-page **Subscribe** action that activates `leadgen` updates for that page.
- `GET /api/facebook/oauth-url` → the login URL; `GET /api/facebook/pages` → connected pages.

**Captured OAuth URL (exact):**
```
https://www.facebook.com/v25.0/dialog/oauth
  ?client_id=493719766697447
  &redirect_uri=https://app.example.com/meta-adds
  &scope=public_profile,pages_show_list,pages_read_engagement,pages_manage_metadata,
         pages_manage_ads,ads_management,leads_retrieval,business_management,
         pages_read_user_content,pages_messaging
  &response_type=code&state=<csrf>
```
The **scope set** is the implementation key: `leads_retrieval` + `pages_manage_metadata`
(subscribe page to webhooks) + `ads_management`/`pages_manage_ads` (CTWA/ad context) +
`pages_messaging`. Facebook Graph **v25.0**, app id `493719766697447` (the reference app's own app).

## 3. Flow (from product video + roadmap)

1. Connect Facebook → pick business portfolio → pick page(s).
2. `Subscribe` the page → `POST /{page_id}/subscribed_apps` with `subscribed_fields:["leadgen"]`.
3. On a `leadgen` webhook, fetch `GET /{leadgen_id}` with the page token, map `field_data` to a
   contact, and send a configured welcome template to open the 24h window.
4. Separately, CTWA: parse `messages[0].referral` (`source_id`, `source_type`, `source_url`,
   `headline`, `body`, `ctwa_clid`, media) on the first inbound message.

## 4. Mapping to this fork

- **CTWA (P0.4):** in the Cloud API webhook parser, read `messages[].referral`; persist to
  `conversations.ad_referral` (nullable jsonb) and expose a chatbot trigger `meta_ads_ctwa`. Render
  an attribution card in the inbox sidebar. Optional: Conversions API post on deal-won.
- **Lead Ads (P2.2):** new route `/api/saas/webhooks/meta-leadgen`; a Facebook-connect UI storing
  page tokens (encrypted with `ENCRYPTION_KEY`); sidecar `saas_meta_pages(account_id, page_id,
  page_name, access_token_enc, lead_forms jsonb, webhook_status)`.
- These are separate Meta surfaces from the WhatsApp WABA; keep page tokens isolated from WABA tokens.
