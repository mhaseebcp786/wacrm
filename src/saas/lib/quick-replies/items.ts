// Pure mapping from stored rows (both tables) to the UI-facing
// `QuickReplyItem`. No I/O, so it is unit-testable and safe in any runtime.

import { messagePreviewText } from '@/saas/lib/messages/preview';
import { personalizeMessage } from '@/saas/lib/messages/tokens';
import type { ContactTokens, MessageObject } from '@/saas/lib/messages/types';
import type { QuickReply } from '@/types';
import { legacyQuickReplyToMessage } from './legacy';
import type { QuickReplyItem, SaasQuickReplyRow } from './types';

function previewOf(message: MessageObject): string {
  // A stored payload that no longer matches its type (hand-edited row, a
  // limit change) must not take the whole list down.
  try {
    return messagePreviewText(message);
  } catch {
    return `[${message.message_type}]`;
  }
}

function resolve(
  message: MessageObject,
  contact: ContactTokens | null
): MessageObject | null {
  if (!contact) return null;
  try {
    return personalizeMessage(message, contact);
  } catch {
    return null;
  }
}

export function saasRowToItem(
  row: SaasQuickReplyRow,
  contact: ContactTokens | null = null
): QuickReplyItem {
  const message = {
    message_type: row.message_type,
    payload: row.payload,
  } as MessageObject;
  return {
    id: row.id,
    source: 'saas',
    name: row.name,
    message_type: row.message_type,
    message,
    resolved: resolve(message, contact),
    preview: previewOf(message),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Null when the upstream row has no usable content (it is then skipped). */
export function legacyRowToItem(
  row: QuickReply,
  contact: ContactTokens | null = null
): QuickReplyItem | null {
  const message = legacyQuickReplyToMessage(row);
  if (!message) return null;
  return {
    id: row.id,
    source: 'legacy',
    name: row.title,
    message_type: message.message_type,
    message,
    resolved: resolve(message, contact),
    preview: previewOf(message),
    // Upstream has no switch: its rows are always offered.
    is_active: true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Newest first, like both upstream and the reference app's list. */
export function mergeQuickReplyItems(
  saas: SaasQuickReplyRow[],
  legacy: QuickReply[],
  contact: ContactTokens | null = null
): QuickReplyItem[] {
  const items: QuickReplyItem[] = saas.map((r) => saasRowToItem(r, contact));
  for (const r of legacy) {
    const item = legacyRowToItem(r, contact);
    if (item) items.push(item);
  }
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
