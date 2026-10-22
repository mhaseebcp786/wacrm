# 15 — Meta Embedded Signup & Coexistence

**Roadmap:** P2.1 · **the reference app route:** `/whatsapp-setup` · **wacrm gap:** manual `.env` token /
copy-paste onboarding; no in-app embedded signup or coexistence.

Reference only. Live trial setup page captured 2026-10-21 (`whatsapp-setup.json`). The trial org had
no number connected, so only the onboarding scaffold (not the Meta popup round-trip) was observable.

## 1. What it is

One-click "Connect WhatsApp": the user authenticates with Facebook in a popup, selects their
WhatsApp Business number, and (coexistence) scans a QR to use both the phone app and the web CRM at
once, with chat history synced.

## 2. Setup page (captured)

Header: *"Connect your number to Meta WhatsApp Business API."* A **Connect** action plus a 5-step
checklist shown to the user:
1. Prepare a verified Meta Business Manager account (admin access).
2. Gather business details (legal name, address, website, fresh phone number).
3. **Complete Embedded Signup** — "Click Connect; a Meta popup guides you through linking your WABA
   and phone."
4. Verify phone number (SMS/call code).
5. Done — WABA active.
Bilingual tutorial videos (EN/हिं) are embedded. Status polls the connection ("Checking status…").

## 3. Meta mechanism & mapping (from roadmap)

- Load the Facebook JS SDK; `FB.login` with `config_id` and
  `extras:{ featureType:"whatsapp_business_app_onboarding", sessionInfoVersion:"3" }`
  (Embedded Signup **v4**; v2/v3 deprecated 2026-10-15).
- Listen for `WA_EMBEDDED_SIGNUP` `postMessage` → capture `waba_id`, `phone_number_id`,
  `business_id`; exchange the OAuth `code` server-side for a long-lived token, encrypt with
  `ENCRYPTION_KEY`, register the number, subscribe the webhook (`POST /{waba_id}/subscribed_apps`).
- Coexistence: handle `smb_message_echoes` + `history` webhook events to mirror the owner's phone-app
  messages into the inbox.

Fork implementation (later): a Settings "Connect WhatsApp" flow + server action; store per-tenant
WABA credentials encrypted. This replaces the manual `.env` token path for onboarding tenants. Spec only.
