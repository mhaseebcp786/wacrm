// ============================================================
// Builder helpers for the "Send rich message" step (client-safe, pure).
// ============================================================

import { messagePreviewText } from '@/saas/lib/messages/preview';
import type { MessageObject } from '@/saas/lib/messages/types';
import { isMessageType } from '@/saas/lib/messages/types';

/** A new step starts as an empty text message. */
export function blankRichMessageConfig(): Record<string, unknown> {
  return {
    message_type: 'text',
    payload: { type: 'text', text: { body: '' } },
  };
}

/** True when `config` has the `{ message_type, payload }` shape at all. */
export function looksLikeMessageObject(
  config: unknown
): config is MessageObject {
  return (
    !!config &&
    typeof config === 'object' &&
    isMessageType((config as { message_type?: unknown }).message_type) &&
    !!(config as { payload?: unknown }).payload
  );
}

/** One-line summary for the step card; '' when there is nothing to show yet. */
export function richMessagePreview(config: unknown): string {
  if (!looksLikeMessageObject(config)) return '';
  try {
    return messagePreviewText(config);
  } catch {
    return '';
  }
}
