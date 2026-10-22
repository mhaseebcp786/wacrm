// ============================================================
// When does a Welcome & Away rule fire? Pure functions, no I/O.
//
// The webhook gathers two facts about the customer message that just
// arrived — when it was written and when the same customer last wrote before
// it — and these functions decide which (if any) rule sends.
// ============================================================

import type { AutoresponderItem, AutoresponderSchedule } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export interface LocalMoment {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

/** The weekday and clock time of `at` as read on a wall clock in `timeZone`. */
export function localMoment(at: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    // h23: midnight is 00, never the "24" some engines print for h24.
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: WEEKDAY_BY_SHORT_NAME[get('weekday')] ?? 1,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Whether `at` falls on one of the schedule's days and inside its window.
 * The window includes both its `from` and `to` minutes. An overnight window
 * (`from` later than `to`, e.g. 18:00–09:00) belongs to the day it STARTS on:
 * Friday's 18:00–09:00 covers Saturday 02:00, so a Mon–Fri "away" rule also
 * answers Friday night's customers after midnight.
 */
export function isWithinSchedule(
  schedule: AutoresponderSchedule,
  at: Date
): boolean {
  const { weekday, minutes } = localMoment(at, schedule.timezone);
  const from = toMinutes(schedule.from);
  const to = toMinutes(schedule.to);
  if (from === to) return false;

  if (from < to) {
    return minutes >= from && minutes <= to && schedule.days.includes(weekday);
  }
  if (minutes >= from) return schedule.days.includes(weekday);
  if (minutes <= to) {
    const startedOn = weekday === 1 ? 7 : weekday - 1;
    return schedule.days.includes(startedOn);
  }
  return false;
}

export interface FireContext {
  /** When the customer wrote the message being answered. */
  at: Date;
  /** When the same customer wrote before it; null if this is their first. */
  previousCustomerMessageAt: Date | null;
  /** When each rule (by id) last answered this conversation. */
  lastSentAt?: Record<string, Date>;
}

type RuleShape = Pick<
  AutoresponderItem,
  'send_when' | 'interval_days' | 'schedule' | 'is_active'
>;

/**
 * Whether one rule applies to this customer message.
 *
 * - `first_message`: only when the customer has never written before.
 * - `after_inactivity`: their first message, and again once they have been
 *   silent for `interval_days` days.
 * - `every_n_days`: any message, as long as this rule has not answered this
 *   conversation in the last `interval_days` days (an away note reaches a
 *   customer who wrote an hour ago, once).
 */
export function ruleApplies(
  rule: RuleShape & { id?: string },
  ctx: FireContext
): boolean {
  if (!rule.is_active) return false;
  if (rule.schedule) {
    try {
      if (!isWithinSchedule(rule.schedule, ctx.at)) return false;
    } catch {
      // A time zone this server cannot read must silence only its own rule,
      // never the account's other rules.
      return false;
    }
  }

  const days = rule.interval_days ?? 0;
  if (rule.send_when === 'every_n_days') {
    const last = rule.id ? ctx.lastSentAt?.[rule.id] : undefined;
    return !last || ctx.at.getTime() - last.getTime() >= days * DAY_MS;
  }

  const previous = ctx.previousCustomerMessageAt;
  if (previous === null) return true; // their first message: always eligible
  if (rule.send_when === 'first_message') return false;
  return ctx.at.getTime() - previous.getTime() >= days * DAY_MS;
}

/**
 * At most one message goes out per customer message, so when several rules
 * apply the most specific wins: a rule limited to certain hours beats an
 * always-on one, a first-message rule beats the other kinds, and the oldest
 * rule breaks any remaining tie.
 */
export function pickRule<
  T extends RuleShape & { id: string; created_at: string },
>(rules: T[], ctx: FireContext): T | null {
  const rank = (r: T) =>
    (r.schedule ? 0 : 2) + (r.send_when === 'first_message' ? 0 : 1);
  const matching = rules.filter((r) => ruleApplies(r, ctx));
  matching.sort(
    (a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at)
  );
  return matching[0] ?? null;
}
