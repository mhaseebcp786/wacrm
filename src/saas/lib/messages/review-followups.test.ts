import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSendBody } from './build';
import {
  MessageValidationError,
  prepareMessage,
  sendMessageObject,
} from './send';
import type { MessageIssue, MessageObject } from './types';
import {
  validateMessageObject,
  validateMessageObjectForSave,
} from './validate';
import { SAMPLE_TEXT } from './fixtures';

// Regression tests for the independent review of the message-object changeset.

const TO = '919876543210';

function issues(input: unknown): MessageIssue[] {
  const r = validateMessageObject(input);
  if (r.ok) throw new Error('expected validation to fail');
  return r.issues;
}
const codes = (input: unknown) =>
  issues(input).map((i) => `${i.path}:${i.code}`);

function valid(input: unknown): MessageObject {
  const r = validateMessageObject(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.message;
}

const interactive = (body: Record<string, unknown>) => ({
  message_type: 'interactive',
  payload: { type: 'interactive', interactive: body },
});

const buttonsMsg = (extra: Record<string, unknown> = {}) =>
  interactive({
    type: 'button',
    body: { text: 'Pick' },
    action: { buttons: [{ type: 'reply', reply: { id: 'a', title: 'A' } }] },
    ...extra,
  });

describe('validate — boundaries and absent values', () => {
  it('treats null header/footer and a blank footer as absent', () => {
    expect(
      validateMessageObject(buttonsMsg({ header: null, footer: null })).ok
    ).toBe(true);
    expect(validateMessageObject(buttonsMsg({ footer: { text: '' } })).ok).toBe(
      true
    );
  });

  it('header text 60/61, list button 20/21, section title 24/25', () => {
    expect(
      validateMessageObject(
        buttonsMsg({ header: { type: 'text', text: 'h'.repeat(60) } })
      ).ok
    ).toBe(true);
    expect(
      codes(buttonsMsg({ header: { type: 'text', text: 'h'.repeat(61) } }))
    ).toEqual(['payload.interactive.header.text:tooLong']);
    const list = (button: string, title: string) =>
      interactive({
        type: 'list',
        body: { text: 'x' },
        action: {
          button,
          sections: [{ title, rows: [{ id: 'a', title: 'A' }] }],
        },
      });
    expect(validateMessageObject(list('b'.repeat(20), 't'.repeat(24))).ok).toBe(
      true
    );
    expect(codes(list('b'.repeat(21), 'ok'))).toEqual([
      'payload.interactive.action.button:tooLong',
    ]);
    expect(codes(list('ok', 't'.repeat(25)))).toEqual([
      'payload.interactive.action.sections.0.title:tooLong',
    ]);
  });

  it('rejects 11 list sections; accepts an image caption of exactly 1024', () => {
    const sections = Array.from({ length: 11 }, (_, n) => ({
      title: `S${n}`,
      rows: [{ id: `r${n}`, title: 'R' }],
    }));
    expect(
      codes(
        interactive({
          type: 'list',
          body: { text: 'x' },
          action: { button: 'Open', sections },
        })
      )
    ).toContain('payload.interactive.action.sections:tooMany');
    expect(
      validateMessageObject({
        message_type: 'image',
        payload: {
          type: 'image',
          image: { link: 'https://x.test/a.png', caption: 'c'.repeat(1024) },
        },
      }).ok
    ).toBe(true);
  });

  it('flow label: 30 chars ok, emoji rejected', () => {
    const flow = (flow_cta: string) =>
      interactive({
        type: 'flow',
        body: { text: 'x' },
        action: { name: 'flow', parameters: { flow_id: '1', flow_cta } },
      });
    expect(validateMessageObject(flow('c'.repeat(30))).ok).toBe(true);
    expect(codes(flow('Open 🚀'))).toEqual([
      'payload.interactive.action.parameters.flow_cta:invalidValue',
    ]);
  });

  it('basic audio rejects recognisable non-audio files but not unknown tails', () => {
    const audio = (link: string) => ({
      message_type: 'audio',
      payload: { type: 'audio', audio: { link } },
    });
    expect(codes(audio('https://x.test/a.wav'))).toEqual([
      'payload.audio.link:invalidMedia',
    ]);
    expect(codes(audio('https://x.test/a.exe'))).toEqual([
      'payload.audio.link:invalidMedia',
    ]);
    expect(validateMessageObject(audio('https://x.test/a.m4a')).ok).toBe(true);
    expect(
      validateMessageObject(audio('https://x.test/download?id=7')).ok
    ).toBe(true);
  });

  it('decimal-string coordinates are accepted (Meta documents strings); other strings are invalidValue, not required', () => {
    const at = (latitude: unknown) => ({
      message_type: 'location',
      payload: { type: 'location', location: { latitude, longitude: 0 } },
    });
    expect(validateMessageObject(at('12.9')).ok).toBe(true);
    expect(validateMessageObject(at(' -33.8688 ')).ok).toBe(true);
    for (const bad of ['abc', '0x10', '1e3', '12.', '']) {
      expect(codes(at(bad)), JSON.stringify(bad)).toHaveLength(1);
    }
    expect(codes(at('abc'))).toEqual([
      'payload.location.latitude:invalidValue',
    ]);
    // A string out of range is still out of range.
    expect(codes(at('91'))).toEqual(['payload.location.latitude:outOfRange']);
  });

  it('accepts a contact with only an email', () => {
    expect(
      validateMessageObject({
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: [
            { name: { formatted_name: 'A' }, emails: [{ email: 'a@x.test' }] },
          ],
        },
      }).ok
    ).toBe(true);
  });
});

describe('validate — carousel guards', () => {
  const IMGH = { type: 'image', image: { link: 'https://x.test/a.jpg' } };
  const url = {
    name: 'cta_url',
    parameters: { display_text: 'Go', url: 'https://x.test' },
  };
  const card = (action: unknown, header: unknown = IMGH) => ({
    header,
    body: { text: 'c' },
    action,
  });
  const carousel = (cards: unknown[], extra: Record<string, unknown> = {}) => ({
    message_type: 'carousel',
    payload: {
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: 'x' },
        action: { cards },
        ...extra,
      },
    },
  });

  it('accepts 10 cards and rejects 11 via the existing validator', () => {
    expect(
      validateMessageObject(
        carousel(Array.from({ length: 10 }, () => card(url)))
      ).ok
    ).toBe(true);
    expect(
      issues(carousel(Array.from({ length: 11 }, () => card(url))))[0].params
        ?.reason
    ).toBe('maxCards');
  });

  it('rejects two quick-reply buttons on a card instead of silently dropping one', () => {
    const qr = (t: string) => ({
      type: 'quick_reply',
      quick_reply: { id: t, title: t },
    });
    expect(
      codes(
        carousel([
          card({ buttons: [qr('a'), qr('b')] }),
          card({ buttons: [qr('c')] }),
        ])
      )
    ).toContain('payload.interactive.action.cards.0.action.buttons:tooMany');
  });

  it('flags a document card header and a top-level footer', () => {
    expect(
      codes(carousel([card(url, { type: 'document' }), card(url)]))
    ).toContain('payload.interactive.action.cards.0.header.type:invalidValue');
    expect(
      codes(carousel([card(url), card(url)], { footer: { text: 'f' } }))
    ).toContain('payload.interactive.footer:invalidValue');
  });

  it('rejects message_type "carousel" whose interactive.type is not carousel', () => {
    const bad = carousel([card(url), card(url)]);
    (bad.payload.interactive as Record<string, unknown>).type = 'list';
    expect(codes(bad)).toEqual(['payload.interactive.type:invalidValue']);
  });

  it('carries no English message in carousel issue params', () => {
    expect(issues(carousel([card(url)]))[0].params).toEqual({
      reason: 'minCards',
    });
  });
});

describe('validateMessageObjectForSave', () => {
  const tokenButton = (title: string) =>
    interactive({
      type: 'button',
      body: { text: 'Pick' },
      action: { buttons: [{ type: 'reply', reply: { id: 'a', title } }] },
    });

  it('rejects a title that is only a token (worst case: empty name)', () => {
    expect(validateMessageObject(tokenButton('{{contact.name}}')).ok).toBe(
      true
    );
    expect(
      validateMessageObjectForSave(tokenButton('{{contact.name}}')).ok
    ).toBe(false);
    expect(
      validateMessageObjectForSave(tokenButton('Hi {{contact.name}}')).ok
    ).toBe(true);
  });
});

describe('prepareMessage — tokens without a contact', () => {
  it('never lets a literal {{contact.*}} token through', () => {
    const msg = prepareMessage({ message: SAMPLE_TEXT });
    expect(JSON.stringify(msg)).not.toContain('{{contact.');
    expect((msg.payload as { text: { body: string } }).text.body).toBe(
      'Hello , thanks for contacting Invicto Associates LLP.'
    );
  });

  it('throws MessageValidationError when personalization empties a required field; a fallback fixes it', () => {
    const message = {
      message_type: 'interactive',
      payload: {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Pick' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'a', title: '{{contact.name}}' } },
            ],
          },
        },
      },
    };
    expect(() => prepareMessage({ message, contact: { name: null } })).toThrow(
      MessageValidationError
    );
    expect(
      prepareMessage({
        message,
        contact: { name: null },
        personalize: { fallbackName: 'Friend' },
      })
    ).toBeTruthy();
  });

  it('does not throw a TypeError for a non-string contact name', () => {
    expect(() =>
      prepareMessage({
        message: SAMPLE_TEXT,
        contact: { name: 42 as unknown as string },
      })
    ).not.toThrow();
  });
});

describe('sendMessageObject — non-JSON error body', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a status message when Meta returns a non-JSON error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<html>bad gateway</html>', { status: 502 })
    );
    await expect(
      sendMessageObject({
        phoneNumberId: '1',
        accessToken: 't',
        to: TO,
        message: SAMPLE_TEXT,
      })
    ).rejects.toMatchObject({
      name: 'MetaApiError',
      httpStatus: 502,
      message: 'Meta API error: 502',
    });
  });
});

describe('buildSendBody — whitelisting', () => {
  it('drops stray contact keys', () => {
    const body = buildSendBody(
      valid({
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: [
            {
              id: 'row-1',
              created_at: 'x',
              name: { formatted_name: 'Asha', junk: 1 },
              phones: [{ phone: '+91 98765 43210', type: 'CELL' }],
            },
          ],
        },
      }),
      TO
    );
    expect(body.contacts).toEqual([
      {
        name: { formatted_name: 'Asha', first_name: 'Asha' },
        phones: [{ phone: '+91 98765 43210', type: 'CELL' }],
      },
    ]);
  });

  it('drops empty-string optional fields', () => {
    const body = buildSendBody(
      valid({
        message_type: 'document',
        payload: {
          type: 'document',
          document: { link: 'https://x.test/a.pdf', caption: '', filename: '' },
        },
      }),
      TO
    );
    expect(body.document).toEqual({ link: 'https://x.test/a.pdf' });
  });
});
