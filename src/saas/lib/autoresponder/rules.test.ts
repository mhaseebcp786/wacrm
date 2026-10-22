import { describe, expect, it } from 'vitest';

import { isWithinSchedule, localMoment, pickRule, ruleApplies } from './rules';
import type { AutoresponderSchedule, SendWhen } from './types';

const DAY = 24 * 60 * 60 * 1000;

// 2026-03-02 is a Monday. UTC instants below are chosen per time zone.
const utc = (iso: string) => new Date(iso);

const weekdays = (days: number[], from: string, to: string, timezone = 'UTC') =>
  ({ days, from, to, timezone }) satisfies AutoresponderSchedule;

describe('localMoment', () => {
  it('reads the weekday and clock time on the wall clock of the zone', () => {
    // Mon 2026-03-02 23:30 UTC is already Tue 05:00 in Kolkata (+05:30).
    expect(localMoment(utc('2026-03-02T23:30:00Z'), 'Asia/Kolkata')).toEqual({
      weekday: 2,
      minutes: 5 * 60,
    });
    expect(localMoment(utc('2026-03-02T23:30:00Z'), 'UTC')).toEqual({
      weekday: 1,
      minutes: 23 * 60 + 30,
    });
  });

  it('prints midnight as 0, not 24', () => {
    expect(localMoment(utc('2026-03-02T00:00:00Z'), 'UTC').minutes).toBe(0);
  });

  it('numbers Sunday 7', () => {
    expect(localMoment(utc('2026-03-08T12:00:00Z'), 'UTC').weekday).toBe(7);
  });

  it('follows daylight saving of the zone', () => {
    // New York is UTC-5 in winter and UTC-4 after 2026-03-08.
    expect(
      localMoment(utc('2026-03-02T15:00:00Z'), 'America/New_York')
    ).toEqual({ weekday: 1, minutes: 10 * 60 });
    expect(
      localMoment(utc('2026-03-09T15:00:00Z'), 'America/New_York')
    ).toEqual({ weekday: 1, minutes: 11 * 60 });
  });
});

describe('isWithinSchedule — daytime window', () => {
  const office = weekdays([1, 2, 3, 4, 5], '09:00', '18:00');

  it('is true inside the window on a listed day, both ends included', () => {
    expect(isWithinSchedule(office, utc('2026-03-02T09:00:00Z'))).toBe(true);
    expect(isWithinSchedule(office, utc('2026-03-02T13:00:00Z'))).toBe(true);
    expect(isWithinSchedule(office, utc('2026-03-02T18:00:00Z'))).toBe(true);
  });

  it('is false outside the window', () => {
    expect(isWithinSchedule(office, utc('2026-03-02T08:59:00Z'))).toBe(false);
    expect(isWithinSchedule(office, utc('2026-03-02T18:01:00Z'))).toBe(false);
  });

  it('is false on a day that is not listed', () => {
    // Saturday
    expect(isWithinSchedule(office, utc('2026-03-07T13:00:00Z'))).toBe(false);
  });

  it('reads the hours in the rule’s own time zone', () => {
    const kolkata = weekdays([1], '09:00', '18:00', 'Asia/Kolkata');
    // 04:00 UTC = 09:30 Kolkata on Monday.
    expect(isWithinSchedule(kolkata, utc('2026-03-02T04:00:00Z'))).toBe(true);
    // 13:00 UTC = 18:30 Kolkata: after the window.
    expect(isWithinSchedule(kolkata, utc('2026-03-02T13:00:00Z'))).toBe(false);
  });

  it('covers a whole day with 00:00–23:59', () => {
    const all = weekdays([1, 2, 3, 4, 5, 6, 7], '00:00', '23:59');
    expect(isWithinSchedule(all, utc('2026-03-02T00:00:00Z'))).toBe(true);
    expect(isWithinSchedule(all, utc('2026-03-02T23:59:00Z'))).toBe(true);
  });

  it('is false for a zero-length window', () => {
    expect(
      isWithinSchedule(
        weekdays([1], '10:00', '10:00'),
        utc('2026-03-02T10:00:00Z')
      )
    ).toBe(false);
  });
});

describe('isWithinSchedule — overnight window', () => {
  // "Away" every weekday night: 18:00 → 09:00.
  const away = weekdays([1, 2, 3, 4, 5], '18:00', '09:00');

  it('covers the evening of a listed day', () => {
    expect(isWithinSchedule(away, utc('2026-03-02T20:00:00Z'))).toBe(true); // Mon
  });

  it('covers the early morning that follows a listed day', () => {
    // Tuesday 02:00 belongs to Monday’s window.
    expect(isWithinSchedule(away, utc('2026-03-03T02:00:00Z'))).toBe(true);
    // Saturday 02:00 belongs to Friday’s window — still “Friday night”.
    expect(isWithinSchedule(away, utc('2026-03-07T02:00:00Z'))).toBe(true);
  });

  it('does not cover the early morning after an unlisted day', () => {
    // Sunday 02:00 belongs to Saturday’s window; Saturday is not listed.
    expect(isWithinSchedule(away, utc('2026-03-08T02:00:00Z'))).toBe(false);
    // Monday 02:00 belongs to Sunday’s window.
    expect(isWithinSchedule(away, utc('2026-03-02T02:00:00Z'))).toBe(false);
  });

  it('does not cover the working day in between', () => {
    expect(isWithinSchedule(away, utc('2026-03-02T12:00:00Z'))).toBe(false);
  });

  it('wraps Monday’s early morning back to Sunday', () => {
    const sundayNight = weekdays([7], '22:00', '06:00');
    expect(isWithinSchedule(sundayNight, utc('2026-03-02T03:00:00Z'))).toBe(
      true
    );
  });
});

describe('ruleApplies', () => {
  const at = utc('2026-03-02T12:00:00Z');
  const rule = (
    send_when: SendWhen,
    extra: Partial<Parameters<typeof ruleApplies>[0]> = {}
  ) => ({
    send_when,
    interval_days: send_when === 'after_inactivity' ? 3 : null,
    schedule: null,
    is_active: true,
    ...extra,
  });

  it('never fires a switched-off rule', () => {
    expect(
      ruleApplies(rule('first_message', { is_active: false }), {
        at,
        previousCustomerMessageAt: null,
      })
    ).toBe(false);
  });

  it('fires both kinds on the customer’s first message', () => {
    const ctx = { at, previousCustomerMessageAt: null };
    expect(ruleApplies(rule('first_message'), ctx)).toBe(true);
    expect(ruleApplies(rule('after_inactivity'), ctx)).toBe(true);
  });

  it('first_message never fires again for a returning customer', () => {
    const ctx = {
      at,
      previousCustomerMessageAt: new Date(at.getTime() - 365 * DAY),
    };
    expect(ruleApplies(rule('first_message'), ctx)).toBe(false);
  });

  it('after_inactivity fires once the silence reaches N days, not before', () => {
    const r = rule('after_inactivity'); // 3 days
    const prev = (days: number) => new Date(at.getTime() - days * DAY);
    expect(ruleApplies(r, { at, previousCustomerMessageAt: prev(2.99) })).toBe(
      false
    );
    expect(ruleApplies(r, { at, previousCustomerMessageAt: prev(3) })).toBe(
      true
    );
    expect(ruleApplies(r, { at, previousCustomerMessageAt: prev(30) })).toBe(
      true
    );
  });

  it('does not fire a chatting customer even when the rule has hours', () => {
    const r = rule('after_inactivity');
    expect(
      ruleApplies(r, {
        at,
        previousCustomerMessageAt: new Date(at.getTime() - 60_000),
      })
    ).toBe(false);
  });

  it('also requires the schedule to match', () => {
    const night = rule('first_message', {
      schedule: weekdays([1], '18:00', '23:00'),
    });
    expect(ruleApplies(night, { at, previousCustomerMessageAt: null })).toBe(
      false
    );
    expect(
      ruleApplies(night, {
        at: utc('2026-03-02T19:00:00Z'),
        previousCustomerMessageAt: null,
      })
    ).toBe(true);
  });
});

describe('pickRule', () => {
  const at = utc('2026-03-02T20:00:00Z'); // Monday evening
  const ctx = { at, previousCustomerMessageAt: null };
  const make = (
    id: string,
    send_when: SendWhen,
    created_at: string,
    schedule: AutoresponderSchedule | null = null
  ) => ({
    id,
    send_when,
    interval_days: send_when === 'after_inactivity' ? 1 : null,
    schedule,
    is_active: true,
    created_at,
  });

  it('returns null when nothing applies', () => {
    expect(pickRule([], ctx)).toBeNull();
    expect(
      pickRule(
        [
          make(
            'a',
            'first_message',
            '2026-01-01',
            weekdays([2], '00:00', '23:59')
          ),
        ],
        ctx
      )
    ).toBeNull();
  });

  it('prefers a rule limited to certain hours over an always-on one', () => {
    const welcome = make('welcome', 'first_message', '2026-01-01');
    const away = make(
      'away',
      'first_message',
      '2026-02-01',
      weekdays([1], '18:00', '23:00')
    );
    expect(pickRule([welcome, away], ctx)?.id).toBe('away');
  });

  it('prefers first_message over welcome-back when both are always-on', () => {
    const back = make('back', 'after_inactivity', '2026-01-01');
    const first = make('first', 'first_message', '2026-02-01');
    expect(pickRule([back, first], ctx)?.id).toBe('first');
  });

  it('breaks a remaining tie with the oldest rule', () => {
    const newer = make('newer', 'first_message', '2026-02-01');
    const older = make('older', 'first_message', '2026-01-01');
    expect(pickRule([newer, older], ctx)?.id).toBe('older');
  });

  it('ignores a more specific rule that does not apply right now', () => {
    const welcome = make('welcome', 'first_message', '2026-01-01');
    const morningOnly = make(
      'morning',
      'first_message',
      '2026-01-02',
      weekdays([1], '06:00', '09:00')
    );
    expect(pickRule([welcome, morningOnly], ctx)?.id).toBe('welcome');
  });
});

describe('every_n_days (away note)', () => {
  const at = utc('2026-03-02T22:00:00Z'); // Monday evening
  const away = (extra: Record<string, unknown> = {}) => ({
    id: 'away',
    send_when: 'every_n_days' as SendWhen,
    interval_days: 3,
    schedule: null,
    is_active: true,
    ...extra,
  });
  const ctx = (
    previous: Date | null,
    lastSentAt: Record<string, Date> = {}
  ) => ({ at, previousCustomerMessageAt: previous, lastSentAt });

  it('reaches a customer who wrote an hour ago, because it counts sends, not silence', () => {
    const hourAgo = new Date(at.getTime() - 3_600_000);
    expect(ruleApplies(away(), ctx(hourAgo))).toBe(true);
  });

  it('does not repeat until the interval has passed since its own last send', () => {
    const sent = (days: number) => ({
      away: new Date(at.getTime() - days * DAY),
    });
    expect(ruleApplies(away(), ctx(null, sent(2.9)))).toBe(false);
    expect(ruleApplies(away(), ctx(null, sent(3)))).toBe(true);
    expect(ruleApplies(away(), ctx(null, sent(10)))).toBe(true);
  });

  it('only counts its own sends, not another rule’s', () => {
    expect(ruleApplies(away(), ctx(null, { other: new Date(at) }))).toBe(true);
  });

  it('still needs the schedule to match', () => {
    const morning = away({ schedule: weekdays([1], '06:00', '09:00') });
    expect(ruleApplies(morning, ctx(null))).toBe(false);
  });

  it('a switched-off rule never applies', () => {
    expect(ruleApplies(away({ is_active: false }), ctx(null))).toBe(false);
  });
});

describe('a time zone this server cannot read', () => {
  it('silences only its own rule, never the others', () => {
    const at = utc('2026-03-02T12:00:00Z');
    const broken = {
      id: 'broken',
      send_when: 'first_message' as SendWhen,
      interval_days: null,
      schedule: weekdays([1], '00:00', '23:59', 'Not/AZone'),
      is_active: true,
      created_at: '2026-01-01',
    };
    const fine = {
      id: 'fine',
      send_when: 'first_message' as SendWhen,
      interval_days: null,
      schedule: null,
      is_active: true,
      created_at: '2026-02-01',
    };
    expect(() =>
      pickRule([broken, fine], { at, previousCustomerMessageAt: null })
    ).not.toThrow();
    expect(
      pickRule([broken, fine], { at, previousCustomerMessageAt: null })?.id
    ).toBe('fine');
  });
});
