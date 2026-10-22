// ============================================================
// Suggested (quick) replies — fork-owned shapes.
//
// A reply is a name plus a shared message object (`{ message_type,
// payload }`, see `@/saas/lib/messages`). Replies live in two places:
//   - `saas_quick_replies` (migration 90003): every message type;
//   - upstream `quick_replies` (migration 035): text + reply-button/list
//     snippets, still written by the composer's "Save as quick reply".
// The list endpoint merges both into `QuickReplyItem`s so the UI never
// has to care which table a row came from.
// ============================================================

import type {
  MessageIssue,
  MessageIssueCode,
  MessageObject,
  MessageType,
} from '@/saas/lib/messages/types';

export const QUICK_REPLY_NAME_MAX = 100;

export type QuickReplySource = 'saas' | 'legacy';

/** Row of `saas_quick_replies`. */
export interface SaasQuickReplyRow {
  id: string;
  account_id: string;
  /** Author, for audit only (never used for tenancy). */
  user_id: string | null;
  name: string;
  message_type: MessageType;
  /** Stored Meta send body, minus recipient (the message object's payload). */
  payload: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyItem {
  id: string;
  source: QuickReplySource;
  name: string;
  message_type: MessageType;
  /** Stored form, `{{contact.*}}` tokens intact. */
  message: MessageObject;
  /**
   * The same message with `{{contact.*}}` tokens resolved for the
   * conversation the list was requested for; null when no conversation was
   * given. Fill-in paths that bypass the send route must use this one.
   */
  resolved: MessageObject | null;
  /** One-line summary for list rows. */
  preview: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Issue codes of the message object plus the one this feature adds:
 * `unsupported` marks a message the object can express but this fork cannot
 * send yet (`params.feature`).
 */
export type QuickReplyIssueCode = MessageIssueCode | 'unsupported';

export interface QuickReplyIssue extends Omit<MessageIssue, 'code'> {
  code: QuickReplyIssueCode;
}

export type QuickReplyValidation =
  | { ok: true; message: MessageObject }
  | { ok: false; issues: QuickReplyIssue[] };
