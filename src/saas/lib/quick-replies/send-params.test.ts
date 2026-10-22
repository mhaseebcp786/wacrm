import { describe, expect, it } from 'vitest';

import {
  SAMPLE_CAROUSEL_URL,
  SAMPLE_CTA,
  SAMPLE_IMAGE,
  SAMPLE_LIST,
  SAMPLE_REPLY_BUTTONS,
  SAMPLE_TEXT,
} from '@/saas/lib/messages/fixtures';
import type { MessageObject } from '@/saas/lib/messages/types';
import { validateMessageObject } from '@/saas/lib/messages/validate';
import { messageToSendParams } from './send-params';

function ok(input: unknown): MessageObject {
  const r = validateMessageObject(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.message;
}

describe('messageToSendParams', () => {
  it('text → text', () => {
    expect(messageToSendParams(ok(SAMPLE_TEXT))).toEqual({
      messageType: 'text',
      contentText: expect.stringContaining('Hello'),
    });
  });

  it('image/video/audio/document → media params the core already handles', () => {
    expect(messageToSendParams(ok(SAMPLE_IMAGE))).toMatchObject({
      messageType: 'image',
      mediaUrl: expect.stringMatching(/^https?:/),
    });
    expect(
      messageToSendParams(
        ok({
          message_type: 'video',
          payload: {
            type: 'video',
            video: { link: 'https://example.com/v.mp4', caption: 'cap' },
          },
        })
      )
    ).toEqual({
      messageType: 'video',
      mediaUrl: 'https://example.com/v.mp4',
      contentText: 'cap',
    });
    expect(
      messageToSendParams(
        ok({
          message_type: 'audio',
          payload: {
            type: 'audio',
            audio: { link: 'https://example.com/a.mp3' },
          },
        })
      )
    ).toEqual({ messageType: 'audio', mediaUrl: 'https://example.com/a.mp3' });
    expect(
      messageToSendParams(
        ok({
          message_type: 'document',
          payload: {
            type: 'document',
            document: {
              link: 'https://example.com/d.pdf',
              filename: 'd.pdf',
              caption: 'c',
            },
          },
        })
      )
    ).toEqual({
      messageType: 'document',
      mediaUrl: 'https://example.com/d.pdf',
      contentText: 'c',
      filename: 'd.pdf',
    });
  });

  it('reply buttons and lists → the upstream interactive payload', () => {
    expect(messageToSendParams(ok(SAMPLE_REPLY_BUTTONS))).toMatchObject({
      messageType: 'interactive',
      interactivePayload: { kind: 'buttons' },
    });
    expect(messageToSendParams(ok(SAMPLE_LIST))).toMatchObject({
      messageType: 'interactive',
      interactivePayload: { kind: 'list' },
    });
  });

  it('link button → rich_interactive, carrying the Meta payload and the body as text', () => {
    const params = messageToSendParams(ok(SAMPLE_CTA));
    expect(params?.messageType).toBe('rich_interactive');
    expect(params?.interactivePayload).toMatchObject({ type: 'interactive' });
    expect(params?.contentText).toBe('See our full product range.');
  });

  it('reply buttons with a media header → rich_interactive; with a text header → upstream path', () => {
    const buttons = structuredClone(SAMPLE_REPLY_BUTTONS) as unknown as {
      payload: { interactive: Record<string, unknown> };
    };
    buttons.payload.interactive.header = {
      type: 'image',
      image: { link: 'https://example.com/a.jpg' },
    };
    expect(messageToSendParams(ok(buttons))?.messageType).toBe(
      'rich_interactive'
    );
    buttons.payload.interactive.header = { type: 'text', text: 'Hello' };
    expect(messageToSendParams(ok(buttons))?.messageType).toBe('interactive');
  });

  it('carousel → the editor-shaped carousel payload', () => {
    expect(messageToSendParams(ok(SAMPLE_CAROUSEL_URL))).toMatchObject({
      messageType: 'carousel',
      interactivePayload: { kind: 'carousel' },
    });
  });

  it('location and contact → payload-carrying extension types with a text preview', () => {
    expect(
      messageToSendParams(
        ok({
          message_type: 'location',
          payload: {
            type: 'location',
            location: { latitude: 12.9, longitude: 77.6, name: 'HQ' },
          },
        })
      )
    ).toMatchObject({ messageType: 'location', contentText: 'HQ' });
    // No name or address: the coordinates stand in.
    expect(
      messageToSendParams(
        ok({
          message_type: 'location',
          payload: {
            type: 'location',
            location: { latitude: 12.9, longitude: 77.6 },
          },
        })
      )?.contentText
    ).toBe('12.9, 77.6');
    expect(
      messageToSendParams(
        ok({
          message_type: 'contact',
          payload: {
            type: 'contacts',
            contacts: [
              {
                name: { formatted_name: 'Jane Doe' },
                phones: [{ phone: '+15551234567' }],
              },
            ],
          },
        })
      )
    ).toMatchObject({ messageType: 'contact', contentText: 'Jane Doe' });
  });

  it('returns null for what the core cannot deliver', () => {
    const flow = ok({
      message_type: 'interactive',
      payload: {
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: 'x' },
          action: {
            name: 'flow',
            parameters: { flow_id: '1', flow_cta: 'Open' },
          },
        },
      },
    });
    expect(messageToSendParams(flow)).toBeNull();
  });
});
