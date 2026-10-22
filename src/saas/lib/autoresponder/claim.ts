// ============================================================
// At-most-once guard for one rule × one conversation.
//
// Meta can deliver a customer's messages to the webhook at the same moment
// (two quick messages, or a retry), and each delivery decides on its own
// whether the customer is "new". Without a guard both would send the
// greeting. The guard is a row in `saas_autoresponder_sends`:
//   1. insert it — the first writer wins;
//   2. if it exists, move `last_sent_at` forward ONLY when the last claim is
//      at least `minGapMs` old — one conditional UPDATE, so two concurrent
//      claims cannot both succeed. The gap is the rule's own: a first-message
//      rule never sends twice (infinite gap, which also stops a Meta retry of
//      an old message from greeting again), a repeating rule waits its
//      interval, and nothing re-sends within `CLAIM_GAP_MS`.
// A claim is never given back: if the send then fails, the greeting is
// skipped for that message (the customer's next message no longer counts as
// their first, so there would be nothing to retry anyway) and the failure is
// logged.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export const CLAIM_GAP_MS = 60_000;
export const SENDS_TABLE = 'saas_autoresponder_sends';

export interface ClaimArgs {
  accountId: string;
  autoresponderId: string;
  conversationId: string;
  now: Date;
  /** Smallest time between two sends of this rule to this conversation. */
  minGapMs?: number;
}

const UNIQUE_VIOLATION = '23505';

/**
 * True when this caller may send. False when another delivery already did
 * (or the guard table cannot be reached: not sending is safer than possibly
 * sending twice).
 */
export async function claimSend(
  db: SupabaseClient,
  args: ClaimArgs
): Promise<boolean> {
  const key = {
    autoresponder_id: args.autoresponderId,
    conversation_id: args.conversationId,
  };
  const nowIso = args.now.toISOString();

  const inserted = await db
    .from(SENDS_TABLE)
    .insert({ ...key, account_id: args.accountId, last_sent_at: nowIso });
  if (!inserted.error) return true;
  if (inserted.error.code !== UNIQUE_VIOLATION) {
    console.error(
      '[saas-autoresponder] claim insert failed:',
      inserted.error.message
    );
    return false;
  }

  // A claim exists: take it over only if it is old enough.
  const gap = Math.max(args.minGapMs ?? CLAIM_GAP_MS, CLAIM_GAP_MS);
  if (!Number.isFinite(gap)) return false;
  const cutoff = new Date(args.now.getTime() - gap).toISOString();
  const moved = await db
    .from(SENDS_TABLE)
    .update({ last_sent_at: nowIso })
    .match(key)
    .lt('last_sent_at', cutoff)
    .select('autoresponder_id');
  return !moved.error && !!moved.data && moved.data.length > 0;
}
