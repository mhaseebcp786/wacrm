# 12 — Integrations (Shopify, WooCommerce, Sheets, Zoho, LeadSquared)

**Roadmap:** P3.1 · **LeminAi route:** `/integrations` · **API:** `/api/ecommerce/*`
**wacrm gap:** none (requires external n8n/Zapier today).

Reference only. Live trial list captured 2026-10-21 (`spec_integrations.json`). Each connector
below showed **NOT CONNECTED**; connect flows need real store credentials (not exercised).

## 1. Connectors offered (captured)

Header: *"Choose a platform to send WhatsApp template messages automatically on events."*

| Connector | Purpose (as labelled) | Mechanism (video) |
|---|---|---|
| **Shopify** | Order & customer events from your Shopify store | store webhook details → events (new order, customer activity) → template messages |
| **WooCommerce** | Order & customer events from your WordPress store | webhook; events `order created`, `customer created` |
| **Google Sheets** | Auto-import contacts from a connected sheet | connect sheet; rows → contacts; column→field mapping |
| **Zoho CRM** | Two-way lead sync | OAuth "connect with Zoho"; leads↔contacts |
| **LeadSquared** | Two-way lead sync | host + access key + secret key |

`GET /api/ecommerce/<provider>/status` reports connection state.

## 2. Mapping to this fork

- Per-connector webhook routes under `/api/saas/integrations/*` verifying store HMAC
  (Shopify/Woo), mapping `checkouts/create` (abandoned-cart → drip), `orders/create`
  (confirmation/COD template), `orders/fulfilled` (tracking template). (roadmap P3.1).
- Sidecar `saas_integrations(account_id, provider, status, config_enc jsonb, webhook_secret)`.
- Sheets/Zoho/LeadSquared are contact-sync connectors (OAuth or key-based), separate from the
  e-commerce webhook connectors. Catalog/products + WhatsApp Pay are covered in
  [13-whatsapp-payments](13-whatsapp-payments.md).
