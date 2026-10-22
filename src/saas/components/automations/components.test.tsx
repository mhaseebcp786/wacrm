import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import en from '../../../../messages/en.json';
import {
  SAAS_TRIGGER_META,
  SAAS_TRIGGER_OPTIONS,
} from '@/saas/lib/automations/meta';
import { SAAS_TRIGGER_TYPES } from '@/saas/lib/automations/types';
import { blankRichMessageConfig } from '@/saas/lib/automations/rich-config';
import { RichMessageStep } from './rich-message-step';
import { SaasTriggerConfig } from './trigger-config';

function render(ui: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

const trigger = (type: string, config: Record<string, unknown> = {}) =>
  render(<SaasTriggerConfig type={type} config={config} onChange={vi.fn()} />);

describe('SaasTriggerConfig', () => {
  it('shows a text box for a button tap, with its current value', () => {
    const html = trigger('button_reply', { text: 'Book now' });
    expect(html).toContain('Button text (optional)');
    expect(html).toContain('value="Book now"');
    expect(html).toContain('Leave blank for any button');
  });

  it('shows the row wording for a list row', () => {
    const html = trigger('list_reply');
    expect(html).toContain('Row text (optional)');
    expect(html).not.toContain('Button text');
  });

  it('shows the product ids of a catalogue order, comma separated', () => {
    const html = trigger('catalog_order', { product_ids: ['sku-1', 'sku-2'] });
    expect(html).toContain('Product IDs (optional)');
    expect(html).toContain('value="sku-1, sku-2"');
  });

  it('explains the triggers that have no settings', () => {
    expect(trigger('flow_response')).toContain('WhatsApp Flow form');
    expect(trigger('meta_ads_ctwa')).toContain('Click-to-WhatsApp');
    const fallback = trigger('anything_else');
    expect(fallback).toContain('catch-all');
    expect(fallback).toContain('New message received');
  });

  it('renders nothing for an upstream trigger', () => {
    expect(trigger('keyword_match')).toBe('');
    expect(trigger('tag_added')).toBe('');
  });
});

describe('RichMessageStep', () => {
  it('shows the shared message editor with its type chips and a hint', () => {
    const html = render(
      <RichMessageStep config={blankRichMessageConfig()} onChange={vi.fn()} />
    );
    expect(html).toContain('Sends one message built in the message editor');
    expect(html).toContain('Interactive');
    expect(html).toContain('Carousel');
  });

  it('opens a stored message in the editor', () => {
    const html = render(
      <RichMessageStep
        config={{
          message_type: 'text',
          payload: { type: 'text', text: { body: 'Welcome back!' } },
        }}
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('Welcome back!');
  });

  it('falls back to an empty editor for a step it cannot read', () => {
    const html = render(
      <RichMessageStep config={{ text: 'old style' }} onChange={vi.fn()} />
    );
    expect(html).toContain('Interactive');
    expect(html).not.toContain('old style');
  });
});

describe('extra trigger catalogue', () => {
  it('has a label, a hint, a list pill and a builder option for every trigger', () => {
    const triggers = en.Automations.builder.triggers as Record<
      string,
      { label: string; hint: string }
    >;
    for (const type of SAAS_TRIGGER_TYPES) {
      expect(triggers[type]?.label, type).toBeTruthy();
      expect(triggers[type]?.hint, type).toBeTruthy();
      expect(SAAS_TRIGGER_META[type].pillClass, type).toBeTruthy();
      expect(
        SAAS_TRIGGER_OPTIONS.map((o) => o.value),
        type
      ).toContain(type);
    }
    expect(SAAS_TRIGGER_OPTIONS).toHaveLength(SAAS_TRIGGER_TYPES.length);
    expect(en.Automations.builder.steps.send_rich_message).toBeTruthy();
  });
});
