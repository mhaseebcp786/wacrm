import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import en from '../../../../messages/en.json';
import { emptyRuleForm, type RuleForm } from '@/saas/lib/autoresponder/form';
import { RuleFormFields } from './rule-form';

function render(ui: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

const fields = (form: RuleForm) =>
  render(<RuleFormFields form={form} onChange={vi.fn()} showIssues={false} />);

describe('RuleFormFields', () => {
  it('shows name, the two “when” choices and the message editor for a new rule', () => {
    const html = fields(emptyRuleForm('UTC'));
    expect(html).toContain('Name');
    expect(html).toContain('When should it be sent?');
    expect(html).toContain('On a customer’s first message');
    expect(html).toContain('Welcome back after a quiet spell');
    expect(html).toContain('Once every few days, whenever they write');
    expect(html).toContain('Only on certain days and times');
    // The shared message editor, with its type chips.
    expect(html).toContain('Interactive');
    expect(html).toContain('Carousel');
  });

  it('marks the chosen “when” option and hides the quiet-period menu until needed', () => {
    const first = fields(emptyRuleForm('UTC'));
    expect(first).toMatch(
      /role="radio"[^>]*aria-checked="true"[^>]*>\s*<span[^>]*>On a customer’s first message/
    );
    expect(first).not.toContain('Quiet period');
    expect(first).not.toContain('Not more than once every');

    const back = fields({
      ...emptyRuleForm('UTC'),
      sendWhen: 'after_inactivity',
    });
    expect(back).toContain('Quiet period');
    expect(back).toContain('30 days');
    expect(back).toContain('1 day');
    expect(back).toContain('90 days');
  });

  it('shows days, hours and zone only when the schedule is switched on', () => {
    const off = fields(emptyRuleForm('Asia/Kolkata'));
    expect(off).not.toContain('Time zone');

    const on = fields({
      ...emptyRuleForm('Asia/Kolkata'),
      scheduleEnabled: true,
      days: [1, 2],
      from: '18:00',
      to: '09:00',
    });
    expect(on).toContain('Time zone');
    expect(on).toContain('value="18:00"');
    expect(on).toContain('value="09:00"');
    expect(on).toContain('Asia/Kolkata');
    // Monday and Tuesday are pressed, Wednesday is not.
    expect(on).toMatch(/aria-pressed="true"[^>]*>Mon</);
    expect(on).toMatch(/aria-pressed="true"[^>]*>Tue</);
    expect(on).toMatch(/aria-pressed="false"[^>]*>Wed</);
    expect(on).toContain('the day you tick is the day it starts on');
  });

  it('keeps a stored time zone that the browser list does not know', () => {
    const html = fields({
      ...emptyRuleForm('Mars/Olympus'),
      scheduleEnabled: true,
    });
    expect(html).toContain('Mars/Olympus');
  });
});

describe('RuleFormFields — “once every few days”', () => {
  it('asks for the cooldown, not a quiet period', () => {
    const html = fields({
      ...emptyRuleForm('UTC'),
      sendWhen: 'every_n_days',
    });
    expect(html).toContain('Not more than once every');
    expect(html).not.toContain('Quiet period');
    expect(html).toContain('will not get this message again');
  });

  it('labels the days group for screen readers', () => {
    const html = fields({ ...emptyRuleForm('UTC'), scheduleEnabled: true });
    expect(html).toMatch(
      /role="group"[^>]*aria-labelledby="autoresponder-days-label"/
    );
    expect(html).toContain('id="autoresponder-days-label"');
  });
});
