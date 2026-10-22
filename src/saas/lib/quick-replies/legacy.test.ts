import { describe, expect, it } from 'vitest';

import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import { validateMessageObject } from '@/saas/lib/messages/validate';
import {
  SAMPLE_CTA,
  SAMPLE_REPLY_BUTTONS,
  SAMPLE_TEXT,
} from '@/saas/lib/messages/fixtures';
import type { MessageObject } from '@/saas/lib/messages/types';
import {
  legacyInteractiveToMessage,
  legacyQuickReplyToMessage,
  messageToLegacyInteractive,
} from './legacy';

const buttons: InteractiveMessagePayload = {
  kind: 'buttons',
  body: 'Pick one',
  header: 'Hi',
  footer: 'Bye',
  buttons: [
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
  ],
};

const list: InteractiveMessagePayload = {
  kind: 'list',
  body: 'Menu',
  button_label: 'Open',
  sections: [
    { title: 'One', rows: [{ id: 'r1', title: 'Row 1', description: 'd' }] },
    { title: 'Two', rows: [{ id: 'r2', title: 'Row 2' }] },
  ],
};

describe('legacy interactive ⇄ message object', () => {
  it.each([
    ['reply buttons', buttons],
    ['list', list],
  ])('round-trips %s', (_n, payload) => {
    const message = legacyInteractiveToMessage(payload);
    expect(messageToLegacyInteractive(message)).toEqual(payload);
  });

  it('produces a message the shared validator accepts', () => {
    expect(validateMessageObject(legacyInteractiveToMessage(buttons)).ok).toBe(
      true
    );
    expect(validateMessageObject(legacyInteractiveToMessage(list)).ok).toBe(
      true
    );
  });

  it('maps the header to a text header and omits empty optionals', () => {
    const m = legacyInteractiveToMessage({
      kind: 'buttons',
      body: 'x',
      buttons: [{ id: 'a', title: 'A' }],
    });
    if (m.message_type !== 'interactive') throw new Error('type');
    expect(m.payload.interactive.header).toBeUndefined();
    expect(m.payload.interactive.footer).toBeUndefined();
    const withHeader = legacyInteractiveToMessage(buttons);
    if (withHeader.message_type !== 'interactive') throw new Error('type');
    expect(withHeader.payload.interactive.header).toEqual({
      type: 'text',
      text: 'Hi',
    });
  });

  it('refuses what the upstream builder cannot express', () => {
    // CTA URL has no upstream representation.
    expect(
      messageToLegacyInteractive(SAMPLE_CTA as unknown as MessageObject)
    ).toBeNull();
    // Non-interactive.
    expect(
      messageToLegacyInteractive(SAMPLE_TEXT as unknown as MessageObject)
    ).toBeNull();
    // Media header.
    const withMedia = structuredClone(SAMPLE_REPLY_BUTTONS) as unknown as {
      payload: { interactive: Record<string, unknown> };
    };
    withMedia.payload.interactive.header = {
      type: 'image',
      image: { link: 'https://example.com/a.jpg' },
    };
    expect(
      messageToLegacyInteractive(withMedia as unknown as MessageObject)
    ).toBeNull();
  });
});

describe('legacyQuickReplyToMessage', () => {
  it('maps a text row to a text message', () => {
    expect(
      legacyQuickReplyToMessage({ kind: 'text', content_text: 'Hello' })
    ).toEqual({
      message_type: 'text',
      payload: { type: 'text', text: { body: 'Hello' } },
    });
  });

  it('maps an interactive row', () => {
    const m = legacyQuickReplyToMessage({
      kind: 'interactive',
      interactive_payload: buttons,
    });
    expect(m?.message_type).toBe('interactive');
  });

  it('returns null for rows with no usable content', () => {
    expect(legacyQuickReplyToMessage({ kind: 'text', content_text: '' })).toBe(
      null
    );
    expect(
      legacyQuickReplyToMessage({ kind: 'text', content_text: null })
    ).toBe(null);
    expect(
      legacyQuickReplyToMessage({
        kind: 'interactive',
        interactive_payload: null,
      })
    ).toBe(null);
  });
});
