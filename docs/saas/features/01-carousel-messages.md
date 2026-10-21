# Feature 01 — Carousel (templates + interactive messages)

**Status:** ✅ Implemented (reworked 2026-10-21 to match LeminAi behaviour and Meta's schema)
**Branch:** `saas-main`

> [!WARNING]
> Verified by unit/service tests, typecheck, lint and `next build` only. **No live WhatsApp
> send has been made.** Two Meta details remain unproven: quick-reply interactive cards use
> `type: "cta_url"` (matches Meta's current doc, differs from LeminAi's `"button"`), and
> carousel-template cards are sent with a media `link` (Meta's doc example uses a media `id`;
> LeminAi's own published API example also sends `link`, so it is the common production choice).
> Smoke-test one send of each before relying on it.

---

## What it does

### A. Carousel **templates** (Settings → Templates → header "Carousel")
- Marketing category only (forced in the UI and enforced server-side).
- Template body (required — Meta requires it) + 2–10 cards.
- Each card: Image **or** Video (all cards the same type), media (upload or pasted https URL),
  optional body ≤ 160 chars (all cards or none), variables with per-card example values,
  up to 2 buttons: Quick Reply / URL (https, optional `{{1}}` suffix with example) / Call.
  Button text ≤ 25 chars. Every card must have the same button layout (count + types, in order).
- Live preview: one card at a time, arrows + dots.
- Submit → media uploaded to Meta as resumable-upload **handles** (Meta rejects plain URLs at
  creation) → `CAROUSEL` component → saved with `header_type='carousel'` and `carousel_cards`.
- Edit/resubmit of approved/rejected/paused carousel templates; "Sync from Meta" recognises
  carousel templates (sample media URLs are kept from the local row when it exists).

### B. Sending a carousel **template**
- Inbox and Contact detail template picker, and the Broadcast wizard (step 3): per-card media
  (prefilled from the template's sample, replaceable), per-card body variables, URL-button
  variables. Sent as `{type:"carousel", cards:[{card_index, components:[header, body?, buttons…]}]}`.
- The server **never** substitutes the template's example text for a missing variable — it fails
  with a specific error.

### C. Interactive carousel **message** (Inbox composer, 24-hour window)
- Composer button → dialog (message body, 2–10 cards, image/video, CTA-URL or Quick-reply
  buttons, label ≤ 20 chars) → `interactive.type="carousel"` (schema per Meta's current doc).
- Rendered in the thread as body bubble + one-card-at-a-time preview.

## Known limitations
- **Scheduled / resumed broadcasts and the public `/api/v1/broadcasts` API** do not carry
  per-card values (upstream `broadcast-core.ts` only forwards body params). A carousel template
  there works only if every card has stored sample media and no variables; otherwise each
  recipient fails with a clear error.
- **Automations** cannot send carousel templates (upstream `meta-send.ts` has no template row);
  the automation builder hides them. Flows have no template picker.
- Broadcast per-card media/variables are shared by all recipients.
- Catalog "product carousel" templates are not modelled (sync leaves them as upstream did).
- Server validation messages are English (UI messages are translated).
- Card uploads are not deleted when a dialog is cancelled.

## Our files
| Area | Files |
|---|---|
| Template validation / Meta payload | `src/saas/lib/whatsapp/carousel-template.ts` |
| Create/edit service + routes | `src/saas/lib/templates/carousel-template-service.ts`, `src/app/api/saas/templates/carousel/{route.ts,[id]/route.ts}` |
| Sync | `src/saas/lib/whatsapp/carousel-template-sync.ts` |
| Template send components | `src/saas/lib/whatsapp/carousel-template-send.ts` |
| Interactive message | `carousel-interactive.ts`, `carousel-send.ts`, `send-message-extensions.ts` |
| UI | `carousel-card-editor.tsx`, `template-manager-carousel.tsx`, `template-carousel-send-form.tsx`, `broadcast-carousel-section.tsx`, `carousel-interactive-editor.tsx`, `carousel-composer-button.tsx`, `carousel-bubble.tsx`, `carousel-preview.tsx`, `carousel-template-badge.tsx` |
| Form helpers / media rules | `template-form-carousel.ts`, `media-specs.ts`, `carousel-media.ts`, `broadcast-carousel-store.ts` |
| DB | `supabase/migrations/90001_saas_carousel_messages.sql`; CI assertions in `supabase/ci/verify-schema.sql` (marked SaaS section) |
| i18n | `SaasCarousel` and `SaasTemplates` namespaces in `messages/{en,es,ko,pt}.json` |

## Upstream files touched (hooks)
`template-send-builder.ts` (carousel branch + document `filename`), `meta-api.ts` (+1 line),
`templates/sync/route.ts` (+3), `template-manager.tsx` (one-line hooks into
`template-manager-carousel.tsx`), `message-thread.tsx`, `message-composer.tsx`,
`message-bubble.tsx` (`case 'carousel'`), `step3-personalize.tsx`, `use-broadcast-sending.ts`,
`contact-detail-view.tsx` (picker swap), `automation-builder.tsx` (filter),
`types/index.ts` (`'carousel'` in `ContentType`), `template-send-builder.test.ts` (filename
expectation).

## Upstream sync guidance
Search upstream for `carousel`, `CAROUSEL`, `interactive-carousel`. If upstream ships equivalent
support, prefer theirs: remove the files above and revert the hook lines. A future upstream
migration that re-creates `messages_content_type_check` or `message_templates_header_type_check`
would drop `carousel` — CI (`verify-schema.sql`) now fails if that happens; re-assert with a new
`9000N` migration.

## Behaviour vs LeminAi (reverse-engineered from its public client bundle)
Matches: 2–10 cards, ≤ 2 buttons/card, 160-char card body, Marketing-only, Image/Video per
card, Quick Reply/URL/Call buttons, add-at-end/remove-when->2, arrow+dot preview, per-card media
and variables at send time, per-card real media type (LeminAi's campaign flow validates every
card as an image — a bug we did not copy). Differs deliberately: Meta-required body and card
consistency are enforced client- and server-side; media can also be pasted as an https URL.

### Confirmed from LeminAi's official YouTube demo (frames + transcript, 2026-10-21)
Free-form (24-hour window) carousels are authored in **Suggested Replies → Message Type**
(Text, Interactive, Image, Video, Audio, Document, **Carousel**, Location, Contact, Catalog) and
sent from the inbox/chatbots/autoresponders ("carousel in service messages" is a marketed
differentiator). The carousel form has: *Message Body* ("shown above the carousel cards",
max 1024), a message-level *Card Button Type* toggle (URL Button | Quick Reply — "all cards must
use the same button type"), card tabs "Card 1 | Card 2 | + Add" with a "2/10 cards" counter, and
per card an Image|Video toggle, file chooser, optional card body (max 160) and button label
(max 20) + URL. Document messages take a file + optional filename + caption (max 1024).
Our Inbox composer button covers the same fields; **not built:** saving a carousel as a
reusable Suggested Reply / using it in autoresponders and chatbots.

### Confirmed from LeminAi's in-app API docs (trial account, 2026-10-21)
- Template **send** with a carousel: `components` = body params + `{type:"carousel", cards:[{card_index,
  components:[header{image|video link}, body params, button sub_type url index 0 …]}]}` — identical
  in shape to `carousel-template-send.ts`.
- Template **create**: `headerType:"carousel"` + `carouselItems[{type, media_url, bodyText, buttons}]`
  (max 10); public media URLs are downloaded and re-uploaded to Meta server-side (same as our
  `ensureCardHandles`); duplicate name+language → HTTP 409 `duplicate_template`; unreachable media →
  HTTP 422 `media_upload_failed`. Video is MP4 ≤ 16 MB, image JPEG/PNG.
- LeminAi's API-sent **service messages** support text/image/video/audio/document and interactive
  *list* only — no carousel — even though its dashboard composer can send carousels.

### Confirmed live on a LeminAi trial account (drafts only, no WhatsApp number, 2026-10-21)
Created three **draft** templates through their real UI (Save Template, not Submit) using Invicto
Associates LLP product media, and captured `POST /api/templates` → 201 `{"message":"Template saved as draft."}`:
- **Carousel** (2 image cards, URL buttons, top body with a variable): the backend built
  `[BODY(+example), CAROUSEL{cards:[{components:[HEADER{format:IMAGE,example.header_handle}, BODY, BUTTONS]}]}]`
  — the same component structure as `buildMetaCarouselTemplatePayload` (no footer / top-level buttons).
- **Video header** → `HEADER{format:VIDEO}`; **PDF header** → `HEADER{format:DOCUMENT}` (their "PDF" option).
- Media is chosen from their File Manager (image/video/document-filtered picker) and referenced by
  `media_files` id + public URL; the Meta upload handle is only created at *Submit for Review*.
- The live builder keeps a Footer field visible for carousels and treats the body as optional;
  we deliberately hide the footer and require the body (Meta requirement).
Send, submit and approval were NOT exercised (needs a connected WhatsApp number).
