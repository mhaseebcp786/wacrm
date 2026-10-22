// ============================================================
// Send a Welcome & Away message into a conversation (server only).
//
// Fill `{{contact.*}}` from the conversation's contact (always: a token must
// never reach the customer literally) → validate → hand the result to the
// upstream send core as a BOT message. The core sends, persists, updates the
// conversation preview; `senderType: 'bot'` stores it like any other bot
// message (the dashboard's "agent messages" counts skip it) and leaves any active Flow run alone — an automatic greeting is not an
// agent stepping in. (The dashboard's average response time pairs a customer
// message with the next agent OR bot message, as it does for Flow and
// automation replies, so a greeting counts as a fast first response there.)
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import {
  sendMessageToConversation,
  type SendMessageResult,
} from '@/lib/whatsapp/send-message';
import type { ContactTokens, MessageObject } from '@/saas/lib/messages/types';
import { prepareMessage } from '@/saas/lib/messages/send';
import { messageToSendParams } from '@/saas/lib/quick-replies/send-params';

/** The message cannot be delivered by this fork (e.g. a WhatsApp Flow button). */
export class UnsupportedMessageError extends Error {
  constructor() {
    super('This message type cannot be sent automatically');
    this.name = 'UnsupportedMessageError';
  }
}

/** The conversation's contact, for `{{contact.*}}` resolution. */
async function contactTokens(
  db: SupabaseClient,
  accountId: string,
  conversationId: string
): Promise<ContactTokens> {
  const { data } = await db
    .from('conversations')
    .select('contact:contacts(name, phone)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle();
  const raw = (data as { contact?: unknown } | null)?.contact;
  const contact = (Array.isArray(raw) ? raw[0] : raw) as
    { name?: string | null; phone?: string | null } | null | undefined;
  return contact ? { name: contact.name, phone: contact.phone } : {};
}

/**
 * Throws `MessageValidationError` (stored message no longer valid),
 * `UnsupportedMessageError`, or the core's `SendMessageError`.
 */
export async function sendAutoresponderMessage(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  message: MessageObject
): Promise<SendMessageResult> {
  const prepared = prepareMessage({
    message,
    contact: await contactTokens(db, accountId, conversationId),
  });
  const params = messageToSendParams(prepared);
  if (!params) throw new UnsupportedMessageError();

  return sendMessageToConversation(db, accountId, {
    conversationId,
    messageType: params.messageType,
    contentText: params.contentText,
    mediaUrl: params.mediaUrl,
    filename: params.filename,
    // The core's slot is typed for upstream interactive payloads; the
    // extension types carry their own shapes (see send-params.ts).
    interactivePayload: params.interactivePayload as InteractiveMessagePayload,
    senderType: 'bot',
  });
}
