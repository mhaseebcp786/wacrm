# Feature 01 — Carousel Interactive Messages

**Status:** ✅ Implemented  
**Branch:** `saas-main`  
**Implemented:** 2026-10-16

---

## What it does

Allows agents to send WhatsApp **interactive carousel messages** from the Inbox, and allows admins to create **carousel templates** in Settings → Templates.

A carousel message contains 2–10 cards, each with:
- An image or video header
- A body text (≤ 160 chars)
- One button (CTA URL or Quick Reply — must be homogeneous across all cards)

This maps directly to Meta's [Interactive Carousel Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-carousel-messages) API.

---

## Meta API used

- **Interactive message type:** `POST /{phone-number-id}/messages` with `type: "interactive"`, `interactive.type: "carousel"`
- **Template type:** `POST /message_templates` with `components[].type: "CAROUSEL"`
- API version: `v21.0`

---

## Our implementation files

### SaaS-owned (never touch upstream)
| File | Purpose |
|------|---------|
| `src/saas/lib/whatsapp/carousel-interactive.ts` | Types (`CarouselInteractivePayload`, `CarouselCard`, etc.), validator, blank payload factory |
| `src/saas/lib/whatsapp/carousel-send.ts` | Meta API caller — builds & POSTs the carousel interactive payload |
| `src/saas/lib/whatsapp/carousel-template.ts` | Template payload builder for WABA template API |
| `src/saas/lib/whatsapp/send-message-extensions.ts` | Thin hooks: `validateSaasMessageType`, `dispatchSaasMessage` — called by upstream send-message.ts |
| `src/saas/lib/whatsapp/template-format-extension.ts` | `SaasHeaderFormat` type + `SAAS_HEADER_FORMATS` array (adds `'carousel'` to upstream's type) |
| `src/saas/components/carousel-card-editor.tsx` | Template carousel card editor (used in Settings → Templates) |
| `src/saas/components/carousel-interactive-editor.tsx` | Free-form carousel editor (used in Inbox) |
| `supabase/migrations/90001_saas_carousel_messages.sql` | Adds `carousel_cards JSONB` column to `message_templates`; widens CHECK constraints |

### Upstream files touched (minimal hooks only)
| File | Change | Lines added |
|------|--------|-------------|
| `src/lib/whatsapp/send-message.ts` | 1 import + `...SAAS_MESSAGE_TYPES` spread + 2-line validate hook + 2-line dispatch hook + 2 inline `\|\| 'carousel'` tweaks | +6 new lines |
| `src/components/settings/template-manager.tsx` | 2 imports + 4-line `carousel_cards` payload block + 2-line ternary label extension + 3-line slot inject | +9 new lines |
| `messages/en.json` etc. | New i18n keys under `Settings.templates` and `Interactive` | +20 keys |

### Test files
| File | Tests |
|------|-------|
| `src/saas/lib/whatsapp/carousel-interactive.test.ts` | 8 tests — validator, blank payload |
| `src/saas/lib/whatsapp/carousel-template.test.ts` | 7 tests — template payload builder |
| `src/saas/lib/whatsapp/carousel-send.test.ts` | 5 tests — Meta API caller (fetch mocked) |

---

## Upstream sync comparison guidance

**Search upstream for:** `carousel`, `CAROUSEL`, `interactive-carousel`

**If upstream adds carousel support:**
1. Compare their `validateCarouselInteractivePayload` with ours — if it covers the same rules (2–10 cards, homogeneous buttons, HTTPS URLs), prefer theirs.
2. Compare their DB migration — if they add `carousel_cards` column, check for collision with our `90001` migration.
3. Compare their UI (`template-manager.tsx` changes) — if they extend `HEADER_FORMATS` natively, we can remove our `template-format-extension.ts` and both imports from `template-manager.tsx`.
4. Compare their send pipeline — if they add `'carousel'` to `VALID_MESSAGE_TYPES` and dispatch natively, we can remove `send-message-extensions.ts` and its import.

**Decision rule:** If upstream carousel is functionally equivalent or better → remove `src/saas/lib/whatsapp/carousel-*.ts`, `send-message-extensions.ts`, `template-format-extension.ts`, and both saas UI components, then revert the upstream hook lines. Update this doc status to `Merged → Upstream`.

---

## Key constraints

- Carousel cards support **image or video headers only** — documents/PDFs are NOT supported by Meta for carousel cards.
- All cards in a carousel must use the **same button type** (homogeneous).
- Minimum 2 cards, maximum 10 cards.
