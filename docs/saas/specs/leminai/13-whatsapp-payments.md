# 13 — WhatsApp Payments (in-chat UPI)

**Roadmap:** P3.1 · **LeminAi route:** `/whatsapp-payments` · **API:** `/api/payments/gateway-account`
**wacrm gap:** none.

Reference only. Live trial setup form captured 2026-10-21 (`spec_payments.json`,
`spec_payments.png`). No gateway connected on the trial, so the connect round-trip and in-chat pay
flow were not exercised.

## 1. What it is

Collect UPI payments **inside the WhatsApp chat** — customer gets an order total + **Pay Now**
button, pays, and receives a receipt without leaving WhatsApp. Header: *"Collect UPI payments from
customers directly inside WhatsApp chats."*

## 2. Setup form (captured)

- **Payment Gateway** select: **Cashfree** or **Razorpay**.
  - **Cashfree** — API-key based (server-to-server UPI intent): Environment (Sandbox/Production),
    **Client ID**, **Client Secret**, Merchant VPA (optional, testing), Merchant Category Code
    (optional), Purpose Code (optional).
  - **Razorpay** — connects **natively through WhatsApp Manager, no API keys** ("click Connect and log in").
- **Auto send** toggle — payment requests auto-sent when a customer checks out.
- `GET /api/payments/gateway-account` → `{ payment_gateway_account, webhook_url }`.

## 3. Customer flow (video)

Add product to WhatsApp cart → receive order total + Pay Now → tap, select method, pay in-chat →
instant receipt. Brand sees all orders on the dashboard.

## 4. Mapping to this fork

- Sidecar `saas_payment_accounts(account_id, gateway[cashfree|razorpay], env, credentials_enc jsonb,
  webhook_url, auto_send)`.
- Uses Meta `order_details` / `order_status` interactive messages tied to a catalog (roadmap P3.1);
  gateway webhooks update order/payment status. Cashfree = keys; Razorpay = WhatsApp-Manager-native.
- Depends on catalog/commerce (WhatsApp Business `commerce` settings, seen in `/whatsapp-details`).
