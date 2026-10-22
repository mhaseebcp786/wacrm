// ============================================================
// Read the extra facts out of one inbound WhatsApp Cloud API message.
//
// Pure. Takes the raw message as `unknown` so the upstream webhook's own
// message interface does not have to grow: Meta sends `referral` (Click-to-
// WhatsApp ads), `order` (catalogue orders) and `interactive.nfm_reply` (a
// submitted WhatsApp Flow) on top of what the webhook already models.
// ============================================================

import type { SaasInboundSignals } from './types';

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;

export function extractInboundSignals(message: unknown): SaasInboundSignals {
  const m = asRecord(message);
  if (!m) return {};
  const signals: SaasInboundSignals = {};

  if (m.type === 'interactive') {
    const interactive = asRecord(m.interactive);
    const button = asRecord(interactive?.button_reply);
    const list = asRecord(interactive?.list_reply);
    if (button) {
      signals.tap = 'button';
      signals.replyTitle = str(button.title);
    } else if (list) {
      signals.tap = 'list';
      signals.replyTitle = str(list.title);
    } else if (interactive?.type === 'nfm_reply') {
      // `address_message` is Meta's address form, not a Flow the business built.
      if (asRecord(interactive.nfm_reply)?.name !== 'address_message') {
        signals.flowResponse = true;
      }
    }
  } else if (m.type === 'button') {
    // A quick-reply tap on a template message uses its own envelope.
    const button = asRecord(m.button);
    signals.tap = 'button';
    signals.replyTitle = str(button?.text) ?? str(button?.payload);
  } else if (m.type === 'order') {
    const items = asRecord(m.order)?.product_items;
    const productIds = Array.isArray(items)
      ? items
          .map((item) => str(asRecord(item)?.product_retailer_id))
          .filter((id): id is string => !!id)
      : [];
    signals.order = { productIds };
  }

  const referral = asRecord(m.referral);
  if (referral) {
    signals.adReferral = {
      sourceId: str(referral.source_id),
      sourceType: str(referral.source_type),
      headline: str(referral.headline),
    };
  }

  return signals;
}
