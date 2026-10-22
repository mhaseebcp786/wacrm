// ============================================================
// Matching and activation checks for the extra triggers.
//
//   button_reply   a reply button (or template button) with this text is tapped
//   list_reply     a list row with this text is chosen
//   flow_response  a WhatsApp Flow (form) is submitted
//   meta_ads_ctwa  the message arrives through a Click-to-WhatsApp ad
//   catalog_order  a customer sends a WhatsApp catalogue order
//   anything_else  a message that no other automation picked up (fallback)
//
// `saasTriggerMatches` returns null for a trigger it does not own, so the
// upstream `triggerMatches` can carry on with its own rules.
// ============================================================

import { getT } from '@/lib/i18n/translate';
import {
  PRODUCT_IDS_MAX,
  TRIGGER_TEXT_MAX,
  isSaasTrigger,
  type CatalogOrderTriggerConfig,
  type ReplyTextTriggerConfig,
  type SaasInboundSignals,
} from './types';

export interface TriggerIssue {
  path: string;
  message: string;
}

interface TriggerLike {
  trigger_type: string;
  trigger_config: unknown;
}

const norm = (s: string): string => s.trim().toLowerCase();

const cfgOf = (automation: TriggerLike): Record<string, unknown> =>
  automation.trigger_config && typeof automation.trigger_config === 'object'
    ? (automation.trigger_config as Record<string, unknown>)
    : {};

/** Blank text = any tap; otherwise the visible label must be equal. */
function replyTextMatches(
  wanted: ReplyTextTriggerConfig['text'],
  title: string | undefined
): boolean {
  if (typeof wanted !== 'string' || !wanted.trim()) return true;
  return typeof title === 'string' && norm(title) === norm(wanted);
}

export function saasTriggerMatches(
  automation: TriggerLike,
  signals: SaasInboundSignals | undefined
): boolean | null {
  if (!isSaasTrigger(automation.trigger_type)) return null;
  const cfg = cfgOf(automation);

  switch (automation.trigger_type) {
    case 'button_reply':
      return (
        signals?.tap === 'button' &&
        replyTextMatches(cfg.text as string | undefined, signals.replyTitle)
      );
    case 'list_reply':
      return (
        signals?.tap === 'list' &&
        replyTextMatches(cfg.text as string | undefined, signals.replyTitle)
      );
    case 'flow_response':
      return signals?.flowResponse === true;
    case 'meta_ads_ctwa':
      return !!signals?.adReferral;
    case 'catalog_order': {
      const order = signals?.order;
      if (!order) return false;
      const wanted = (cfg as CatalogOrderTriggerConfig).product_ids;
      if (!Array.isArray(wanted) || wanted.length === 0) return true;
      const ids = wanted.map((id) => String(id).trim());
      return order.productIds.some((id) => ids.includes(id.trim()));
    }
    case 'anything_else':
      // Whether nothing else picked the message up is decided by the
      // dispatcher before it fires this trigger; nothing more to test here.
      return true;
  }
}

/** Activation-time issues for one of the extra triggers (none for others). */
export function validateSaasTrigger(
  triggerType: string,
  triggerConfig: unknown
): TriggerIssue[] {
  if (!isSaasTrigger(triggerType)) return [];
  const t = getT('SaasAutomations.validation');
  const cfg = cfgOf({
    trigger_type: triggerType,
    trigger_config: triggerConfig,
  });
  const issues: TriggerIssue[] = [];

  if (triggerType === 'button_reply' || triggerType === 'list_reply') {
    const text = cfg.text;
    if (text != null && typeof text !== 'string') {
      issues.push({ path: 'trigger.text', message: t('textInvalid') });
    } else if (typeof text === 'string' && text.length > TRIGGER_TEXT_MAX) {
      issues.push({
        path: 'trigger.text',
        message: t('textTooLong', { max: TRIGGER_TEXT_MAX }),
      });
    }
  } else if (triggerType === 'catalog_order') {
    const ids = cfg.product_ids;
    if (ids != null) {
      if (
        !Array.isArray(ids) ||
        ids.some((v) => typeof v !== 'string' || v.trim() === '')
      ) {
        issues.push({
          path: 'trigger.product_ids',
          message: t('productIdsInvalid'),
        });
      } else if (ids.length > PRODUCT_IDS_MAX) {
        issues.push({
          path: 'trigger.product_ids',
          message: t('productIdsTooMany', { max: PRODUCT_IDS_MAX }),
        });
      }
    }
  }
  return issues;
}
