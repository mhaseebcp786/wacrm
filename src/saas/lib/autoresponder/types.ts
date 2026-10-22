// ============================================================
// Welcome & Away Messages (the "autoresponder") — fork-owned shapes.
//
// A rule is a name + a shared message object (`{ message_type, payload }`,
// see `@/saas/lib/messages`) + WHEN to send it:
//   - `first_message`: the customer's very first message;
//   - `after_inactivity`: their first message, and again whenever they come
//     back after `interval_days` days of silence ("welcome back");
//   - `every_n_days`: whenever they write, at most once every `interval_days`
//     days (an away note: customers who wrote an hour ago still get it);
// optionally limited to some weekdays and a time window in a time zone.
//
// It is NOT an Automation (multi-step rules) and NOT the AI reply: it sends
// exactly one fixed message, with no agent involved.
// ============================================================

import type { MessageObject, MessageType } from '@/saas/lib/messages/types';
import type { QuickReplyIssue } from '@/saas/lib/quick-replies/types';

export const AUTORESPONDER_NAME_MAX = 100;
export const INTERVAL_DAYS_MIN = 1;
export const INTERVAL_DAYS_MAX = 90;

export const SEND_WHEN_VALUES = [
  'first_message',
  'after_inactivity',
  'every_n_days',
] as const;
export type SendWhen = (typeof SEND_WHEN_VALUES)[number];

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Days and hours a rule is limited to. `from`/`to` are `HH:MM`, inclusive. */
export interface AutoresponderSchedule {
  /** ISO weekdays, sorted and unique. For an overnight window (`from` later
   *  than `to`) a day is the day the window STARTS on. */
  days: number[];
  from: string;
  to: string;
  /** IANA time zone the days and hours are read in. */
  timezone: string;
}

/** Row of `saas_autoresponders`. */
export interface SaasAutoresponderRow {
  id: string;
  account_id: string;
  /** Author, for audit only (never used for tenancy). */
  user_id: string | null;
  name: string;
  message_type: MessageType;
  /** Stored Meta send body, minus recipient (the message object's payload). */
  payload: unknown;
  send_when: SendWhen;
  interval_days: number | null;
  schedule_days: number[] | null;
  schedule_from: string | null;
  schedule_to: string | null;
  timezone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutoresponderItem {
  id: string;
  name: string;
  message_type: MessageType;
  message: MessageObject;
  /** One-line summary of the message for list rows. */
  preview: string;
  send_when: SendWhen;
  /** Set only for `after_inactivity` (days of silence) and `every_n_days`. */
  interval_days: number | null;
  /** Null when the rule is not limited to certain days/hours. */
  schedule: AutoresponderSchedule | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** The fields a rule is created/replaced with, already validated. */
export interface AutoresponderInput {
  name: string;
  message: MessageObject;
  send_when: SendWhen;
  interval_days: number | null;
  schedule: AutoresponderSchedule | null;
}

export type AutoresponderErrorCode =
  | 'nameRequired'
  | 'nameTooLong'
  | 'sendWhenInvalid'
  | 'intervalInvalid'
  | 'daysRequired'
  | 'daysInvalid'
  | 'timeInvalid'
  | 'timesEqual'
  | 'timezoneInvalid'
  | 'invalidMessage';

export interface AutoresponderError {
  code: AutoresponderErrorCode;
  /** Message-object problems, for `invalidMessage`. */
  issues?: QuickReplyIssue[];
}

export type AutoresponderValidation =
  | { ok: true; value: AutoresponderInput }
  | { ok: false; errors: AutoresponderError[] };
