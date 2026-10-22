// ============================================================
// Send a saved reply into a conversation (server only).
//
// Resolve the reply → fill `{{contact.*}}` from the conversation's contact
// (always: a token must never reach the customer literally) → validate →
// hand the result to the upstream send core, which sends, persists, updates
// the conversation preview and pauses active Flow runs. `SendMessageError`
// from the core propagates; the route maps it like `/api/whatsapp/send`.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendMessageToConversation,
  type SendMessageResult,
} from '@/lib/whatsapp/send-message';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import {
  MessageValidationError,
  prepareMessage,
} from '@/saas/lib/messages/send';
import type { QuickReplyIssue } from './types';
import { messageToSendParams } from './send-params';
import { getQuickReplyItem } from './service';

export type SendQuickReplyResult =
  | { ok: true; value: SendMessageResult }
  | { ok: false; error: 'notFound' | 'inactive' | 'conversationNotFound' }
  | { ok: false; error: 'invalidMessage'; issues: QuickReplyIssue[] }
  | { ok: false; error: 'unsupported' };

export async function sendQuickReplyToConversation(
  db: SupabaseClient,
  accountId: string,
  args: { id: string; conversationId: string; replyToMessageId?: string | null }
): Promise<SendQuickReplyResult> {
  const found = await getQuickReplyItem(db, accountId, args.id);
  if (!found.ok) return { ok: false, error: 'notFound' };
  if (!found.value.is_active) return { ok: false, error: 'inactive' };

  const { data: conversation } = await db
    .from('conversations')
    .select('id, contact:contacts(name, phone)')
    .eq('id', args.conversationId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!conversation) return { ok: false, error: 'conversationNotFound' };
  const raw = (conversation as { contact?: unknown }).contact;
  const contact = (Array.isArray(raw) ? raw[0] : raw) as
    { name?: string | null; phone?: string | null } | null | undefined;

  let prepared;
  try {
    prepared = prepareMessage({
      message: found.value.message,
      contact: contact ?? {},
    });
  } catch (err) {
    if (err instanceof MessageValidationError) {
      return { ok: false, error: 'invalidMessage', issues: err.issues };
    }
    throw err;
  }

  const params = messageToSendParams(prepared);
  if (!params) return { ok: false, error: 'unsupported' };

  const value = await sendMessageToConversation(db, accountId, {
    conversationId: args.conversationId,
    messageType: params.messageType,
    contentText: params.contentText,
    mediaUrl: params.mediaUrl,
    filename: params.filename,
    // The core's slot is typed for upstream interactive payloads; the
    // extension types carry their own shapes (see send-params.ts).
    interactivePayload: params.interactivePayload as InteractiveMessagePayload,
    replyToMessageId: args.replyToMessageId,
  });
  return { ok: true, value };
}
