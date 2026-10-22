// ============================================================
// Save-time validation for a Welcome & Away rule. Pure and client-safe: the
// dialog runs it before posting and the service runs it again on the server.
// ============================================================

import { validateQuickReplyMessage } from '@/saas/lib/quick-replies/validate';
import {
  AUTORESPONDER_NAME_MAX,
  INTERVAL_DAYS_MAX,
  INTERVAL_DAYS_MIN,
  ISO_WEEKDAYS,
  SEND_WHEN_VALUES,
  type AutoresponderError,
  type AutoresponderSchedule,
  type AutoresponderValidation,
  type SendWhen,
} from './types';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Whether `Intl` knows the IANA time zone (it throws a RangeError if not). */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isSendWhen(value: unknown): value is SendWhen {
  return (SEND_WHEN_VALUES as readonly unknown[]).includes(value);
}

/** Normalise stored/posted days: unique, sorted. Null if any is not 1..7. */
function normaliseDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = new Set<number>();
  for (const d of raw) {
    if (!(ISO_WEEKDAYS as readonly unknown[]).includes(d)) return null;
    days.add(d as number);
  }
  return [...days].sort((a, b) => a - b);
}

function checkSchedule(
  raw: unknown,
  errors: AutoresponderError[]
): AutoresponderSchedule | null {
  if (raw === null || raw === undefined) return null;
  const s = raw as Record<string, unknown>;
  if (typeof raw !== 'object') {
    errors.push({ code: 'daysInvalid' });
    return null;
  }
  const before = errors.length;

  const days = normaliseDays(s.days);
  if (days === null) errors.push({ code: 'daysInvalid' });
  else if (days.length === 0) errors.push({ code: 'daysRequired' });

  if (!isValidTime(s.from) || !isValidTime(s.to)) {
    errors.push({ code: 'timeInvalid' });
  } else if (s.from === s.to) {
    errors.push({ code: 'timesEqual' });
  }
  if (!isValidTimeZone(s.timezone)) errors.push({ code: 'timezoneInvalid' });

  if (errors.length > before) return null;
  return {
    days: days as number[],
    from: s.from as string,
    to: s.to as string,
    timezone: (s.timezone as string).trim(),
  };
}

export interface AutoresponderCandidate {
  name?: unknown;
  message?: unknown;
  send_when?: unknown;
  interval_days?: unknown;
  schedule?: unknown;
}

/**
 * Validate a complete rule. `errors` lists every problem (so the dialog can
 * show them all), in the order the form presents the fields.
 */
export function validateAutoresponder(
  input: AutoresponderCandidate
): AutoresponderValidation {
  const errors: AutoresponderError[] = [];

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) errors.push({ code: 'nameRequired' });
  else if (name.length > AUTORESPONDER_NAME_MAX) {
    errors.push({ code: 'nameTooLong' });
  }

  let sendWhen: SendWhen = 'first_message';
  if (isSendWhen(input.send_when)) sendWhen = input.send_when;
  else errors.push({ code: 'sendWhenInvalid' });

  let intervalDays: number | null = null;
  if (sendWhen === 'after_inactivity' || sendWhen === 'every_n_days') {
    const d = input.interval_days;
    if (
      typeof d === 'number' &&
      Number.isInteger(d) &&
      d >= INTERVAL_DAYS_MIN &&
      d <= INTERVAL_DAYS_MAX
    ) {
      intervalDays = d;
    } else {
      errors.push({ code: 'intervalInvalid' });
    }
  }

  const schedule = checkSchedule(input.schedule, errors);

  const message = validateQuickReplyMessage(input.message);
  if (!message.ok) {
    errors.push({ code: 'invalidMessage', issues: message.issues });
  }

  if (errors.length > 0 || !message.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      message: message.message,
      send_when: sendWhen,
      interval_days: intervalDays,
      schedule,
    },
  };
}
