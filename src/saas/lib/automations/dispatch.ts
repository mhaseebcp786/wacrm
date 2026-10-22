// ============================================================
// Inbound hook for the extra automation triggers.
//
// Called once per stored customer message from the WhatsApp webhook, right
// after the upstream triggers (new message, keyword, button id, …) have run.
// It never throws.
//
//   1. skip when a Flow or a waiting automation already took the message;
//   2. read the extra facts off the raw message (signals.ts);
//   3. load the account's active automations that react to a message in one
//      query, and test each against this message without running anything;
//   4. run the button / list / form / ad / order triggers that matched;
//   5. fallback ("anything else"): when none of those, no keyword automation
//      and no button-id automation picked the message up, run the fallback.
//
// "Picked up" counts the specific triggers only. An automation on "new message
// received" runs for every message by design and does not stop the fallback.
// A first-message automation counts on a customer's first message.
//
// Returns whether one of the extra automations answered, so the webhook can
// keep the AI auto-reply from answering the same message as well.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  runAutomationsForTrigger,
  triggerMatches,
  type AutomationContext,
} from '@/lib/automations/engine';
import type { Automation, AutomationTriggerType } from '@/types';
import { extractInboundSignals } from './signals';
import { SAAS_TRIGGER_TYPES, type SaasAutomationTriggerType } from './types';

/** Triggers that react to what the message is (not to who is writing). */
const SPECIFIC_UPSTREAM: AutomationTriggerType[] = [
  'keyword_match',
  'interactive_reply',
  'first_inbound_message',
];

const SPECIFIC_SAAS = SAAS_TRIGGER_TYPES.filter(
  (t): t is Exclude<SaasAutomationTriggerType, 'anything_else'> =>
    t !== 'anything_else'
);

export interface InboundForSaasTriggers {
  accountId: string;
  contactId: string;
  conversationId: string;
  /** A Flow or a waiting automation already took this message. */
  consumed: boolean;
  /** A Welcome & Away message was just sent for this message. */
  greeted?: boolean;
  /** The contact's first-ever customer message. */
  isFirstInboundMessage: boolean;
  /** The raw WhatsApp Cloud API message. */
  message: unknown;
  /** Text the upstream triggers matched on. */
  inboundText: string;
  /** Id of the tapped button / list row, when the message is a tap. */
  interactiveReplyId?: string;
}

/** WhatsApp message types that are things a customer wrote or sent. */
const CONTENT_TYPES = new Set([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
]);

export interface SaasTriggerDeps {
  db: SupabaseClient;
  run: typeof runAutomationsForTrigger;
}

export interface SaasTriggerResult {
  /** One of the extra automations ran for this message. */
  handled: boolean;
}

export async function dispatchSaasAutomationTriggers(
  input: InboundForSaasTriggers,
  deps: SaasTriggerDeps = { db: supabaseAdmin(), run: runAutomationsForTrigger }
): Promise<SaasTriggerResult> {
  try {
    if (input.consumed) return { handled: false };

    const signals = extractInboundSignals(input.message);
    const context: AutomationContext = {
      message_text: input.inboundText,
      conversation_id: input.conversationId,
      interactive_reply_id: input.interactiveReplyId,
      saas: signals,
    };

    const { data, error } = await deps.db
      .from('automations')
      .select('id, account_id, trigger_type, trigger_config')
      .eq('account_id', input.accountId)
      .eq('is_active', true)
      .in('trigger_type', [
        ...SPECIFIC_UPSTREAM,
        ...SPECIFIC_SAAS,
        'anything_else',
      ]);
    if (error) {
      console.error('[saas automations] load failed:', error);
      return { handled: false };
    }
    const rows = (data ?? []) as unknown as Automation[];
    if (rows.length === 0) return { handled: false };

    const matched = (row: Automation): boolean =>
      row.trigger_type === 'first_inbound_message'
        ? input.isFirstInboundMessage
        : triggerMatches(row, context);

    let handled = false;
    for (const type of SPECIFIC_SAAS) {
      if (!rows.some((r) => r.trigger_type === type && matched(r))) continue;
      handled = true;
      await deps.run({
        accountId: input.accountId,
        triggerType: type,
        contactId: input.contactId,
        context,
      });
    }

    // Fallback only for ordinary customer-initiated content: a tap, a form
    // or an order answers something we sent / a flow we offered, and "sorry,
    // I didn't understand" is the wrong reply to it. System notices and
    // other non-content types are not messages to answer either. Nor is a
    // message that already got a Welcome & Away greeting.
    const type = (input.message as { type?: unknown } | null)?.type;
    const ordinary =
      typeof type === 'string' &&
      CONTENT_TYPES.has(type) &&
      !input.greeted &&
      !signals.tap &&
      !signals.flowResponse &&
      !signals.order &&
      !input.interactiveReplyId;
    const hasFallback = rows.some((r) => r.trigger_type === 'anything_else');
    if (
      ordinary &&
      hasFallback &&
      !rows.some((r) => r.trigger_type !== 'anything_else' && matched(r))
    ) {
      handled = true;
      await deps.run({
        accountId: input.accountId,
        triggerType: 'anything_else',
        contactId: input.contactId,
        context,
      });
    }

    return { handled };
  } catch (err) {
    console.error('[saas automations] dispatch failed:', err);
    return { handled: false };
  }
}
