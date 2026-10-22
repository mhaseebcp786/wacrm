// ============================================================
// The "Send rich message" automation step (server side).
//
// `step_config` IS a shared message object (`{ message_type, payload }`): the
// same nine message types as suggested replies and Welcome & Away messages,
// so an automation can send a photo with buttons, a card carousel, a
// location, … not just text, buttons, a list or a template.
//
// Sent as a bot message through the upstream send core (the same path as the
// Welcome & Away messages). `{{contact.name}}` / `{{contact.phone}}` are
// filled in from the conversation's contact.
// ============================================================

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendAutoresponderMessage } from '@/saas/lib/autoresponder/send';
import { validateQuickReplyMessage } from '@/saas/lib/quick-replies/validate';
import { validateRichMessageStep } from './rich-validate';

export interface RichMessageStepTarget {
  accountId: string;
  conversationId: string;
}

/**
 * Send the step's message into the conversation. Throws (and so fails the
 * step in the run log) when the stored message is no longer valid or the send
 * is refused. Returns the log detail.
 */
export async function runRichMessageStep(
  config: unknown,
  target: RichMessageStepTarget
): Promise<string> {
  const result = validateQuickReplyMessage(config);
  if (!result.ok) {
    throw new Error(
      validateRichMessageStep(config, 'message')
        .map((i) => i.message)
        .join('; ')
    );
  }
  const sent = await sendAutoresponderMessage(
    supabaseAdmin(),
    target.accountId,
    target.conversationId,
    result.message
  );
  return `${result.message.message_type} sent via Meta (${sent.whatsappMessageId})`;
}
