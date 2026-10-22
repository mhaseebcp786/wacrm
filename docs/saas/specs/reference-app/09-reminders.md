# 09 — Reminders (scheduled & date-field template broadcasts)

**Roadmap:** P1.2 · **the reference app route:** `/reminders` (`/reminders/create`) · **API:** `/api/reminders`
**wacrm gap:** no birthday/renewal/recurring template scheduler.

Reference only. Live trial builder captured 2026-10-21 (`spec_reminders.json`, `spec_reminders.png`).

## 1. What it is

Schedules an **approved template** to send automatically at a date/time, once or recurring, to a
manual list or a contact group — optionally **driven by a contact date field** (birthday, renewal).
Header: *"Set up a new automated template broadcast schedule."*

## 2. Form (captured)

- **Reminder Title**.
- **Approved WhatsApp Template** select; template variables map to **contact fields** (e.g. variable
  `{{1}}` → Contact Name), with a live preview.
- **Recipients**, two modes:
  - **Manual Input** — phone numbers one per line, country code, no `+` (`919876543210`).
  - **Select Contact Group** — plus the option **Use contact date field**: pick a date custom-field
    (birthday/renewal); choose **Yearly birthday** (repeat yearly on that date) or **Exact date**
    (send once on the stored date); set start date and daily send time.
- **Date & Time** picker.
- **Recurrence** radio: **Once · Daily · Weekly · Monthly · Yearly · Custom**; optional **end date**.

## 3. Mapping to this fork

- Sidecar `saas_reminders(account_id, title, template_id, variable_map jsonb, recipient_mode,
  numbers text[], group_id, use_date_field, date_field_key, date_mode[yearly|exact], recurrence,
  start_at, daily_time, end_at, status)`.
- Cron (daily + time-of-day): evaluate `(contacts.custom_fields->>date_field_key)::date` against
  today for date-field reminders; dispatch the template. Matches roadmap P1.2 "date_reminders".
