# 07 — Forms (native WhatsApp Flows)

**Roadmap:** P1.1 · **LeminAi route:** `/forms` (`/forms/create`) · **API:** `/api/forms` (flows)
**wacrm gap:** wacrm "Flows" are button trees; no native multi-screen WhatsApp Flow forms.

Reference only. Live trial builder captured 2026-10-21 (`spec_forms.json`, `spec_forms.png`).

## 1. What it is

A visual builder that produces a **Meta WhatsApp Flow** (native pop-up form inside WhatsApp with
inputs, dropdowns, etc.), publishable and attachable to a message as a Flow button
([01 §3.2 Flow Button](01-suggested-replies.md), [16-flow-builder](16-flow-builder.md)).
Header: *"Create Meta WhatsApp Flow — Design a multi-screen interactive form."*

## 2. Structure (captured)

- **Form Name** (required) + **Category** select: Sign Up, Sign In, Appointment Booking,
  Lead Generation, Contact Us, Customer Support, Survey, Other.
- **Screens**: up to **10** (`2 / 10` shown). Each screen has a fixed **Screen ID** (`SCREEN_ONE`,
  `SCREEN_TWO`, …), a **Screen Title** (max **35**), and a **Terminal Screen** toggle ("ends form here").
- **Content & Fields** per screen — **Add Content** offers these block types (from the UI + video):
  - **Large Heading / Text** (text block, max **80**).
  - **Short Answer** input with **Input Type** select: Text, Email, Number, Phone, Password, Passcode;
    **Label** max **20**; **Helper Text** (optional) max **80**; **Required** toggle.
  - Selection controls (list / single-choice / multi-choice), media, and (video) date pickers.
- **Navigation**: non-terminal screens pick a **Next Screen** and a **Button Label** (max **30**);
  terminal screens end the flow with a button label.
- **Live Preview** renders the WhatsApp Flow as the customer would see it.

## 3. Meta mapping

The builder serialises to Meta **Flow JSON** (screens with `TextInput`, `Dropdown`,
`RadioButtonsGroup`, `CheckboxGroup`, `DatePicker`, `Footer` with a `complete`/`navigate` action)
and publishes via `POST /{waba_id}/flows` + asset upload. A published flow is sent either as a
template FLOW button or an interactive `type:"flow"` message. Submissions return as
`messages[].interactive.type == "nfm_reply"` with `response_json` — map fields to `contacts.custom_fields`
and fire a `whatsapp_flow_response` chatbot trigger ([03](03-chatbot.md)).

## 4. Mapping to this fork

- Sidecar `saas_flows(account_id, name, category, flow_json jsonb, meta_flow_id, status)`.
- A React builder producing Flow JSON; publish route under `/api/saas/flows`.
- Webhook: parse `nfm_reply.response_json` → contact fields + trigger. This is a large feature;
  spec only.
