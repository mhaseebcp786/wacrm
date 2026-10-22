# 11 — Campaigns (broadcast wizard, cost reserve, delivery funnel)

**Roadmap:** P1.4 · **the reference app route:** `/campaigns` · **wacrm gap:** wacrm has a 4-step broadcast
wizard already, but lacks wallet cost-reservation, local-time send, and the reserved/spent/released
accounting + rich delivery funnel the reference app shows.

Reference only. From the live trial sidebar + the product video (campaign creation needs a WABA +
wallet balance, not exercised on the trial).

## 1. Three-step wizard (video)

1. **Basics** — campaign name + approved **template**; variables map to manual values or contact
   fields (name, phone, custom fields); live preview.
2. **Audience** — one or more **contact groups**, refined by source / creation date / custom fields;
   shows **estimated recipients**, **estimated cost**, and **available balance** (blocks launch if
   balance < cost).
3. **Schedule & launch** — **Send now** or **Schedule**; **Send at recipient's local time** option
   (per-recipient timezone); review summary → **Launch**.

## 2. Reporting (video)

Campaign report: status, duration, total contacts; **Reserved / Spent / Released / Net cost**
summary (wallet accounting); **Delivery funnel** (Sent, Delivered, Read, Replied, Clicked, Failed,
Skipped); per-recipient delivery status with filters, export, and **schedule failed messages**;
error reason per failed row.

## 3. Rate cards (captured on `/home`)

Message rate card (India, INR/delivered): Marketing 0.8631, Utility 0.1150, Authentication 0.1150,
Service 0.1150. Calling: business-initiated 0.4662/min (0.0466/pulse, 6s=1 pulse); user-initiated free.
These drive the campaign cost estimate and wallet deduction.

## 4. Mapping to this fork

- wacrm already has `broadcast_pending_executions` + `broadcast_recipients` counters. Additions:
  wallet **reserve-on-launch / release-unused** accounting (ties to [14-whitelabel-billing-wallet](14-whitelabel-billing-wallet.md)),
  **send-at-local-time**, and the reserved/spent/released fields.
- Roadmap P1.4 also flags replacing the unthrottled send loop with a rate-limited
  `FOR UPDATE SKIP LOCKED` batch worker (80 msg/s standard, 20 for coexistence), 429 backoff, and
  pause/cancel — and routing MARKETING templates through Meta's Marketing Messages API before the
  2027 Cloud API marketing sunset. Spec only.
