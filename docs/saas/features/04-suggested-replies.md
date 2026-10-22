# 04 — Suggested replies (rich quick replies)

**Status:** Implemented. Unit-tested; migration and constraints verified on a real local Postgres; the
token-insert behaviour verified in a real browser. **Not** sent to real Meta (see _Verification_).
**Spec:** [`specs/reference-app/01-suggested-replies.md`](../specs/reference-app/01-suggested-replies.md)
**Builds on:** [03 — Shared message object](./03-message-object.md)

## What changed

Upstream quick replies (`quick_replies`, migration 035) only stored plain text or a reply-button/list
message. A suggested reply is now a **name + a shared message object**, so it can be any of: text,
interactive (reply buttons, list, **link button**), image, video, audio, document, carousel, location,
contact. Replies can be searched, switched off, previewed while editing, and sent in one click.

Existing replies are not migrated. The list merges both tables; a reply created in the composer's
"Save as quick reply" (upstream path) still shows up. Editing an upstream row in the new editor
**moves** it to `saas_quick_replies` (insert first, delete second; the insert is rolled back if the
delete fails or removes nothing, i.e. a concurrent request already moved the row), keeping its position
in the list. A move triggered by a rename or a switch-off carries the old content over **without
re-validating it** (it predates this fork's stricter checks); it is validated when it is sent. Titles
longer than 100 characters are cut to 100.

### In the editor

- **Insert name / phone into any text field.** One bar above the form inserts `{{contact.name}}` or
  `{{contact.phone}}` at the caret of the last text field you were in, including fields drawn by the
  shared interactive builder and the carousel editor. Link, number and email fields are never targets,
  and a token that does not fit a field's `maxLength` is refused with a message instead of truncated.
- **Media header** (image, video or document) on reply buttons and on a link button; a text header
  on either; lists take a text header only (Meta).
- **Contacts**: several cards per message (up to 10 in the editor), each with name parts, company,
  department, job title, birthday, any number of phones / emails / websites, a type label per row, and a
  per-number **"On WhatsApp"** switch (see below). **Add from contacts** searches the CRM and fills a
  card, with the number marked as on WhatsApp. Fields the editor has no input for (addresses, middle name,
  prefix, suffix) are kept untouched when a stored card is edited and saved.
- Coordinates accept a decimal comma (`12,97`).

### In the inbox

- A sent **link button**, **reply buttons with a media header** (`rich_interactive`) and **contact**
  message is drawn from its stored payload (header, body, footer, the URL button as a real link that
  opens in a new tab, contact cards) instead of plain text. A message with no stored payload (sent through
  the public API) falls back to its text.
- A sent **location** keeps the upstream bubble (pin + name/address).

## Where things live

| Piece                                   | Path                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Table + `rich_interactive` content type | `supabase/migrations/90003_saas_quick_replies.sql` (+ assertions in `supabase/ci/verify-schema.sql`) |
| Types, upstream⇄message-object mapping  | `src/saas/lib/quick-replies/{types,legacy,items}.ts`                                                 |
| Save-time validation                    | `validate.ts` (shared validator + Flow rejection + no tokens in links)                               |
| Persistence                             | `service.ts` (list / create / update / delete, both tables)                                          |
| Sending                                 | `send.ts`, `send-params.ts` → upstream `sendMessageToConversation`                                   |
| Editor ⇄ message object                 | `editor-state.ts` (pure, client-safe), `insert-token.ts`                                             |
| API                                     | `src/app/api/saas/quick-replies/` (`GET/POST`, `[id]` `PATCH/DELETE`, `[id]/send` `POST`)            |
| UI                                      | `src/saas/components/quick-replies/` (manager, editor, contact editor, picker, preview, token bar)   |
| Inbox drawing of stored payloads        | `src/saas/components/payload-bubbles.tsx`                                                            |
| Copy                                    | `SaasQuickReplies` namespace and `Api.saasQuickReplies` in all four catalogs                         |

### Upstream files touched (the 99/1 rule)

- `src/components/inbox/message-composer.tsx` — one import line, and the picker tag now renders
  `SaasQuickReplyPicker` with three extra props (`conversationId`, `replyToId`, `onSent`): about
  four changed lines, slightly over the "1–3 line hook" guideline because a JSX element cannot take props
  from a wrapper without changing its call site.
- `src/components/inbox/message-bubble.tsx` — one import line and a 3-line `case` that hands
  `rich_interactive` and `contact` messages to `SaasPayloadBubble`.
- `src/lib/whatsapp/send-message.ts` — the existing extension import gains `storesSaasPayload`, and the
  `interactive_payload` column condition gains `|| storesSaasPayload(messageType)` so the send core
  stores the payload for the fork's structured types (2 lines).
- `src/app/(dashboard)/settings/page.tsx` — the manager import points at the fork's manager.
- `src/types/index.ts` — `ContentType` gains `'rich_interactive'`.
- `messages/*.json` — additions only (new `SaasQuickReplies` namespace, `Api.saasQuickReplies`).

The upstream picker, manager and `/api/quick-replies` routes are left in place, unused by the UI.

## How a send works

`POST /api/saas/quick-replies/[id]/send { conversation_id, reply_to_message_id? }` (agent role, same
rate-limit bucket as `/api/whatsapp/send`):

1. Load the reply (either table), reject if switched off.
2. Fill `{{contact.name}}` / `{{contact.phone}}` from the conversation's contact (`prepareMessage`).
   Tokens in copy fields are always resolved, so a literal `{{…}}` does not reach a customer through a
   saved reply. Link fields (`url`, `link`) are never personalized, so a token there is **rejected on
   save**; the list endpoint with a conversation always returns a resolved copy (an unreadable contact
   resolves tokens to empty text) and the picker offers only items that have one.
3. Map to `sendMessageToConversation` params (`messageToSendParams`). Text, media, reply buttons and
   lists with a text header, and carousels use the core's native paths. Everything else uses the fork's
   extension types in `send-message-extensions.ts`, which carry the Meta payload in the core's
   `interactivePayload` slot and send it through `sendMessageObject`:
   `location`, `contact`, and `rich_interactive` (a URL button, or reply buttons with a media header).
   The core persists the row (with the payload), updates the conversation preview and pauses active Flow
   runs, exactly as for any agent message. Coordinates go out as strings, as Meta documents them.

In the inbox, text and reply-button/list replies with a text header keep the old behaviour (text fills the
composer, buttons/list open the builder pre-filled) but with tokens already resolved server-side
(`GET …?conversation_id=` returns `resolved`). Every other type shows a preview with a Send button.

## Decisions and limits

- **WhatsApp Flow buttons** are rejected on save (`unsupported` issue): they need native Flow forms
  (spec 07). The reference app's shared **File Manager** library and **catalog / product** types
  (spec §3.10) are separate features and postponed. Media is a URL or an upload to the existing
  `chat-media` bucket.
- **Link previews are not enabled.** Meta (text-messages doc): when `preview_url` is omitted no link
  preview is shown, and only the first URL is previewed when it is `true`. The upstream text sender
  never sets it, and a picked text reply is sent by the composer like typed text, so suggested replies
  inherit that. Turning previews on is a global behaviour change for every text the CRM sends, so it is
  left as a product decision (it would be a fork-owned change in `dispatchSaasMessage`, no upstream edit).
- **Contact buttons depend on `wa_id`.** Meta shows **Message / Save contact** only when a phone entry
  carries a `wa_id`; otherwise the recipient sees **Invite to WhatsApp**. The "On WhatsApp" switch
  controls this (default on; CRM contacts are marked on). The `wa_id` is the number's digits **with its
  country code**, so a typed number only gets one when it starts with `+` (a local `0300…` would yield
  a wrong ID; the editor shows a warning and the recipient then sees Invite to WhatsApp). A card loaded
  from a stored message keeps its stored `wa_id` exactly until its number text is edited. Birthday must
  be `YYYY-MM-DD` and websites http(s); each card needs a phone or an email (stricter than Meta, which
  only requires the display name; a card with no way to reach the person is not useful). A card with no
  display name gets "First Last", and a loaded card whose name is just "First Last" keeps following
  the name parts when they are edited.
- **Coordinates** are stored as numbers and sent as strings. A decimal string (`"12.97"`, as in Meta's
  examples) is accepted on input, with a comma in the editor; `0x10`, `1e3` and other non-decimals are not.
- **Tokens are rejected in links and ids** (`url`, `link`, `id` are never personalized). The insert
  buttons skip numeric/link inputs and fields outside the form (such as the "From contacts" dialog).
- **Address entry** has no editor input (stored addresses are preserved but cannot be added in the UI);
  Meta notes recipients may not show addresses, birthdays or emails on primary devices.
- **Audio voice-note flag** is not exposed: Meta decides from OGG/OPUS, as upstream does.
- **http image links** are accepted when sending but not drawn in previews (the app's CSP allows
  `img-src https:`); a placeholder is shown.
- **The `+` insert buttons act on the last-focused text field**, so a field must have been clicked into
  first (otherwise the first text area is used, or a hint is shown).
- **Public API:** `/api/v1/messages` shares the same validator and forwards `type` and
  `interactive_payload` to the same send core, so it also accepts `location`, `contact` and
  `rich_interactive` (as it already did for `carousel` and `interactive`). The endpoint's own document,
  `docs/public-api.md`, is an upstream file and lists only text / template / media, so the fork's
  additions are described here instead (AGENTS.md keeps fork docs under `docs/saas/`):
  send `{ "to": "+14155550123", "type": "location", "interactive_payload": { "type": "location",
"location": { "latitude": 12.9716, "longitude": 77.5946, "name": "Head office" } } }`; the
  `interactive_payload` is a Cloud API message body without `to` and is validated with the limits above
  (a bad one is `400 bad_request` before anything is sent). `text` is optional and only used for the
  conversation preview, which otherwise shows `[type]`.
- **Migrations keep upstream's content types.** 90001–90003 rebuild `messages_content_type_check` as the
  union of the values it currently allows, their own value and a fixed floor, instead of a hard-coded list,
  so a value a future upstream migration adds (numbered before 90001) is not dropped on `db reset`.
  A local stack that already applied an earlier draft of 90003 needs a `supabase db reset`.
- A legacy list with several untitled sections fails the stricter shared validator (Meta requires
  section titles when there is more than one). Such a row is still listed, can still be switched off or
  renamed, and opens in the interactive builder from the picker; the validator error appears when it is
  edited and saved in the new editor.
- `GET /api/saas/quick-replies` returns the list for the whole account to any member (RLS), like
  upstream; writes need the agent role.
- Free-form messages only deliver inside the 24h window. The composer already disables the `+` menu
  outside it; the send route does not re-check (Meta rejects and the error is surfaced), like
  `/api/whatsapp/send`.

## Verification

Done:

- **Real Postgres** (Supabase CLI local stack, exactly CI's `db start` / `db reset --local --no-seed` /
  `db query --file supabase/ci/verify-schema.sql`): all migrations through 90003 apply and the schema
  assertions pass. Direct SQL confirmed the name / type / JSON-object / foreign-key constraints reject
  bad rows, `DELETE … RETURNING` is account-scoped, the `updated_at` trigger fires, RLS is on with the
  four policies, `messages.content_type` accepts `rich_interactive`, and deleting an account cascades.
- **Real browser** (Chromium via Playwright, a harness around the real `insert-token.ts` with
  React-controlled fields): the token is inserted at the caret or over a selection, React state follows,
  focus and caret are kept, typing afterwards keeps it, an over-long insert is refused, and URL fields
  are ignored.
- **Migration safety:** re-running each of 90001–90003 a second time is a no-op, and a temporary
  upstream-style migration numbered 047 that added a new content type (`sticker`) kept it through 90003
  (the temporary file was removed afterwards).
- **Meta's published rules** (contacts, CTA URL, text, location message docs) were read and the payloads
  and limits checked against them; see the decisions above for what changed because of it.
- Unit and render tests (`renderToStaticMarkup`, the repo's existing style) cover the library, service,
  all five route handlers, the send core end to end for location / contact / link button / text against an in-memory
  database, every editor tab, every preview type, and the inbox bubbles including malformed payloads and
  unsafe links.

Not done:

- No message was sent to real Meta, so Meta's own acceptance of the new payloads (for example a
  `wa_id` on every phone, string coordinates) is read from its docs, not observed.
- The full UI was not exercised in a browser against the app (it needs a logged-in session on the real
  Supabase project); only the token insertion was, in isolation. Effects-driven components (the inbox
  picker, the manager, the CRM contact picker) and the DOM glue of `insertTokenIntoField` have no
  in-repo test, because the repo has no DOM test environment (no jsdom); their pure logic is covered.
- PostgREST's embedded `contact:contacts(name, phone)` select is the same syntax upstream's send core
  already uses, but it was not run against a live PostgREST here (the local stack was started DB-only).
