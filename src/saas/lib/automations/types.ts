// ============================================================
// Extra automation triggers + the rich-message step (fork-owned).
//
// The upstream engine knows eight triggers and thirteen step types. The
// reference app's chatbot reacts to more kinds of customer action (a button
// text, a list row, a submitted form, "anything else", an ad click, a
// catalogue order) and sends any of the nine shared message types. Those are
// added here and plugged into the upstream engine through small hooks; the
// `automations` table needs no change (`trigger_type` / `step_type` are plain
// text columns).
// ============================================================

export const SAAS_TRIGGER_TYPES = [
  'button_reply',
  'list_reply',
  'flow_response',
  'anything_else',
  'meta_ads_ctwa',
  'catalog_order',
] as const;

export type SaasAutomationTriggerType = (typeof SAAS_TRIGGER_TYPES)[number];

export function isSaasTrigger(
  value: unknown
): value is SaasAutomationTriggerType {
  return (SAAS_TRIGGER_TYPES as readonly unknown[]).includes(value);
}

/** The step that sends one message built with the shared message object. */
export const RICH_MESSAGE_STEP = 'send_rich_message';

/** `button_reply` / `list_reply`: blank (or absent) text means any tap. */
export interface ReplyTextTriggerConfig {
  text?: string;
}

/** `catalog_order`: no ids means any order. */
export interface CatalogOrderTriggerConfig {
  product_ids?: string[];
}

/** Longest button text / row text / product id the triggers accept. */
export const TRIGGER_TEXT_MAX = 200;
export const PRODUCT_IDS_MAX = 50;

/**
 * What the webhook learned about one inbound message, beyond its text.
 * Travels on `AutomationContext.saas` (and is persisted with a parked run).
 */
export interface SaasInboundSignals {
  /** A reply to one of our interactive messages (or a template button). */
  tap?: 'button' | 'list';
  /** Visible label of the tapped button / list row. */
  replyTitle?: string;
  /** A WhatsApp Flow (form) was submitted. */
  flowResponse?: boolean;
  /** A catalogue order, with the retailer ids of the products in it. */
  order?: { productIds: string[] };
  /** The message came from a Click-to-WhatsApp ad. */
  adReferral?: { sourceId?: string; sourceType?: string; headline?: string };
}
