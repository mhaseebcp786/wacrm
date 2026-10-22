import { describe, expect, it } from 'vitest';
import {
  hasContactTokens,
  personalizeMessage,
  personalizeText,
} from './tokens';
import { messagePreviewText } from './preview';
import { validateMessageObject } from './validate';
import type { MessageObject } from './types';
import { SAMPLE_CTA, SAMPLE_LIST, SAMPLE_TEXT } from './fixtures';

function valid(input: unknown): MessageObject {
  const r = validateMessageObject(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.message;
}

describe('personalizeText', () => {
  it('replaces name and phone tokens, tolerating inner whitespace', () => {
    expect(
      personalizeText('Hi {{contact.name}} / {{ contact.phone }}', {
        name: ' Asha ',
        phone: '919876543210',
      })
    ).toBe('Hi Asha / 919876543210');
  });

  it('uses fallbacks (default empty) when the value is missing or blank', () => {
    expect(personalizeText('Hi {{contact.name}}!', { name: null })).toBe(
      'Hi !'
    );
    expect(
      personalizeText(
        'Hi {{contact.name}}!',
        { name: '  ' },
        { fallbackName: 'there' }
      )
    ).toBe('Hi there!');
  });

  it('replaces every occurrence and leaves other braces alone', () => {
    expect(
      personalizeText('{{contact.name}} {{contact.name}} {{other}}', {
        name: 'A',
      })
    ).toBe('A A {{other}}');
  });
});

describe('personalizeMessage', () => {
  it('substitutes copy fields without mutating the saved message', () => {
    const saved = valid(SAMPLE_TEXT);
    const sent = personalizeMessage(saved, { name: 'Asha' });
    expect(messagePreviewText(sent)).toBe(
      'Hello Asha, thanks for contacting Invicto Associates LLP.'
    );
    expect(messagePreviewText(saved)).toContain('{{contact.name}}');
  });

  it('never rewrites ids, urls or links', () => {
    const tricky = valid({
      message_type: 'interactive',
      payload: {
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: 'Hi {{contact.name}}' },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: '{{contact.name}}',
              url: 'https://x.test/?n={{contact.name}}',
            },
          },
        },
      },
    });
    const sent = personalizeMessage(tricky, { name: 'Asha' });
    expect(sent.payload).toMatchObject({
      interactive: {
        body: { text: 'Hi Asha' },
        action: {
          parameters: {
            display_text: 'Asha',
            url: 'https://x.test/?n={{contact.name}}',
          },
        },
      },
    });
  });
});

describe('hasContactTokens', () => {
  it('detects tokens in copy fields only', () => {
    expect(hasContactTokens(valid(SAMPLE_TEXT))).toBe(true);
    expect(hasContactTokens(valid(SAMPLE_CTA))).toBe(false);
    expect(hasContactTokens(valid(SAMPLE_TEXT))).toBe(true); // regex lastIndex is reset
  });
});

describe('messagePreviewText', () => {
  it('summarises each type on one line', () => {
    expect(messagePreviewText(valid(SAMPLE_LIST))).toBe('Choose a category');
    expect(
      messagePreviewText(
        valid({
          message_type: 'audio',
          payload: {
            type: 'audio',
            audio: { link: 'https://x.test/a.ogg', voice: true },
          },
        })
      )
    ).toBe('[audio]');
    expect(
      messagePreviewText(
        valid({
          message_type: 'location',
          payload: {
            type: 'location',
            location: { latitude: 1, longitude: 2, name: 'HQ' },
          },
        })
      )
    ).toBe('HQ');
  });
});

describe('messagePreviewText — upstream convention', () => {
  it('uses [type] placeholders like send-message.ts and no emoji', () => {
    const media = (type: string, body: Record<string, unknown>) =>
      valid({
        message_type: type,
        payload: { type, [type]: { link: 'https://x.test/f.png', ...body } },
      });
    expect(messagePreviewText(media('image', {}))).toBe('[image]');
    expect(messagePreviewText(media('image', { caption: 'Look' }))).toBe(
      'Look'
    );
    expect(
      messagePreviewText(
        media('document', { link: 'https://x.test/a.pdf', filename: 'a.pdf' })
      )
    ).toBe('a.pdf');
  });
});
