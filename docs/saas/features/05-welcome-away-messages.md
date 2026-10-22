# 05 — Welcome & Away Messages (the autoresponder)

**Status:** Implemented. Unit-tested, reviewed by an independent critic pass (its findings are addressed below), and
exercised end to end on a local Supabase stack with a real browser and a fake Meta server (see _Verification_).
**Not** sent to real WhatsApp.
**Spec:** [`specs/reference-app/02-autoresponder.md`](../specs/reference-app/02-autoresponder.md)
**Builds on:** [03 — Shared message object](./03-message-object.md), [04 — Suggested replies](./04-suggested-replies.md)
(the message editor and validator are reused as they are).

## What it is

A message WhatsApp sends **by itself** when a customer writes to you, with no agent involved: a welcome message, an
after-hours note, a "welcome back". It lives in **Settings → Welcome & away**.

The reference app calls this feature "Autoresponder". It is named differently here on purpose, so nobody confuses it
with the other automatic things in wacrm:

| Feature                               | What it does                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| **Welcome & away messages** (this)    | Sends one fixed message on a first message, on a return, or once every few days. |
| **Automations** (≈ reference chatbot) | Keyword replies and multi-step rules that tag, assign, wait, create deals…       |
| **Flows**                             | A guided menu conversation the customer taps through.                            |
| **AI auto-reply**                     | An AI answers questions from your business information.                          |

The panel's description says this in one sentence and points to Automations for keyword or multi-step rules.

## Examples (a shop called Sunrise Furniture)

- **Welcome.** Rule "Welcome": _On a customer's first message_, no schedule. A brand-new customer gets "Hi Ada, welcome
  to Sunrise Furniture!" once.
- **After-hours note.** Rule "Away": _Once every few days_ (3 days), limited to **every day 18:00 → 09:00** in
  Asia/Kolkata (all seven days ticked: the early-morning half of a night belongs to the day it started on, so Monday
  00:00–09:00 needs **Sunday** ticked). Anyone writing at 11 pm is told "We're closed, back at 9", **including a regular
  customer who wrote at 5:50 pm**. The same customer is not told again for 3 days.
- **Weekend note.** Another rule "Weekend": _Once every few days_, days Sat + Sun, 00:00 → 23:59. When both match, the
  one created first answers.
- **Welcome back.** _Welcome back after a quiet spell_ (30 days) with a photo-card carousel: sent on a customer's first
  message and again when someone who went quiet for a month returns. A customer who chats every day never gets it.

## The three "when" choices

| Choice (stored as)                                               | Sent when…                                                                | Good for                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| **On a customer's first message** (`first_message`)              | the customer has never written before; once, ever                         | a welcome                  |
| **Welcome back after a quiet spell** (`after_inactivity`, N)     | first message, and again when they write after **N days without writing** | "welcome back"             |
| **Once every few days, whenever they write** (`every_n_days`, N) | they write and **this rule has not answered them in the last N days**     | an away / after-hours note |

N is 1–90. The difference between the last two is what is measured: silence of the customer (welcome back) or time
since this rule last sent (away note). That is why an away note reaches a customer who wrote an hour ago and a welcome
back does not.

## How a rule works

A rule is a **name**, a **message** (any of the nine shared message types, built in the same editor as suggested replies,
with `{{contact.name}}` / `{{contact.phone}}` filled in), **when to send**, and an optional **schedule**.

- **Schedule (optional):** days of the week (Mon–Sun), a **From**/**Until** time (both minutes included) and a time
  zone (defaults to the browser's). If Until is earlier than From the window runs overnight (18:00 → 09:00); each ticked
  day is the day the window **starts** on, so a Mon–Fri night rule also answers Saturday 02:00.
- **Judged at the time WhatsApp recorded the message**, not when the server processed it. A message delivered **more than 10
  minutes late** (a Meta retry) is not answered at all: "we're closed" an hour later would be wrong, and after 24 hours
  WhatsApp would refuse it.
- **At most one message per customer message** (not per burst: a customer's second message a few seconds later can be
  answered by a different rule). If several rules match: one with set hours beats an always-on one, then
  "first message" beats the other two, then the oldest wins. A rule that is cooling down (an away note sent yesterday) is
  skipped, so the next matching rule can answer. The list shows this as a note under two or more rules. So a brand-new
  customer who first writes after hours gets the away note and **never** the welcome (their next message is no longer a
  first message).
- **Not sent** when a Flow or an automation that was waiting for a reply already took the message; **never for a button
  tap** (a tap answers one of your own messages, e.g. "Stop promotions" on a broadcast); and **not while a live agent is in
  the conversation** (an agent wrote in the last 30 minutes).
- **"First message" means nobody has been in touch before.** A customer whose conversation your business started (an agent
  wrote first, a bot message, or the contact was sent a **broadcast**, which is not stored as a message) is not welcomed
  as a stranger when they reply. For "welcome back" the quiet period is then counted from your last contact.
- **Other automatic replies:** welcome messages go out **before** automation triggers run, so the greeting arrives first.
  If the account also has a keyword / new-message automation or a "first message" automation that replies, the customer
  gets both: use one or the other for the same job. **The AI auto-reply still answers** the customer's question after
  a greeting (greeting + answer); the AI is given the conversation ending on the customer's message, so it answers them
  rather than continuing the greeting. Turn the AI off for a conversation or use only one of the two if you do not want
  both messages.
- Sent as a **bot** message (`sender_type = 'bot'`): it does not pause an active Flow run and is not an "agent message" in
  the dashboard counts. The dashboard's **average response time** pairs a customer message with the next agent or bot
  message (the same for Flow, automation and AI replies), so a greeting counts as a fast first response there.

## Where things live

| Piece                       | Path                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tables                      | `supabase/migrations/90004_saas_autoresponders.sql` (+ assertions in `supabase/ci/verify-schema.sql`)      |
| Types, validation           | `src/saas/lib/autoresponder/{types,validate}.ts`                                                           |
| When does a rule fire       | `rules.ts` (schedule, silence, cooldown, priority; pure)                                                   |
| Persistence                 | `service.ts`, `items.ts`                                                                                   |
| Inbound hook                | `dispatch.ts` (entry point `dispatchSaasAutoresponders`), `claim.ts` (at-most-once guard), `send.ts`       |
| Form ⇄ rule, list summaries | `form.ts`, `summary.ts`                                                                                    |
| API                         | `src/app/api/saas/autoresponders/` (`GET/POST`, `[id]` `PATCH/DELETE`)                                     |
| UI                          | `src/saas/components/autoresponder/` (`autoresponder-manager.tsx`, `rule-form.tsx`)                        |
| Copy                        | `SaasAutoresponder` namespace, `Api.saasAutoresponder`, `Settings.sections.welcome-away` in all 4 catalogs |

Tables: `saas_autoresponders` (rules: any member can read; **no write policies**, the API writes with the service role
after the agent-role check and validation, so nobody can bypass the validator through PostgREST) and
`saas_autoresponder_sends` (which rule answered which conversation and when; service role only, RLS on with no policies).

### Upstream files touched (the 99/1 rule)

- `src/app/api/whatsapp/webhook/route.ts` — one import and one call (`await dispatchSaasAutoresponders({…})`, right
  after `contentConsumed` is known; it passes `consumed: contentConsumed || !!interactiveReplyId`).
- `src/lib/ai/auto-reply.ts` — one loop (2 lines + comment) dropping trailing bot turns from the AI's context so it
  answers the customer's message after a greeting.
- `src/lib/whatsapp/send-message.ts` — an optional `senderType?: 'agent' | 'bot'` param (default `'agent'`, so every
  existing caller is unchanged): one interface line, `sender_type: params.senderType ?? 'agent'`, and a 3-line early return
  before the "pause active Flow run" block when the sender is a bot. The send itself (phone variants, token handling,
  persistence) is reused, not copied.
- `src/components/settings/settings-sections.ts` — the new rail section (`Hand` icon import, list entry, meta entry).
- `src/app/(dashboard)/settings/page.tsx` — one import and one panel entry.
- `messages/*.json` — additions only. `src/app/api/whatsapp/webhook/route.test.ts` — 8 tests for the hook.

## Decisions and limits

- **Template mode is postponed.** The reference app lets a rule send an approved template instead of a free-form message
  (chargeable). Here a rule always fires right after the customer wrote, so WhatsApp's 24-hour reply window is open and a
  template is not needed. Add it if you need to message people outside that window (that is a drip/reminder feature,
  specs 08/09).
- **Three "when" choices instead of the reference app's two.** The spec captured "Only on first message" and "Resend
  after days" (`delay`) but not what "resend after" measures. A first reading (silence of the customer) made away notes
  skip customers who had written recently, so there are now two: _welcome back_ (silence) and _once every few days_ (since
  the rule last sent). Confirm against the reference app if exact parity matters.
- **A failed send is logged and not retried.** The customer's next message no longer counts as a first message, so there
  would be nothing to retry on (a temporary Meta error or rate limit loses that one greeting). The claim row stays, so a
  repeat of the same message cannot cause a second attempt.
- **At-most-once guard.** Meta can deliver two messages from a new customer at the same moment; both would see "no
  earlier message". The guard row (`saas_autoresponder_sends`, claimed by insert, taken over by a conditional update only
  if older than the rule's own gap) means only one sends. A first-message rule never takes an existing claim over, which
  also stops a late Meta retry of an old first message from welcoming the customer again. If the guard table cannot be
  reached nothing is sent.
- **"First message" is per conversation**, as upstream's `first_inbound_message` automation trigger is: a deleted or
  newly created conversation counts as new.
- **Migration 90004 converges.** Its row rules are dropped and re-created by name on every run and the write policies an
  earlier draft had are dropped, so a database that applied an earlier draft (two kinds only) ends up the same as a fresh
  one (checked by re-running it over a deliberately downgraded copy). An earlier draft also named the day-count column
  `inactivity_days`; that draft was never applied anywhere but a local test database.
- **A contact with no name** gets "Hi , welcome…" (shared message-object behaviour: tokens resolve to empty text, never as
  literal `{{…}}`). Write messages that read well without the name, or use none.
- **A bad time zone** (the database does not check zone names, servers differ) silences only its own rule.
- **WhatsApp Flow buttons** are rejected on save (same as suggested replies). Link previews are off (same as suggested
  replies).
- **Who can create one:** any agent (the API requires the agent role), the same as automations and flows. These are
  account-wide automatic messages to customers, so you may want admin-only; it is a one-word role change in the two route
  files. Viewers still see the buttons; their saves fail with a generic message.
- **"Once every few days" is a rolling window** of N × 24 hours since the rule last sent, not "once per closed period":
  someone told on Monday 20:00 is not told again on Tuesday 19:30 with N = 1.
- **Several rules can be on at once; one message goes out.** There is no limit on the number of rules.
- **No stored time zone per account:** the zone is per rule, defaulting to the browser's on creation. A stored zone the
  browser does not list is kept (the picker always includes it). Engines list India as `Asia/Calcutta`, which is equivalent.
  The picker is the browser's plain list of zone names, with no search.
- **Accessibility:** the "when" choices are marked as a radio group but do not move with the arrow keys (each is a tab
  stop); the days have a group label; the on/off, edit and delete buttons name their rule. The "Until" minute is
  included, so an 18:00 → 09:00 window also answers at 09:00:30.

## Verification

Done:

- **Unit tests** (`src/saas/lib/autoresponder`, `src/app/api/saas/autoresponders`, `src/saas/components/autoresponder`,
  the webhook hook tests): rule timing (daytime, overnight, day wrap-around, zones with daylight saving, inclusive ends,
  an unreadable zone), the three kinds incl. cooldown fall-through, validation, priority, claim guard with per-rule gaps,
  stale messages, button taps, AI hold-back, send as bot, service, routes (roles, UUID check, tenant scoping), form state,
  summaries in all four languages, form rendering. Full suite: 138 files, 1,705 tests; `tsc`, eslint (0 errors) and
  `next build` pass.
- **Real Postgres** (Supabase CLI local stack, as CI): migrations through 90004 apply, `verify-schema.sql` passes,
  every check constraint rejects bad rows (incl. the three kinds' day-count rules), RLS lets a member see/edit only their
  own account and anonymous callers nothing, the sends table is service-role only, deleting a rule or a conversation
  cascades, re-running the migration is a no-op.
- **End to end** on a local Supabase stack with the real Next.js server, a real Chromium and a stand-in for Meta
  (35 checks): create, edit, switch off and delete rules in the UI; a signed webhook delivery sends exactly one personalised
  greeting from the right rule; stored as a bot message; no second greeting while the away note cools down; a customer who
  wrote minutes ago gets the away note again once 4 days (rule: 3) have passed; two simultaneous first messages produce one
  greeting; a rejected send is logged without breaking the webhook; a message 20 minutes late and a "Stop promotions" tap
  are not greeted; a reply to a conversation an agent started is not welcomed as a stranger; a rule limited to another weekday stays quiet; the greeting shows in the inbox; no browser errors.

Not done:

- No message was sent to **real Meta** (the end-to-end run answered like Meta, it was not Meta). The payloads are the shared
  message object's, already unit-tested; real acceptance is as unverified as for suggested replies.
- **AI auto-reply with a real provider** was not run; the hold-back is covered by a webhook test (the AI function is not
  called after a greeting), not by a live model call.
- The end-to-end script lives in the working session, not in the repository (the repo has no e2e harness for the logged-in
  app against a local stack).
- Right-to-left and mobile layouts of the dialog were not checked by eye.
