import { describe, expect, it } from 'vitest';

import {
  SAMPLE_CAROUSEL_URL,
  SAMPLE_CTA,
  SAMPLE_IMAGE,
  SAMPLE_LIST,
  SAMPLE_REPLY_BUTTONS,
  SAMPLE_TEXT,
} from '@/saas/lib/messages/fixtures';
import { validateQuickReplyMessage } from './validate';

describe('validateQuickReplyMessage', () => {
  it.each([
    ['text', SAMPLE_TEXT],
    ['reply buttons', SAMPLE_REPLY_BUTTONS],
    ['cta', SAMPLE_CTA],
    ['list', SAMPLE_LIST],
    ['image', SAMPLE_IMAGE],
    ['carousel', SAMPLE_CAROUSEL_URL],
  ])('accepts the reference %s capture', (_n, fixture) => {
    const r = validateQuickReplyMessage(fixture);
    expect(r.ok).toBe(true);
  });

  it('normalizes the reference app carousel form to message_type carousel', () => {
    const r = validateQuickReplyMessage(SAMPLE_CAROUSEL_URL);
    expect(r.ok && r.message.message_type).toBe('carousel');
  });

  it('passes shared-validator issues through', () => {
    const r = validateQuickReplyMessage({
      message_type: 'text',
      payload: { type: 'text', text: { body: '' } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatchObject({ code: 'required' });
  });

  it('rejects a reply whose only text is a token that resolves to nothing', () => {
    const r = validateQuickReplyMessage({
      message_type: 'text',
      payload: { type: 'text', text: { body: '{{contact.name}}' } },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a contact token inside a link, which is never personalized', () => {
    const cta = structuredClone(SAMPLE_CTA) as unknown as {
      payload: {
        interactive: { action: { parameters: Record<string, unknown> } };
      };
    };
    cta.payload.interactive.action.parameters.url =
      'https://example.com/?n={{contact.name}}';
    expect(validateQuickReplyMessage(cta)).toMatchObject({
      ok: false,
      issues: [
        {
          path: 'payload.interactive.action.parameters.url',
          code: 'invalidUrl',
        },
      ],
    });
    const media = {
      message_type: 'image',
      payload: {
        type: 'image',
        image: { link: 'https://example.com/{{ contact.phone }}.jpg' },
      },
    };
    expect(validateQuickReplyMessage(media).ok).toBe(false);
  });

  it('rejects a contact token inside a button or row id, which is never personalized', () => {
    const buttons = structuredClone(SAMPLE_REPLY_BUTTONS) as unknown as {
      payload: {
        interactive: {
          action: { buttons: Array<{ reply: { id: string } }> };
        };
      };
    };
    buttons.payload.interactive.action.buttons[0].reply.id =
      'btn_{{contact.name}}';
    const r = validateQuickReplyMessage(buttons);
    expect(r).toMatchObject({
      ok: false,
      issues: [{ code: 'invalidValue' }],
    });
    if (!r.ok) expect(r.issues[0].path).toMatch(/buttons\.0\.reply\.id$/);
  });

  it('marks WhatsApp Flow buttons as unsupported', () => {
    const r = validateQuickReplyMessage({
      message_type: 'interactive',
      payload: {
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: 'Fill the form' },
          action: {
            name: 'flow',
            parameters: { flow_id: '123', flow_cta: 'Open' },
          },
        },
      },
    });
    expect(r).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported', params: { feature: 'flow' } }],
    });
  });

  it('allows an image/video/document header on reply buttons and on a link button', () => {
    const header = {
      type: 'image',
      image: { link: 'https://example.com/a.jpg' },
    };
    const buttons = structuredClone(SAMPLE_REPLY_BUTTONS) as unknown as {
      payload: { interactive: Record<string, unknown> };
    };
    buttons.payload.interactive.header = header;
    expect(validateQuickReplyMessage(buttons).ok).toBe(true);

    const cta = structuredClone(SAMPLE_CTA) as unknown as {
      payload: { interactive: Record<string, unknown> };
    };
    cta.payload.interactive.header = header;
    expect(validateQuickReplyMessage(cta).ok).toBe(true);
  });

  it('still rejects a media header on a list (Meta allows a text header only)', () => {
    const list = structuredClone(SAMPLE_LIST) as unknown as {
      payload: { interactive: Record<string, unknown> };
    };
    list.payload.interactive.header = {
      type: 'image',
      image: { link: 'https://example.com/a.jpg' },
    };
    expect(validateQuickReplyMessage(list).ok).toBe(false);
  });
});
