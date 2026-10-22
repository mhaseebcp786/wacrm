# 03 — Shared message object

**Status:** Library implemented (not live-tested against Meta). No UI, no database table, no route yet.
**Code:** `src/saas/lib/messages/` · **Spec:** [`specs/reference-app/01-suggested-replies.md`](../specs/reference-app/01-suggested-replies.md) §3

## What it is

One `{ message_type, payload }` object reused by Suggested Replies, Autoresponder, Chatbot and Flow
nodes (specs 01, 02, 03, 16). `payload` is a Meta Cloud API send body stored verbatim, minus
`messaging_product` and the recipient. This module is the single place that validates, personalises,
previews and sends it.

Nine types: `text`, `interactive` (reply buttons, CTA URL, list, WhatsApp Flow), `image`, `video`,
`audio`, `document`, `carousel`, `location`, `contact`.

## API (`@/saas/lib/messages`)

| Function                                       | Purpose                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validateMessageObject(input)`                 | Normalize + validate. Returns `{ ok, message }` or `{ ok:false, issues[] }`; never throws. Issues carry `{ path, code, params? }` (i18n codes, not English). |
| `validateMessageObjectForSave(input)`          | Same, plus the worst case where every `{{contact.*}}` token resolves to empty. **Use this when storing a reply.**                                            |
| `normalizeMessageObject(input)`                | Rewrites the reference app's `interactive`+`carousel` capture to `message_type: 'carousel'`.                                                                           |
| `personalizeMessage(msg, contact, opts?)`      | Substitutes `{{contact.name}}` / `{{contact.phone}}` in copy fields. Never touches ids, urls, links, flow ids. Returns a copy.                               |
| `buildSendBody(msg, to, { contextMessageId })` | Pure. Whitelists fields into the Cloud API body.                                                                                                             |
| `prepareMessage({ message, contact? })`        | normalize → validate → **always** personalize → re-validate. Throws `MessageValidationError`.                                                                |
| `sendMessageObject({ …, message, contact? })`  | prepare → build → POST. Throws `MessageValidationError` or `MetaApiError`.                                                                                   |
| `messagePreviewText(msg)`                      | One-line summary for list rows / inbox previews.                                                                                                             |

## Decisions

- **Canonical carousel form is `message_type: 'carousel'`** (matches `messages.content_type` and the
  existing `SAAS_MESSAGE_TYPES`). Both forms are accepted on input.
- **Carousel reuse:** the stored Meta shape is converted (`carousel-adapter.ts`) to the existing editor
  shape so `validateCarouselInteractivePayload` and `buildCarouselRequestBody` stay the single source of
  truth. The open Meta question (quick-reply card `type: "button"` vs `"cta_url"`) therefore stays
  decided in one place: we send `cta_url` on every card and accept both on input. Because the adapter
  flattens a card to one button, the validator rejects more than one quick-reply button per card, a
  non-image/video card header, and a top-level carousel header/footer instead of silently dropping them.
  The delegated carousel validator stops at its first failure, so a carousel adds at most one
  `carousel` issue (`params.reason`, 1-based `params.card`).
- **Aligned with the upstream codebase** (checked against `interactive.ts`, `meta-api.ts`,
  `send-message.ts`, the flows/automations interpolators):
  - Reply buttons: unique **ids** are enforced, unique titles are **not** (upstream does not either).
  - Links: media is checked with the shared `validateMediaUrl` (http allowed, as for template media);
    `cta_url` accepts http(s). Carousel cards keep the carousel module's own https rule.
  - Audio is sent as `{ link }` only, like upstream `sendMediaMessage`; the stored `voice` flag is
    validation metadata (voice needs OGG/OPUS), not a Cloud API field.
  - Tokens: same `{{ns.prop}}` grammar and "missing renders as empty string" behaviour as the
    automations/flows interpolators, which also never touch URLs or ids, so URLs are **not**
    personalized.
  - Preview text follows `send-message.ts`: body/caption text, else `[messageType]`; carousel = its
    body (as `carouselPayloadPreviewText`). No emoji, no English labels.
  - Persistence (future step) should mirror upstream: `content_text` = body/caption,
    `interactive_payload` = the structured payload, `content_type` = the message type.
- **Limits** come from `INTERACTIVE_LIMITS` / `CAROUSEL_LIMITS` / `media-specs.ts` plus `limits.ts`.
  Beyond spec 01 / upstream the validator enforces: unique list row ids (as upstream), row id ≤200 and
  button id ≤256 (as upstream comments), text-only list header, section titles required with more than
  one section (Meta rule, not enforced upstream), no emoji in the Flow button label (spec §3.2), basic
  audio limited to AAC/AMR/MP3/M4A/OGG and voice notes to OGG/OPUS (by extension, when recognisable),
  and a contact needs at least one phone or email. Two caps have no source and are fork guesses:
  document filename 240, location name/address 1000.
- **Personalization** replaces `{{contact.name}}`/`{{contact.phone}}` in copy only; it skips the keys
  `id`, `type`, `link`, `url`, `flow_id`, `flow_token`, `flow_action`, `flow_message_version`, `screen`,
  `wa_id` at any depth. `prepareMessage` **always** personalizes: with no contact, tokens become
  empty/fallback text rather than reaching the customer as literal `{{contact.name}}`.
- **Save-time vs send-time validation:** a reply valid with its tokens intact can fail after
  substitution (a button titled only `{{contact.name}}` for a contact with no name).
  `validateMessageObjectForSave` rejects that on save; callers must still handle
  `MessageValidationError` from `sendMessageObject`.
- **Defaults added at build time:** flow `flow_message_version: "3"`; contact `first_name` derived from
  `formatted_name` when no name part is given (Meta requires one). Empty-string optional fields are
  dropped. `preview_url` is NOT defaulted (spec: "on by default"; that default belongs to the composer,
  Meta's own default is off).
- **One Meta request helper:** upstream keeps `recipientFields` / error mapping / base URL private to
  `meta-api.ts` (99/1 rule: not touched). The fork now has a single copy,
  `src/saas/lib/whatsapp/meta-request.ts` (`postMetaMessage`, `recipientFields`), used by both
  `carousel-send.ts` (refactored to use it, behaviour unchanged) and the message object.
- **Free-form messages only deliver inside the 24h window.** Checking that is the caller's job.
- The barrel (`index.ts`) mixes the server-side sender with the pure validator; a client composer
  should import the individual modules, not the barrel.

## Database

- Migration `supabase/migrations/90002_saas_contact_message_type.sql` widens the `messages.content_type`
  CHECK to allow `'contact'` (the only message-object type not already allowed; must run after 90001).
  `ContentType` in `src/types/index.ts` gained `| 'contact'` (one line, like `'carousel'` before it).
  `supabase/ci/verify-schema.sql` asserts the constraint allows `contact`.
- Verified on a throwaway Postgres 16 container with stub tables: applies after 90001, re-runs cleanly,
  accepts `contact`/`carousel`/`interactive`, rejects unknown values, no-ops when the table is missing.
  NOT yet run through `supabase db reset` or against the real project.

## Not done (next steps from the specs)

- ~~`saas_quick_replies` table, `/api/saas/quick-replies`, inbox picker, composer UI with live preview,
  `MessageIssueCode` translations~~ — done, see [04 — Suggested replies](./04-suggested-replies.md).
- Inbox bubble renderers for link-button, location and contact messages (they show as plain text).
- Autoresponder / chatbot (specs 02, 03) calling `sendMessageObject` from the inbound webhook.
- Media-picker "File Manager" and Catalog message types (spec 01 §3.10).
- Flow-button sends have not been sent to Meta for real (audio voice notes rely on Meta inferring them from OGG/OPUS, as upstream does).
- Open: should `cta_url` URLs support personalization (with URL-encoding)? Upstream interpolators do not.
