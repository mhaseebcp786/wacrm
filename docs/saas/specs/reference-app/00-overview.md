# Reference-app feature specs — overview & index

**Status:** Reverse-engineering reference only. **No implementation is described or authorised here.**
These documents describe how the reference app (`app.example.com`) implements the features that
`docs/wacrm_competitive_gap_and_roadmap.md` lists as gaps in this fork. They exist so that
implementation work (done later, separately) starts from observed behaviour rather than guesswork.

**Captured:** 2026-10-21, against a live reference-app 15-day trial (brand `wacrm-research-test`,
org id `2465`, plan `Trial`, expires 2026-11-05). Evidence = real request/response bodies and
UI structure observed in the logged-in app, plus the official product walkthrough video
(`3jBQfAYJzDA`, English, 46:18) and Meta's WhatsApp Cloud API documentation.

## How this was captured

- The trial app is a React SPA talking to a Laravel-style JSON backend under `https://app.example.com/api/*`.
- UI was driven with Playwright over Chrome DevTools Protocol; every non-GET request body and the
  JSON responses were recorded. Raw captures live in the session scratchpad under `live/spec/`
  (`spec_*.json`, `qr_posts*.json`) and screenshots `live/spec/*.png`.
- Test artifacts were created in the trial account (prefixed `spec_*`). They can be deleted; see
  the cleanup note at the end of this file.

## The single most important finding: one shared "message object"

The reference app has **one** message-composer component reused across Suggested Replies, Autoresponder,
Chatbot, and (as nodes) Flow Builder. It always emits the **same JSON shape**, which is
essentially a Meta Cloud API *message* object stored verbatim:

```jsonc
{ "message_type": "text|interactive|image|video|audio|document|carousel|location|contact",
  "payload": { "type": "...", "<type>": { ... } } }       // payload == Meta send body (minus "to")
```

This is the architectural keystone. Any implementation in this fork should build the **message
object** once (a `saas_message_payload` builder + validator + renderer) and reuse it everywhere,
exactly as the reference app does. The nine message types and their exact payloads are documented in
[`01-suggested-replies.md`](01-suggested-replies.md); every other feature references them.

This fork already has the carousel half of this (`src/saas/lib/whatsapp/carousel-send.ts`,
`carousel-interactive.ts`). The gap is the other eight types and the shared composer UI.

## Feature index

| # | Spec file | Roadmap item | the reference app route(s) | wacrm gap |
|---|-----------|--------------|------------------|-----------|
| 01 | [suggested-replies](01-suggested-replies.md) | P0.2 | `/quick-replies` | Rich canned replies (9 types) |
| 02 | [autoresponder](02-autoresponder.md) | P0.2 | `/autoresponder` | Auto-sender (first-msg / inactivity) |
| 03 | [chatbot](03-chatbot.md) | P0.2 / P1 | `/chatbot` | Keyword/event auto-replies |
| 04 | [link-qr](04-link-qr.md) | P0.3 | `/link-qr` | Trackable chat links + QR, auto-tag |
| 05 | [ctwa-and-meta-ads](05-ctwa-and-meta-ads.md) | P0.4 / P2.2 | `/meta-adds`, chatbot CTWA trigger | CTWA attribution + lead-ad ingest |
| 06 | [ai-agent](06-ai-agent.md) | P0.5 | `/ai-agents` | Multi-provider AI agent, hours, handoff |
| 07 | [forms-flows](07-forms-flows.md) | P1.1 | `/forms` | Native WhatsApp Flows (multi-screen forms) |
| 08 | [drip-campaigns](08-drip-campaigns.md) | P1.2 | `/drip-campaigns` | Drip sequences |
| 09 | [reminders](09-reminders.md) | P1.2 | `/reminders` | Date/recurring template reminders |
| 10 | [agent-routing](10-agent-routing.md) | P1.3 | `/agents` | Auto-assign, routing methods, RBAC |
| 11 | [campaigns-broadcast](11-campaigns-broadcast.md) | P1.4 | `/campaigns` | Wizard, cost reserve, delivery funnel |
| 12 | [integrations](12-integrations.md) | P3.1 | `/integrations` | Shopify/Woo/Sheets/Zoho/LeadSquared |
| 13 | [whatsapp-payments](13-whatsapp-payments.md) | P3.1 | `/whatsapp-payments` | In-chat UPI payments |
| 14 | [whitelabel-billing-wallet](14-whitelabel-billing-wallet.md) | P3.2 | `/billing/*`, `/whitelabel-setup` | Plans, prepaid wallet, white-label |
| 15 | [embedded-signup](15-embedded-signup.md) | P2.1 | `/whatsapp-setup` | Meta Embedded Signup / coexistence |
| 16 | [flow-builder](16-flow-builder.md) | (bonus) | `/flow-builder` | Visual conversation flows |

## Full navigation inventory (sidebar, trial account)

`/home` · `/whatsapp-setup` · `/whatsapp-details` · `/billing/subscription` · `/billing/wallet`
· `/tutorial` · `/chat` (Inbox) · `/history` · `/quick-send` (Single Send) · `/templates`
· `/contacts` · `/contacts/groups` · `/contacts/import` · `/contacts/fields` · `/campaigns`
· `/label` · `/link-qr` · `/quick-replies` (Suggested Replies) · `/autoresponder` · `/chatbot`
· `/flow-builder` · `/drip-campaigns` · `/reminders` · `/ai-agents` · `/forms` · `/meta-adds`
· `/agents` · `/apidocs` · `/integrations` · `/whatsapp-payments` · `/whitelabel-setup`
· `/whitelabel-users` · `/settings` · `/file-manager`

## Cross-cutting observations

- **File Manager is the media backbone.** Every media picker (`Browse`/`Select`) reads from one
  org-scoped library (`/api/files`, storage path `storage/orgs/<org_id>/<uuid>-<name>`). Media is
  uploaded once and referenced by **URL** in message payloads (`image.link`, `header.image.link`).
  This fork already mirrors this idea for templates; the composer types should reuse it.
- **Per-type Meta limits are enforced in the UI** and surfaced as helper text (e.g. image ≤5 MB,
  video ≤16 MB, document ≤100 MB, card body ≤160, interactive body ≤1024, button label ≤20,
  list row title ≤24 / description ≤72, footer ≤60). Each spec records the exact numbers seen.
- **Trial gating.** Some surfaces require a paid plan or a connected WABA and were therefore only
  partially observable on the trial: `/link-qr` (needs a phone number), `/whitelabel-setup`
  (redirects to `/home`, "Upgrade Plan"), `/billing/wallet` recharge (paid only). Those limits are
  noted in the relevant spec.
- **Settings → Webhook / Opt-in-out / API keys / AI providers** (`/settings`) are relevant to
  several features; captured in the feature specs that use them.

## Cleanup

Test artifacts left in the trial account by this research: Suggested Replies `spec_text`,
`spec_reply_buttons`, `spec_cta`, `spec_list`, `spec_image`, `spec_carousel_url`,
`spec_carousel_qr`; Autoresponders `spec_ar_welcome`, `spec_ar_resend`; Chatbots `spec_cb_ctwa`,
`spec_cb_first`; plus the earlier template drafts and 7 uploaded sample files. All can be deleted
from the reference app UI; none affect this repo.
