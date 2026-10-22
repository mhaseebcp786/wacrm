import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

import { scheduleSummary, whenSummary } from './summary';

const load = (locale: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
  );

const translator = (locale: string) =>
  createTranslator({
    locale,
    messages: load(locale),
    namespace: 'SaasAutoresponder',
  }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

describe('whenSummary (English)', () => {
  const t = translator('en');

  it('says “first message only” for a welcome rule', () => {
    expect(
      whenSummary({ send_when: 'first_message', interval_days: null }, t)
    ).toBe('First message only');
  });

  it('names the quiet period of a welcome-back rule, singular and plural', () => {
    expect(
      whenSummary({ send_when: 'after_inactivity', interval_days: 30 }, t)
    ).toBe('First message, and after 30 days of silence');
    expect(
      whenSummary({ send_when: 'after_inactivity', interval_days: 1 }, t)
    ).toBe('First message, and after 1 day of silence');
  });
});

describe('scheduleSummary (English)', () => {
  const t = translator('en');

  it('is null for a rule that is not limited to certain times', () => {
    expect(scheduleSummary(null, t)).toBeNull();
  });

  it('lists the days in order, with the window and the zone', () => {
    expect(
      scheduleSummary(
        {
          days: [1, 2, 3],
          from: '18:00',
          to: '09:00',
          timezone: 'Asia/Kolkata',
        },
        t
      )
    ).toBe('Mon, Tue, Wed, 18:00–09:00 (Asia/Kolkata)');
  });

  it('says “Every day” when all seven are ticked', () => {
    expect(
      scheduleSummary(
        {
          days: [1, 2, 3, 4, 5, 6, 7],
          from: '00:00',
          to: '23:59',
          timezone: 'UTC',
        },
        t
      )
    ).toBe('Every day, 00:00–23:59 (UTC)');
  });
});

describe.each(['en', 'es', 'pt', 'ko'])(
  'every message renders in %s',
  (locale) => {
    const t = translator(locale);

    it('renders all summaries, day names and errors without ICU errors', () => {
      expect(
        whenSummary({ send_when: 'after_inactivity', interval_days: 12 }, t)
      ).toContain('12');
      expect(
        whenSummary({ send_when: 'first_message', interval_days: null }, t)
      ).not.toBe('');
      const s = scheduleSummary(
        { days: [1, 7], from: '09:00', to: '17:30', timezone: 'UTC' },
        t
      );
      expect(s).toContain('09:00');
      expect(s).toContain('17:30');
      for (const day of [1, 2, 3, 4, 5, 6, 7]) {
        expect(t(`days.${day}`)).not.toContain('days.');
      }
      expect(t('intervalOption', { count: 1 })).toContain('1');
      expect(t('intervalOption', { count: 90 })).toContain('90');
      expect(t('errors.nameTooLong', { max: 100 })).toContain('100');
      expect(t('errors.intervalInvalid', { min: 1, max: 90 })).toMatch(/1.*90/);
    });
  }
);

describe('whenSummary for “once every N days”', () => {
  it('says so in plain English, singular and plural', () => {
    const t = translator('en');
    expect(
      whenSummary({ send_when: 'every_n_days', interval_days: 3 }, t)
    ).toBe('At most once every 3 days');
    expect(
      whenSummary({ send_when: 'every_n_days', interval_days: 1 }, t)
    ).toBe('At most once every 1 day');
  });

  it.each(['es', 'pt', 'ko'])('renders in %s', (locale) => {
    const t = translator(locale);
    expect(
      whenSummary({ send_when: 'every_n_days', interval_days: 7 }, t)
    ).toContain('7');
  });
});
