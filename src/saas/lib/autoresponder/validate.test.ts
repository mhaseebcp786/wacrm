import { describe, expect, it } from 'vitest';

import {
  isValidTime,
  isValidTimeZone,
  validateAutoresponder,
} from './validate';

const message = {
  message_type: 'text',
  payload: {
    type: 'text',
    text: { body: 'Hello {{contact.name}}, thanks for writing to us.' },
  },
};

const base = {
  name: 'Welcome',
  message,
  send_when: 'first_message',
  schedule: null,
};

const codes = (input: Parameters<typeof validateAutoresponder>[0]) => {
  const r = validateAutoresponder(input);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe('isValidTime / isValidTimeZone', () => {
  it('accepts HH:MM only', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('09:00:00')).toBe(false);
    expect(isValidTime(900)).toBe(false);
  });

  it('accepts IANA zones Intl knows and rejects the rest', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe('validateAutoresponder', () => {
  it('accepts a first-message rule and trims the name', () => {
    const r = validateAutoresponder({ ...base, name: '  Welcome  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Welcome');
      expect(r.value.send_when).toBe('first_message');
      expect(r.value.interval_days).toBeNull();
      expect(r.value.schedule).toBeNull();
    }
  });

  it('accepts any shared message type, e.g. an image', () => {
    expect(
      validateAutoresponder({ ...base, message: SAMPLE_IMAGE_MESSAGE }).ok
    ).toBe(true);
  });

  it('requires a name of at most 100 characters', () => {
    expect(codes({ ...base, name: '   ' })).toEqual(['nameRequired']);
    expect(codes({ ...base, name: undefined })).toEqual(['nameRequired']);
    expect(codes({ ...base, name: 'x'.repeat(101) })).toEqual(['nameTooLong']);
    expect(validateAutoresponder({ ...base, name: 'x'.repeat(100) }).ok).toBe(
      true
    );
  });

  it('rejects an unknown send_when', () => {
    expect(codes({ ...base, send_when: 'always' })).toEqual([
      'sendWhenInvalid',
    ]);
  });

  describe('welcome back', () => {
    const back = { ...base, send_when: 'after_inactivity' };

    it('needs a whole number of days from 1 to 90', () => {
      for (const days of [undefined, 0, 91, 1.5, '3', null, NaN]) {
        expect(codes({ ...back, interval_days: days })).toEqual([
          'intervalInvalid',
        ]);
      }
      for (const days of [1, 30, 90]) {
        const r = validateAutoresponder({ ...back, interval_days: days });
        expect(r.ok && r.value.interval_days).toBe(days);
      }
    });

    it('ignores a stray day count on a first-message rule', () => {
      const r = validateAutoresponder({ ...base, interval_days: 7 });
      expect(r.ok && r.value.interval_days).toBeNull();
    });
  });

  describe('schedule', () => {
    const ok = {
      days: [5, 1, 1, 3],
      from: '18:00',
      to: '09:00',
      timezone: 'Asia/Kolkata',
    };

    it('normalises days to unique and sorted', () => {
      const r = validateAutoresponder({ ...base, schedule: ok });
      expect(r.ok && r.value.schedule).toEqual({
        ...ok,
        days: [1, 3, 5],
      });
    });

    it('needs at least one day', () => {
      expect(codes({ ...base, schedule: { ...ok, days: [] } })).toEqual([
        'daysRequired',
      ]);
    });

    it('rejects weekdays outside 1..7 and non-arrays', () => {
      expect(codes({ ...base, schedule: { ...ok, days: [0] } })).toEqual([
        'daysInvalid',
      ]);
      expect(codes({ ...base, schedule: { ...ok, days: [8] } })).toEqual([
        'daysInvalid',
      ]);
      expect(codes({ ...base, schedule: { ...ok, days: 'mon' } })).toEqual([
        'daysInvalid',
      ]);
    });

    it('rejects malformed or identical times', () => {
      expect(codes({ ...base, schedule: { ...ok, from: '6pm' } })).toEqual([
        'timeInvalid',
      ]);
      expect(codes({ ...base, schedule: { ...ok, to: '' } })).toEqual([
        'timeInvalid',
      ]);
      expect(
        codes({ ...base, schedule: { ...ok, from: '09:00', to: '09:00' } })
      ).toEqual(['timesEqual']);
    });

    it('rejects an unknown time zone', () => {
      expect(
        codes({ ...base, schedule: { ...ok, timezone: 'Nowhere/City' } })
      ).toEqual(['timezoneInvalid']);
    });

    it('reports every problem at once, in form order', () => {
      expect(
        codes({
          name: '',
          message,
          send_when: 'after_inactivity',
          schedule: { days: [], from: 'x', to: 'y', timezone: 'Nope' },
        })
      ).toEqual([
        'nameRequired',
        'intervalInvalid',
        'daysRequired',
        'timeInvalid',
        'timezoneInvalid',
      ]);
    });
  });

  describe('message', () => {
    it('reports the message-object problems', () => {
      const r = validateAutoresponder({
        ...base,
        message: {
          message_type: 'text',
          payload: { type: 'text', text: { body: '' } },
        },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors).toHaveLength(1);
        expect(r.errors[0].code).toBe('invalidMessage');
        expect(r.errors[0].issues?.length).toBeGreaterThan(0);
      }
    });

    it('rejects a WhatsApp Flow button (cannot be delivered yet)', () => {
      const r = validateAutoresponder({
        ...base,
        message: {
          message_type: 'interactive',
          payload: {
            type: 'interactive',
            interactive: {
              type: 'flow',
              body: { text: 'Fill the form' },
              action: {
                name: 'flow',
                parameters: { flow_id: '1', flow_cta: 'Open' },
              },
            },
          },
        },
      });
      expect(r.ok).toBe(false);
    });

    it('rejects a contact token inside a link', () => {
      const r = validateAutoresponder({
        ...base,
        message: {
          message_type: 'interactive',
          payload: {
            type: 'interactive',
            interactive: {
              type: 'cta_url',
              body: { text: 'Open' },
              action: {
                name: 'cta_url',
                parameters: {
                  display_text: 'Go',
                  url: 'https://example.com/?n={{contact.name}}',
                },
              },
            },
          },
        },
      });
      expect(r.ok).toBe(false);
    });
  });
});

const SAMPLE_IMAGE_MESSAGE = {
  message_type: 'image',
  payload: {
    type: 'image',
    image: { link: 'https://example.com/a.jpg', caption: 'Hi' },
  },
};

describe('every_n_days', () => {
  const every = { ...base, send_when: 'every_n_days' };

  it('needs a whole number of days from 1 to 90, like welcome-back', () => {
    for (const days of [undefined, 0, 91, 2.5, '3']) {
      expect(codes({ ...every, interval_days: days })).toEqual([
        'intervalInvalid',
      ]);
    }
    const r = validateAutoresponder({ ...every, interval_days: 3 });
    expect(r.ok && r.value.send_when).toBe('every_n_days');
    expect(r.ok && r.value.interval_days).toBe(3);
  });
});
