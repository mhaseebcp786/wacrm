# SaaS Feature Registry

> [!IMPORTANT]
> This registry tracks every feature we have implemented on top of the upstream `ArnasDon/wacrm` codebase.
> When pulling upstream updates, **compare each new upstream feature against this list** before accepting it.
> If upstream implements something we already built, prefer the author's implementation (remove ours) to
> stay maximally aligned with upstream.

---

## How to use this during upstream sync

1. Run `git fetch upstream && git log upstream/main..HEAD --oneline` to see upstream additions.
2. For each upstream addition, search this registry for the feature keyword.
3. If a match is found → read the comparison guidance in the feature doc and decide: **keep upstream or keep ours**.
4. If upstream version is functionally equivalent or better → delete our custom code, keep author's.
5. Update this registry to mark the feature as `Merged → Upstream`.

---

## Feature Index

| #   | Feature                                                                                                          | Status                                                     | Our Files                                                                                                                                                                                         | Upstream Equivalent                                                                                                                                       | Doc                                         |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 01  | Carousel (templates + interactive messages)                                                                      | ✅ Implemented (not live-tested)                           | `src/saas/lib/whatsapp/carousel-*.ts`, `src/saas/lib/templates/`, `src/app/api/saas/templates/carousel/`, `src/saas/components/*carousel*.tsx`                                                    | None yet                                                                                                                                                  | [→](./features/01-carousel-messages.md)     |
| 02  | Template Media Send (Video + PDF)                                                                                | ✅ Implemented                                             | `src/saas/components/template-header-media-input.tsx`, `template-picker-with-media.tsx`                                                                                                           | None yet                                                                                                                                                  | [→](./features/02-template-media-send.md)   |
| 03  | Shared message object (9 types: validate, personalize, build, send)                                              | ✅ Library implemented (not live-tested; no UI/DB yet)     | `src/saas/lib/messages/`, `src/saas/lib/whatsapp/meta-request.ts`, `supabase/migrations/90002_saas_contact_message_type.sql`                                                                      | `src/lib/whatsapp/interactive.ts` (buttons/list), `meta-api.ts` `sendTextMessage` / `sendMediaMessage` / `sendInteractiveButtons` / `sendInteractiveList` | [→](./features/03-message-object.md)        |
| 04  | Suggested replies (all message types)                                                                            | ✅ Implemented (not live-tested)                           | `src/saas/lib/quick-replies/`, `src/saas/components/quick-replies/`, `src/app/api/saas/quick-replies/`, migration `90003`                                                                         | Upstream `quick_replies` (text + buttons/list); we merge with it, do not replace it                                                                       | [→](./features/04-suggested-replies.md)     |
| 05  | Welcome & away messages (autoresponder: first message / welcome back / once every N days, optional days + hours) | ✅ Implemented (e2e on local stack; not sent to real Meta) | `src/saas/lib/autoresponder/`, `src/saas/components/autoresponder/`, `src/app/api/saas/autoresponders/`, migration `90004`; small hooks in the webhook route and `send-message.ts` (`senderType`) | None (upstream has only the AI auto-reply and Automations, which are different features)                                                                  | [→](./features/05-welcome-away-messages.md) |

---

## Status legend

| Status               | Meaning                                                  |
| -------------------- | -------------------------------------------------------- |
| ✅ Implemented       | Feature is live in `saas-main`                           |
| 🔄 In Progress       | Feature being built                                      |
| ⚠️ Upstream Overlap  | Upstream has added a similar feature — comparison needed |
| 🔁 Merged → Upstream | We removed our impl; author's version is now used        |
| 🗑️ Deprecated        | Feature was removed intentionally                        |
