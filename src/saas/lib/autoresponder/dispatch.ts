// ============================================================
// Inbound hook for Welcome & Away Messages.
//
// Called once per customer message from the WhatsApp webhook, after the
// message is stored and before automations run (so a greeting arrives
// before any automation's reply). It never throws: a failing greeting must
// not break the webhook or the automations behind it.
//
//   1. skip when a Flow or a waiting automation is already answering, or when
//      the message is too old to answer (a late Meta retry);
//   2. load the account's switched-on rules (none → done, one indexed query);
//   3. learn when this customer last wrote BEFORE this message, and when each
//      rule last answered this conversation;
//   4. pick the one rule that applies (rules.ts);
//   5. claim it for this conversation (claim.ts), then send; a failed send
//      is logged and not retried.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { CLAIM_GAP_MS, SENDS_TABLE, claimSend } from './claim';
import { rowToItem } from './items';
import { pickRule } from './rules';
import { sendAutoresponderMessage } from './send';
import { TABLE } from './service';
import type { AutoresponderItem, SaasAutoresponderRow } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A greeting for a message older than this is not sent. The webhook can process
 * a Meta retry hours late; "we are closed" or "welcome" would then arrive out
 * of context, or after WhatsApp's 24-hour window has shut and be refused.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export interface InboundForAutoresponder {
  accountId: string;
  conversationId: string;
  contactId: string;
  /** When the customer wrote the message (Meta's timestamp). */
  inboundAt: Date;
  /** A Flow or a waiting automation already took this message. */
  consumed: boolean;
}

export interface AutoresponderDeps {
  db: SupabaseClient;
  send: typeof sendAutoresponderMessage;
  now: () => Date;
}

/** An agent who wrote this recently is still in the conversation. */
export const AGENT_ACTIVE_MS = 30 * 60 * 1000;

interface History {
  /**
   * The last time anyone was in touch with this customer before the message
   * being answered: their own previous message, or, when they have never
   * written, the last message or broadcast WE sent them. Null only for a
   * customer nobody has ever been in touch with.
   */
  previousContactAt: Date | null;
  /** An agent wrote in this conversation within `AGENT_ACTIVE_MS`. */
  agentActive: boolean;
}

/** The newest `created_at`-style timestamp matching the query, or null. */
async function newest(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  column: string
): Promise<Date | null | undefined> {
  const { data, error } = await query;
  if (error) return undefined;
  const value = (data as Record<string, string | null>[] | null)?.[0]?.[column];
  return value ? new Date(value) : null;
}

async function loadHistory(
  db: SupabaseClient,
  input: InboundForAutoresponder
): Promise<History | undefined> {
  // Everything is strictly earlier than this message: a message written in the
  // same second (Meta stamps whole seconds) must not make either of the two
  // look like the "second" one, or neither would greet. The claim stops a
  // double greeting.
  const before = input.inboundAt.toISOString();
  const latestMessage = (sender: { is?: string; isNot?: string }) => {
    let query = db
      .from('messages')
      .select('created_at')
      .eq('conversation_id', input.conversationId)
      .lt('created_at', before);
    if (sender.is) query = query.eq('sender_type', sender.is);
    if (sender.isNot) query = query.neq('sender_type', sender.isNot);
    return query.order('created_at', { ascending: false }).limit(1);
  };

  const [customer, outbound, agent, broadcast] = await Promise.all([
    newest(latestMessage({ is: 'customer' }), 'created_at'),
    newest(latestMessage({ isNot: 'customer' }), 'created_at'),
    newest(latestMessage({ is: 'agent' }), 'created_at'),
    // Broadcasts are not stored as messages, so look at who was sent one.
    newest(
      db
        .from('broadcast_recipients')
        .select('sent_at')
        .eq('contact_id', input.contactId)
        .lt('sent_at', before)
        .order('sent_at', { ascending: false })
        .limit(1),
      'sent_at'
    ),
  ]);
  if (
    customer === undefined ||
    outbound === undefined ||
    agent === undefined ||
    broadcast === undefined
  ) {
    return undefined;
  }

  // A conversation the business started (a broadcast, an agent's first
  // message) is not a stranger's first contact: the customer's reply is not
  // "their first message" to welcome.
  const weWroteFirst = [outbound, broadcast].filter(
    (d): d is Date => d !== null
  );
  const lastContact =
    customer ??
    (weWroteFirst.length
      ? new Date(Math.max(...weWroteFirst.map((d) => d.getTime())))
      : null);

  return {
    previousContactAt: lastContact,
    agentActive:
      agent !== null &&
      input.inboundAt.getTime() - agent.getTime() < AGENT_ACTIVE_MS,
  };
}

/** When each of these rules last answered the conversation. */
async function lastSentByRule(
  db: SupabaseClient,
  conversationId: string
): Promise<Record<string, Date> | undefined> {
  const { data, error } = await db
    .from(SENDS_TABLE)
    .select('autoresponder_id, last_sent_at')
    .eq('conversation_id', conversationId);
  if (error) return undefined;
  const out: Record<string, Date> = {};
  for (const r of (data ?? []) as {
    autoresponder_id: string;
    last_sent_at: string;
  }[]) {
    out[r.autoresponder_id] = new Date(r.last_sent_at);
  }
  return out;
}

/** Shortest allowed time between two sends of this rule to one conversation. */
function minGapMs(rule: AutoresponderItem): number {
  if (rule.send_when === 'first_message') return Number.POSITIVE_INFINITY;
  const interval = (rule.interval_days ?? 0) * DAY_MS;
  // A welcome-back rule is eligible after N days of customer silence, measured
  // to the customer's own message; the claim is stamped when the greeting was
  // processed, a little later. An hour of slack (processing is capped at
  // STALE_AFTER_MS) keeps the two clocks from disagreeing at the boundary.
  return Math.max(
    CLAIM_GAP_MS,
    rule.send_when === 'after_inactivity' ? interval - 60 * 60 * 1000 : interval
  );
}

/** True when a greeting was sent. */
export async function runAutoresponders(
  input: InboundForAutoresponder,
  deps: AutoresponderDeps
): Promise<boolean> {
  if (input.consumed) return false;
  const now = deps.now();
  const age = now.getTime() - input.inboundAt.getTime();
  // (NaN — an unreadable timestamp — fails both comparisons, so it is checked.)
  if (Number.isNaN(age) || age > STALE_AFTER_MS) return false;
  const { db } = deps;

  const { data: rows, error } = await db
    .from(TABLE)
    .select('*')
    .eq('account_id', input.accountId)
    .eq('is_active', true);
  if (error) {
    console.error('[saas-autoresponder] loading rules failed:', error.message);
    return false;
  }
  const rules = ((rows ?? []) as SaasAutoresponderRow[]).map(rowToItem);
  if (rules.length === 0) return false;

  const [history, lastSentAt] = await Promise.all([
    loadHistory(db, input),
    lastSentByRule(db, input.conversationId),
  ]);
  // Unknown history: say nothing rather than greet a returning customer.
  if (history === undefined || lastSentAt === undefined) return false;
  // A live agent is already in this conversation: no automatic note on top.
  if (history.agentActive) return false;

  const rule = pickRule(rules, {
    at: input.inboundAt,
    previousCustomerMessageAt: history.previousContactAt,
    lastSentAt,
  });
  if (!rule) return false;

  const claimed = await claimSend(db, {
    accountId: input.accountId,
    autoresponderId: rule.id,
    conversationId: input.conversationId,
    now,
    minGapMs: minGapMs(rule),
  });
  if (!claimed) return false;

  try {
    await deps.send(db, input.accountId, input.conversationId, rule.message);
    return true;
  } catch (err) {
    console.error(
      `[saas-autoresponder] sending "${rule.name}" failed:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * The webhook's entry point. Never throws. Resolves true when a greeting was
 * sent, so the caller can hold back other automatic replies to the same message.
 */
export async function dispatchSaasAutoresponders(
  input: InboundForAutoresponder
): Promise<boolean> {
  try {
    return await runAutoresponders(input, {
      db: supabaseAdmin(),
      send: sendAutoresponderMessage,
      now: () => new Date(),
    });
  } catch (err) {
    console.error(
      '[saas-autoresponder] dispatch failed:',
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
