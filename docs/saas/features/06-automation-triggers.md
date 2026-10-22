# 06 — Automation triggers and the rich-message step (the reference app's "chatbot")

**Status:** Implemented. Unit-tested (full suite green, `tsc`, eslint, `next build`). **Not** sent to real WhatsApp, **not**
clicked through in a browser, and **not** run against a real database (see _Verification_).
**Spec:** [`specs/reference-app/03-chatbot.md`](../specs/reference-app/03-chatbot.md)
**Builds on:** [03 — Shared message object](./03-message-object.md), [04 — Suggested replies](./04-suggested-replies.md)
(the message editor and validator are reused as they are), [05 — Welcome & away](./05-welcome-away-messages.md)
(the send path).

## What it is

The reference app's "chatbot" is one trigger → one rich message. wacrm already had **Automations**, which do that and much
more (tags, assignment, deals, waits, branches). Comparing the two against the spec found these gaps in Automations, all of
which are now closed **inside Automations** (no second "chatbot" feature):

| Gap                                                                                | Added                                                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A tapped button could only be matched by its hidden id                             | Trigger **Button Tapped** (`button_reply`): match its **text**, or any                 |
| Same for a list row                                                                | Trigger **List Row Chosen** (`list_reply`): match its **text**, or any                 |
| No reaction to a submitted WhatsApp Flow form                                      | Trigger **Form Submitted** (`flow_response`)                                           |
| No reaction to a Click-to-WhatsApp ad click                                        | Trigger **Ad Click (Click-to-WhatsApp)** (`meta_ads_ctwa`)                             |
| No reaction to a catalogue order                                                   | Trigger **Catalogue Order** (`catalog_order`): any order, or given products            |
| No "anything else" reply                                                           | Trigger **Anything Else (Fallback)** (`anything_else`)                                 |
| Could only send text, buttons, a list or a template (no photo + buttons, cards, …) | Step **Send Rich Message** (`send_rich_message`): any of the nine shared message types |

Already equivalent, so unchanged: exact / contains / whole-word keywords (`keyword_match`), first message
(`first_inbound_message`), trigger count (`execution_count`), pause / activate, edit, delete.

Not copied: the spec's `Template` / `Non-Template` radio (a reply to an inbound message is inside the 24-hour window, so a
free-form message is always allowed; an approved template can still be sent with the existing **Send Template** step) and
the form picker (this fork has no native WhatsApp Flow forms yet, spec 07).

## How each trigger behaves

| Trigger         | Fires when                                                                                        | Settings                                  |
| --------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Button Tapped   | a reply button, **or a template quick-reply button** (a broadcast's "Stop promotions"), is tapped | Button text; blank = any button           |
| List Row Chosen | a list row is chosen                                                                              | Row text; blank = any row                 |
| Form Submitted  | a WhatsApp Flow form is submitted (`interactive.nfm_reply`)                                       | none (any form)                           |
| Ad Click        | the message carries Meta's `referral` object (the customer tapped a Click-to-WhatsApp ad)         | none                                      |
| Catalogue Order | the message is a WhatsApp catalogue order (`type: order`)                                         | Product (retailer) ids; blank = any order |
| Anything Else   | none of the specific triggers below picked the message up (see next section)                      | none                                      |

Button / row text is compared **trimmed and case-insensitively, as a whole** ("book now" matches "Book Now", not "Book
now please"). A button with no readable label never matches a non-blank text.

### "Anything else" in detail

It runs only when **all** of these hold:

- no Flow and no automation waiting for a reply took the message (the same rule as every other content trigger);
- the message is **ordinary customer content**: text, a photo, video, audio, document, sticker, location or contact card,
  and **not** a button / list tap, a submitted form or a catalogue order (those answer something we sent, "sorry, I didn't
  understand" would be the wrong reply, and the Welcome & Away feature skips taps for the same reason), nor a system notice
  or other type WhatsApp sends that is not something the customer wrote;
- **no Welcome & Away message was just sent** for this message (a first message or after-hours message gets the greeting
  only, not the greeting plus "I didn't understand");
- no active automation on one of these triggers matches the message: **keyword**, **button id** (`interactive_reply`),
  **button / list text**, **form**, **ad click**, **order**, and **first message** (when this is the customer's first message);
- the account has an active "Anything Else" automation.

An automation on **New Message Received** runs for every message by design and does **not** count as "picking the message
up" (otherwise the fallback could never run next to one). A new-contact automation does not count either.

If one of the new automations **matched** the message, the **AI auto-reply does not also answer it** (`handled` flag from
the dispatcher; it means "an automation ran", not "it sent something", so an ad-click automation that only adds a tag still
holds the AI back for that message). Upstream already held the AI back whenever the account has any active new-message or
keyword automation; that rule is unchanged.

**Consequence to know about:** while an active "Anything Else" automation exists, it matches every ordinary message nothing
else picked up, so the **AI auto-reply never gets to answer** those messages. Use the fallback **or** the AI for unmatched
messages, not both. (Making the fallback step aside for an enabled AI reply is a product decision that was not taken.)

## The Send Rich Message step

`step_config` **is** a shared message object (`{ message_type, payload }`): text, photo, video, audio, document, buttons
(with a photo / video / document header, or a URL button), list, card carousel, location, contact. The editor is the one
used for suggested replies and Welcome & Away messages. The customer's name and phone can be inserted (`{{contact.name}}`,
`{{contact.phone}}`; never left as literal text, as elsewhere).

- Sent as a **bot** message through the same send core as Welcome & Away (`sendAutoresponderMessage`): recorded in the
  conversation, shown in the inbox, does not pause an active Flow run.
- Validated when the automation is **activated** (a draft may be incomplete) and again when the step runs, so a message that
  became invalid fails that step with the reason in the run log instead of sending something different.
- A WhatsApp Flow button is rejected (no native Flow forms yet), same as suggested replies.
- Outside the 24-hour window (for example after a long **Wait** step) the send is refused by Meta and the step is logged as
  failed; use **Send Template** there.

## Where things live

| Piece                                                                      | Path                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Trigger / step names, config shapes                                        | `src/saas/lib/automations/types.ts`                                                                                |
| Reading `referral` / `order` / `nfm_reply` / tap labels off a Meta message | `signals.ts`                                                                                                       |
| Matching + activation checks (triggers)                                    | `triggers.ts`                                                                                                      |
| The inbound hook, fallback decision                                        | `dispatch.ts` (entry point `dispatchSaasAutomationTriggers`)                                                       |
| Rich-message step: run / validate / builder helpers                        | `rich-step.ts`, `rich-validate.ts`, `rich-config.ts`                                                               |
| List pills, dropdown entries                                               | `meta.ts`                                                                                                          |
| Builder UI                                                                 | `src/saas/components/automations/` (`trigger-config.tsx`, `rich-message-step.tsx`)                                 |
| Copy                                                                       | `SaasAutomations` namespace, plus `Automations.builder.triggers.*` / `.steps.send_rich_message`, in all 4 catalogs |

**No migration.** `automations.trigger_type` and `automation_steps.step_type` are plain text columns (migration 006), so the
new values need no schema change and no CI assertion.

### Upstream files touched (the 99/1 rule)

- `src/app/api/whatsapp/webhook/route.ts` — one import, one call (`dispatchSaasAutomationTriggers({…})` after the upstream
  automation triggers, before the AI reply) and `&& !saasHandled` on the AI condition.
- `src/lib/automations/engine.ts` — `AutomationContext.saas?` (one field); a 2-line hook at the top of `triggerMatches`;
  one `case 'send_rich_message'` in `runStep`; 3 import lines.
- `src/lib/automations/validate.ts` — one `case` for the step, one line for the triggers, 2 imports.
- `src/lib/automations/trigger-meta.ts` — `...SAAS_TRIGGER_META` and its import (list-row pill colours).
- `src/types/index.ts` — the trigger union gains `SaasAutomationTriggerType`, the step union gains `'send_rich_message'`.
- `src/components/automations/automation-builder.tsx` — icon import, step-meta line, addable-steps line, `...SAAS_TRIGGER_OPTIONS`,
  one `<SaasTriggerConfig>` line, one editor `case`, one preview `case`, one blank-config `case`.
- `messages/*.json` — additions only. Tests added to `engine.test.ts`, `validate.test.ts`, the webhook `route.test.ts`.

The triggers fire from a **second dispatcher** rather than by editing the upstream list of triggers in the webhook, so the
upstream `automationTriggers` array is untouched.

## Decisions and limits

- **Extended Automations instead of building a separate `saas_chatbots` table.** The spec offers both; Automations already has
  the engine, logs, counters, pause / activate and the builder, and a one-trigger-one-message "chatbot" is just an automation
  with one step. A separate table would have meant two places to look for "why did the bot answer".
- **"Anything else" ignores New Message Received automations** (see above). If you want a catch-all that also runs for
  everything, that is what New Message Received already is.
- **First-message automations stop the fallback only on the first message.** On later messages they cannot match anyway.
- **Product filter uses retailer ids typed by hand.** There is no product catalogue picker (this fork has no catalogue
  integration); the ids are the ones Meta sends as `product_retailer_id`.
- **Form answers are not exposed as variables yet.** The trigger fires on any form; the submitted answers
  (`response_json`) are not parsed into `{{ vars.* }}` for later steps, and there is no per-form filter (the webhook carries
  a `flow_token`, not a form id).
- **`referral` is not stored.** The ad trigger reads it from the message when it arrives; the ad is not saved on the
  conversation and there is no attribution card in the inbox (spec 05's other half).
- **Each trigger kind is its own automation type**, so a single automation reacts to one kind of event, as upstream's do.
- A customer's **first message that is also an ad click** fires the first-message and ad-click automations (both are valid
  matches) and not the fallback.
- **Who can create one:** unchanged (agent role), same API.
- **All matching automations run, not just the first.** The spec picks one bot by precedence (specific > first message >
  fallback). Here several triggers can match one message (a button text, a first-message and a new-message automation, say)
  and each runs; the fallback is the only one that yields to the others. Keep one automation per job to avoid double replies.
- **`lead_form_id` is not implemented.** The spec's link from an ad-click bot to a Meta lead form belongs to the Lead Ads half
  of spec 05 (Facebook connect, `leadgen` webhook), which does not exist here.
- **Any Meta `referral` counts as an ad click**, including `source_type: "post"`. A Flow `nfm_reply` counts as a form unless it
  is Meta's `address_message`.
- **The rich step fills in only the customer's name and phone.** `{{message.text}}` / `{{vars.x}}` (which the plain Send Message
  step understands) are not replaced and would reach the customer literally; the editor only offers the contact tokens.
- **A rich message cannot "wait for reply"**; that option exists only on the plain Send Buttons / Send List steps.
- **Forms and orders look odd upstream.** The webhook stores a form reply as "[Interactive reply]" and an order as "[Unsupported
  message type: order]", so a keyword automation on those words, or the AI reply when no order / form automation exists, can
  react to the placeholder. That is existing upstream behaviour, left alone.
- **A resumed run drops the old tap data.** When a run waiting for a reply continues, the extra facts from the message that
  started it are cleared, as upstream does for the reply id.

## Verification

Done:

- **Unit tests:** `src/saas/lib/automations` (signal extraction for every Meta shape, matching of every trigger incl. blank /
  case-insensitive / wrong-kind cases, activation checks, the dispatcher: queries, each trigger, every fallback exclusion,
  fails soft), the rich step (sends into the conversation, photo + buttons, invalid and refused sends fail the step),
  upstream `engine.test.ts` (hook, step run, missing contact), `validate.test.ts` (step incl. inside a branch, triggers), the
  webhook `route.test.ts` (arguments, ordering, AI hold-back, replay), builder pieces (`components.test.tsx`). Full suite:
  143 files, 1,786 tests; `tsc`, eslint on the touched areas, and `next build` pass.

Not done:

- No message was sent to **real Meta**; the real shapes of `referral`, `order` and `nfm_reply` are taken from Meta's
  documentation and the reference app capture, not from a live delivery.
- **Not exercised in a browser or against a local Supabase stack.** The builder pieces are covered by server-render tests
  only; whether the nine-type editor is comfortable inside the 320 px step card was not checked by eye.
- **Not run against a real database.** No schema changed, but the dispatcher's single query (`in('trigger_type', …)`) was
  only tested against a stand-in.
