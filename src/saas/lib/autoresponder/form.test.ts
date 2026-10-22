import { describe, expect, it } from 'vitest';

import { rowToItem } from './items';
import {
  DEFAULT_INACTIVITY_DAYS,
  browserTimeZone,
  emptyRuleForm,
  formToCandidate,
  itemToForm,
  timeZoneOptions,
} from './form';
import type { SaasAutoresponderRow } from './types';
import { validateAutoresponder } from './validate';

const row = (
  over: Partial<SaasAutoresponderRow> = {}
): SaasAutoresponderRow => ({
  id: 'r1',
  account_id: 'a1',
  user_id: 'u1',
  name: 'Welcome',
  message_type: 'text',
  payload: { type: 'text', text: { body: 'Hello!' } },
  send_when: 'first_message',
  interval_days: null,
  schedule_days: null,
  schedule_from: null,
  schedule_to: null,
  timezone: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('emptyRuleForm', () => {
  it('starts as a first-message rule with nothing limiting it', () => {
    const form = emptyRuleForm('Asia/Kolkata');
    expect(form).toMatchObject({
      name: '',
      sendWhen: 'first_message',
      intervalDays: DEFAULT_INACTIVITY_DAYS,
      scheduleEnabled: false,
      days: [1, 2, 3, 4, 5, 6, 7],
      timezone: 'Asia/Kolkata',
    });
    expect(form.editor.type).toBe('text');
  });

  it('defaults the time zone to the viewer’s own', () => {
    expect(emptyRuleForm().timezone).toBe(browserTimeZone());
  });
});

describe('formToCandidate', () => {
  it('emits no schedule and no day count for a plain welcome rule', () => {
    const form = { ...emptyRuleForm('UTC'), name: 'Hi' };
    form.editor.text.body = 'Hello';
    expect(formToCandidate(form)).toMatchObject({
      name: 'Hi',
      send_when: 'first_message',
      interval_days: null,
      schedule: null,
    });
  });

  it('keeps the schedule fields while it is switched off, but does not send them', () => {
    const form = {
      ...emptyRuleForm('UTC'),
      scheduleEnabled: false,
      days: [1],
      from: '20:00',
      to: '06:00',
    };
    expect(formToCandidate(form).schedule).toBeNull();
    expect(
      formToCandidate({ ...form, scheduleEnabled: true }).schedule
    ).toEqual({
      days: [1],
      from: '20:00',
      to: '06:00',
      timezone: 'UTC',
    });
  });

  it('sends the day count only for a welcome-back rule', () => {
    const form = { ...emptyRuleForm('UTC'), intervalDays: 14 };
    expect(formToCandidate(form).interval_days).toBeNull();
    expect(
      formToCandidate({ ...form, sendWhen: 'after_inactivity' }).interval_days
    ).toBe(14);
  });

  it('sends the day count for the repeating kinds too', () => {
    const form = { ...emptyRuleForm('UTC'), intervalDays: 5 };
    expect(
      formToCandidate({ ...form, sendWhen: 'every_n_days' }).interval_days
    ).toBe(5);
  });

  it('produces something the validator accepts once the form is filled in', () => {
    const form = {
      ...emptyRuleForm('Asia/Kolkata'),
      name: 'Away',
      sendWhen: 'after_inactivity' as const,
      intervalDays: 7,
      scheduleEnabled: true,
      days: [1, 2, 3, 4, 5],
      from: '18:00',
      to: '09:00',
    };
    form.editor.text.body = 'We are away. Back at 9!';
    const r = validateAutoresponder(formToCandidate(form));
    expect(r.ok).toBe(true);
  });

  it('a blank form fails exactly where the person has not filled it in', () => {
    const r = validateAutoresponder(formToCandidate(emptyRuleForm('UTC')));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.code)).toEqual([
        'nameRequired',
        'invalidMessage',
      ]);
    }
  });
});

describe('itemToForm', () => {
  it('round-trips a stored rule through the form and back', () => {
    const item = rowToItem(
      row({
        send_when: 'after_inactivity',
        interval_days: 30,
        schedule_days: [1, 2],
        schedule_from: '18:00',
        schedule_to: '09:00',
        timezone: 'Asia/Kolkata',
      })
    );
    const form = itemToForm(item, 'UTC');
    expect(form).toMatchObject({
      name: 'Welcome',
      sendWhen: 'after_inactivity',
      intervalDays: 30,
      scheduleEnabled: true,
      days: [1, 2],
      from: '18:00',
      to: '09:00',
      timezone: 'Asia/Kolkata',
    });
    const again = validateAutoresponder(formToCandidate(form));
    expect(again.ok && again.value).toMatchObject({
      name: 'Welcome',
      send_when: 'after_inactivity',
      interval_days: 30,
      schedule: { days: [1, 2], from: '18:00', to: '09:00' },
    });
    expect(again.ok && again.value.message.payload).toEqual(
      item.message.payload
    );
  });

  it('opens an unscheduled rule with the schedule off and the viewer’s zone ready', () => {
    const form = itemToForm(rowToItem(row()), 'Europe/Madrid');
    expect(form.scheduleEnabled).toBe(false);
    expect(form.timezone).toBe('Europe/Madrid');
    expect(form.intervalDays).toBe(DEFAULT_INACTIVITY_DAYS);
  });

  it('throws for a stored message that no longer matches its type', () => {
    const broken = rowToItem(
      row({ message_type: 'image', payload: { type: 'text' } })
    );
    expect(() => itemToForm(broken, 'UTC')).toThrow();
  });
});

describe('timeZoneOptions', () => {
  it('always offers UTC and the zone already chosen, sorted and unique', () => {
    const options = timeZoneOptions('Mars/Olympus');
    expect(options).toContain('UTC');
    expect(options).toContain('Mars/Olympus');
    expect(new Set(options).size).toBe(options.length);
    expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b)));
  });

  it('includes real zones where the engine can list them', () => {
    // (Engines list India as Asia/Calcutta, so check a zone with one name.)
    expect(timeZoneOptions('UTC')).toContain('America/New_York');
  });
});
