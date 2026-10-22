# Feature comparison in plain language: wacrm vs the reference app

**Written:** 2026-10-22, on branch `additional-features`.
**Covers:** suggested replies and quick replies, the autoresponder, and automations.
**Audience:** anyone who is not a developer and wants to know what each product can actually do.

> The reference app is the competitor product whose features this fork is copying. Its name is
> deliberately not written anywhere in this project (see the memory note `no-competitor-brand-name`).
> What we know about it comes from the 2026-10-21 trial captures in
> [`specs/reference-app/`](./specs/reference-app/00-overview.md). It was not re-checked live when this
> page was written. What we know about wacrm comes from the current code and
> [`features/04-suggested-replies.md`](./features/04-suggested-replies.md).

All examples use a made-up shop, **Sunrise Furniture**. "Yes" means the product can do it today. "No" or
"not yet" means it cannot.

---

## 1. Suggested replies (saved messages your staff send with one click)

Think of them as saved answers. An agent picks one from a menu instead of typing it each time.
In both products "suggested replies" and "quick replies" are the same feature. The reference app labels
it "Suggested Replies" in its sidebar, and upstream wacrm calls it "quick replies".

| Example                                                                                                                                                                                | Reference app | wacrm                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| **A. Price list.** A customer asks about sofa prices. The agent clicks "Sofa prices" and the customer gets a message with three tappable buttons: _Leather_, _Fabric_, _Corner sofas_. | Yes           | Yes                                                                                |
| **B. Showroom location.** The customer asks "Where are you?". The agent clicks "Showroom" and WhatsApp sends a map pin that opens directions when tapped.                              | Yes           | Yes                                                                                |
| **C. Product catalogue.** The agent clicks "New arrivals". The customer gets a swipeable row of five photo cards, each with a "View" button that opens your website.                   | Yes           | Yes (never tested with real WhatsApp, only checked against Meta's published rules) |
| **D. Sales contact card.** The agent clicks "Talk to sales". The customer gets your salesperson's contact card and can save it with one tap.                                           | Yes           | Yes                                                                                |
| **E. Personal touch.** You write "Hi {{name}}, thanks for contacting us!" and the customer's real name is filled in automatically.                                                     | Yes           | Yes                                                                                |
| **F. A form inside WhatsApp.** A reply that opens a small form, such as "Book a home visit".                                                                                           | Yes           | Not yet (needs native WhatsApp Flow forms, spec 07)                                |

Smaller differences:

- **Photos and videos:** the reference app has one shared media library. wacrm takes a web link or an upload per reply.
- **Voice notes:** the reference app lets you choose a voice message or normal audio. wacrm does not offer the choice.
- **Link previews:** the reference app turns them on for text. wacrm leaves them off. Turning them on would change every text the CRM sends, so it is your decision.
- **Old saved replies:** wacrm keeps the ones created before the upgrade and shows them in the same list.

---

## 2. Autoresponder (the app replies by itself, with no staff involved)

> **Update 2026-10-22:** wacrm now has this as its own feature, **Welcome & away messages**
> (Settings → Welcome & away). The "wacrm" column below shows the state **before** it was built; see
> [`features/05-welcome-away-messages.md`](./features/05-welcome-away-messages.md) for what it does now. All four
> examples A to D work there, except D's photo-plus-buttons combination (an image with a caption, or reply buttons with
> an image header, are both available).

The reference app has this as its own feature. Before 2026-10-22 **wacrm did not have it**; the closest thing was a
simple automation (section 3).

| Example                                                                                                                                                           | Reference app                                        | wacrm                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **A. Welcome message.** Someone messages for the first time at 11pm and instantly gets "Welcome to Sunrise Furniture! We'll reply in the morning."                | Yes                                                  | Only as plain text, built as an automation                                                                     |
| **B. Only outside working hours.** The message goes out only on Sunday and after 6pm on weekdays.                                                                 | Yes, with days and hours chosen in the autoresponder | Not as a simple setting. It handles hours only, not days of the week, and must be built inside each automation |
| **C. Welcome back.** A customer who has been silent for 30 days messages again and automatically gets "Welcome back! Here's our new catalogue", with photo cards. | Yes ("resend after N days", 1 to 90)                 | No                                                                                                             |
| **D. A rich first reply.** The first message gets a showroom photo plus two buttons: _Browse sofas_ and _Talk to a person_.                                       | Yes                                                  | Can send buttons or a list, but not a photo with buttons                                                       |

How the reference app's autoresponder is set up: a name, a message (any of the nine types, or an approved
template), a send condition ("only on first message" or "resend after N days"), and an optional
day-and-hour schedule. The full spec is [`specs/reference-app/02-autoresponder.md`](./specs/reference-app/02-autoresponder.md).

---

## 3. Automations (if something happens, do these steps)

| Example                                                                                                                                                                                                                                                           | Reference app                                          | wacrm                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **A. Keyword reply.** A customer types "price" and gets your price list. "address" gets the location.                                                                                                                                                             | Yes (its "chatbot")                                    | Yes, with text, buttons or a list                                                                                    |
| **B. Menu that remembers what you tapped.** The app asks "What are you looking for?" with _Sofa_ and _Bed_. The customer taps _Sofa_ and gets sofa questions, as a short conversation.                                                                            | Yes (its flow builder)                                 | Yes (its flows feature)                                                                                              |
| **C. Sort the lead automatically.** A customer says "I want a quote". The app tags them "Hot lead", assigns the chat to Priya (or rotates between agents), creates a deal worth 50,000 in the sales pipeline, and replies "Priya will contact you in 10 minutes." | Only partly. It is more a reply tool than a sales tool | Yes. This is wacrm's strongest area                                                                                  |
| **D. Follow up if they go silent.** The customer asks for a quote and goes quiet. The app waits two days, then sends "Still interested?". If they reply, it stops.                                                                                                | Yes (drip campaigns and reminders)                     | Can wait, then send, and can pause for a reply. Whether scheduled "time-based" triggers actually fire is unconfirmed |
| **E. Customer clicked your Facebook or Instagram ad.** Someone taps "Message us" on an ad and is greeted with "Thanks for clicking our ad! Interested in the sofa offer?"                                                                                         | Yes                                                    | No                                                                                                                   |
| **F. AI answers questions.** A customer asks "Do you deliver to Pune, and how long does it take?". The AI reads your business information and answers, or hands the chat to a human if it cannot.                                                                 | Yes                                                    | Yes (you bring your own AI account)                                                                                  |

### What can start an automation

- **Reference app chatbot:** exact word match, contains a word, button tapped, list row chosen, a form submitted, first message, "anything else" (fallback), a Facebook or Instagram ad click, and a catalogue order.
- **wacrm automations:** new message, first message, keyword (exact, contains, or whole word), new contact, chat assigned, tag added, a button or list row tapped, and time-based.

wacrm has no fallback ("anything else") trigger, no ad-click trigger, no catalogue-order trigger and no
form-submitted trigger.

### What an automation can do after it starts (wacrm)

Send text, buttons, a list or an approved template. Add or remove a tag. Assign the chat to a person or
rotate between agents. Update a contact's details. Create a sales deal. Wait for minutes, hours or days.
Branch on a condition (tag, contact detail, message text or time of day). Call another system. Close the
conversation. Every run is logged step by step.

### Who answers first when a message arrives (wacrm)

A conversation flow goes first. Then an automation that was waiting for this customer's reply. Then the
automation triggers. Then the AI reply. Once one of the first two has handled a message, the later ones
stay quiet, so the customer does not get two bots answering.

---

## Summary

| What you want                                              | Reference app | wacrm                                 |
| ---------------------------------------------------------- | ------------- | ------------------------------------- |
| Saved replies with photos, maps, buttons and contact cards | Yes           | Yes (never tested with real WhatsApp) |
| Welcome message, away-hours message, "welcome back"        | Yes           | Yes (Welcome & away messages, new)    |
| Keyword replies and tap-a-button menus                     | Yes           | Yes                                   |
| Tag, assign, create a deal, send to another system         | Basic         | Strong                                |
| Reply to ad clicks, catalogue orders, in-chat forms        | Yes           | No                                    |
| AI answering customers                                     | Yes           | Yes                                   |

**Done since this was written:** the autoresponder gap (examples A to D in section 2) is closed by Welcome &
away messages. What is still missing compared with the reference app: replies to ad clicks, catalogue orders and
in-chat form submissions, drip sequences and reminders, and the "approved template" variant of the autoresponder
(left out on purpose, see the feature doc).

## Open items

- The reference app's quick-reply carousel cards use `card.type: "button"`, while wacrm follows Meta's docs
  with `cta_url`. Only a real Meta send will settle which is right.
- It is unconfirmed whether wacrm's `time_based` automation trigger ever fires. The builder and validator
  accept it, but no code that runs it was found.
- Nothing in this fork has been sent to real WhatsApp yet.
