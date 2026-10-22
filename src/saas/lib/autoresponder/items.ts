// Pure mapping from a stored row to the UI-facing `AutoresponderItem`.
// No I/O, so it is unit-testable and safe in any runtime.

import { messagePreviewText } from '@/saas/lib/messages/preview';
import type { MessageObject } from '@/saas/lib/messages/types';
import type {
  AutoresponderItem,
  AutoresponderSchedule,
  SaasAutoresponderRow,
} from './types';

function previewOf(message: MessageObject): string {
  // A stored payload that no longer matches its type must not take the whole
  // list down.
  try {
    return messagePreviewText(message);
  } catch {
    return `[${message.message_type}]`;
  }
}

function scheduleOf(row: SaasAutoresponderRow): AutoresponderSchedule | null {
  if (
    !row.schedule_days ||
    !row.schedule_from ||
    !row.schedule_to ||
    !row.timezone
  ) {
    return null;
  }
  return {
    days: [...row.schedule_days].sort((a, b) => a - b),
    from: row.schedule_from,
    to: row.schedule_to,
    timezone: row.timezone,
  };
}

export function rowToItem(row: SaasAutoresponderRow): AutoresponderItem {
  const message = {
    message_type: row.message_type,
    payload: row.payload,
  } as MessageObject;
  return {
    id: row.id,
    name: row.name,
    message_type: row.message_type,
    message,
    preview: previewOf(message),
    send_when: row.send_when,
    interval_days: row.interval_days,
    schedule: scheduleOf(row),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
