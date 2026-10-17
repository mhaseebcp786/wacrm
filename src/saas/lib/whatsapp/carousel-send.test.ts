import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCarouselMessage } from './carousel-send';
import { MetaApiError } from '@/lib/whatsapp/meta-api';
import type { CarouselInteractivePayload } from './carousel-interactive';

const validPayload: CarouselInteractivePayload = {
  kind: 'carousel',
  body: 'Browse our collection',
  cards: [
    {
      card_index: 0,
      header_type: 'image',
      header_url: 'https://example.com/shoes.jpg',
      body_text: 'Running shoes on sale',
      button: {
        type: 'cta_url',
        display_text: 'Buy Now',
        url: 'https://example.com/shoes',
      },
    },
    {
      card_index: 1,
      header_type: 'video',
      header_url: 'https://example.com/jacket.mp4',
      body_text: 'Winter jackets collection',
      button: {
        type: 'cta_url',
        display_text: 'Buy Now',
        url: 'https://example.com/jackets',
      },
    },
  ],
};

let capturedUrl = '';
let capturedInit: RequestInit | null = null;
let mockResponseStatus = 200;
let mockResponseBody: unknown = { messages: [{ id: 'wamid.HBgL12345' }] };

beforeEach(() => {
  capturedUrl = '';
  capturedInit = null;
  mockResponseStatus = 200;
  mockResponseBody = { messages: [{ id: 'wamid.HBgL12345' }] };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify(mockResponseBody), {
        status: mockResponseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendCarouselMessage', () => {
  it('calls correct Meta Graph API URL with Authorization header and correct body', async () => {
    const result = await sendCarouselMessage({
      phoneNumberId: 'phone_123',
      accessToken: 'token_xyz',
      to: '15551234567',
      payload: validPayload,
    });

    expect(capturedUrl).toBe('https://graph.facebook.com/v21.0/phone_123/messages');
    expect(capturedInit?.method).toBe('POST');
    expect((capturedInit?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer token_xyz');

    const parsedBody = JSON.parse(String(capturedInit?.body));
    expect(parsedBody).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '15551234567',
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: 'Browse our collection' },
        action: {
          cards: [
            {
              card_index: 0,
              header: { type: 'image', image: { link: 'https://example.com/shoes.jpg' } },
              body: { text: 'Running shoes on sale' },
              action: {
                buttons: [
                  {
                    type: 'cta_url',
                    parameters: { display_text: 'Buy Now', url: 'https://example.com/shoes' },
                  },
                ],
              },
            },
            {
              card_index: 1,
              header: { type: 'video', video: { link: 'https://example.com/jacket.mp4' } },
              body: { text: 'Winter jackets collection' },
              action: {
                buttons: [
                  {
                    type: 'cta_url',
                    parameters: { display_text: 'Buy Now', url: 'https://example.com/jackets' },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(result).toEqual({ messageId: 'wamid.HBgL12345' });
  });

  it('supports contextMessageId for replies', async () => {
    await sendCarouselMessage({
      phoneNumberId: 'phone_123',
      accessToken: 'token_xyz',
      to: '15551234567',
      payload: validPayload,
      contextMessageId: 'parent_wamid_999',
    });

    const parsedBody = JSON.parse(String(capturedInit?.body));
    expect(parsedBody.context).toEqual({ message_id: 'parent_wamid_999' });
  });

  it('handles quick_reply buttons correctly in action payload', async () => {
    const qrPayload: CarouselInteractivePayload = {
      kind: 'carousel',
      body: 'Select option',
      cards: [
        {
          card_index: 0,
          header_type: 'image',
          header_url: 'https://example.com/opt1.jpg',
          body_text: 'Option 1 text',
          button: {
            type: 'quick_reply',
            id: 'btn_opt_1',
            title: 'Select 1',
          },
        },
        {
          card_index: 1,
          header_type: 'image',
          header_url: 'https://example.com/opt2.jpg',
          body_text: 'Option 2 text',
          button: {
            type: 'quick_reply',
            id: 'btn_opt_2',
            title: 'Select 2',
          },
        },
      ],
    };

    await sendCarouselMessage({
      phoneNumberId: 'phone_123',
      accessToken: 'token_xyz',
      to: '15551234567',
      payload: qrPayload,
    });

    const parsedBody = JSON.parse(String(capturedInit?.body));
    const card0Buttons = parsedBody.interactive.action.cards[0].action.buttons;
    expect(card0Buttons).toEqual([
      {
        type: 'reply',
        reply: { id: 'btn_opt_1', title: 'Select 1' },
      },
    ]);
  });

  it('throws MetaApiError on non-2xx response with envelope details', async () => {
    mockResponseStatus = 400;
    mockResponseBody = {
      error: {
        message: 'Invalid interactive payload',
        code: 100,
        error_subcode: 2018001,
        fbtrace_id: 'fbt_trace_123',
        error_data: { details: 'Header URL is unreachable' },
      },
    };

    await expect(
      sendCarouselMessage({
        phoneNumberId: 'phone_123',
        accessToken: 'token_xyz',
        to: '15551234567',
        payload: validPayload,
      }),
    ).rejects.toThrow(MetaApiError);

    try {
      await sendCarouselMessage({
        phoneNumberId: 'phone_123',
        accessToken: 'token_xyz',
        to: '15551234567',
        payload: validPayload,
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(MetaApiError);
      expect(err.message).toBe('Invalid interactive payload');
      expect(err.code).toBe(100);
      expect(err.subcode).toBe(2018001);
      expect(err.fbtraceId).toBe('fbt_trace_123');
      expect(err.details).toBe('Header URL is unreachable');
      expect(err.httpStatus).toBe(400);
    }
  });

  it('rejects locally on invalid payload before fetch is called', async () => {
    const invalidPayload: CarouselInteractivePayload = {
      kind: 'carousel',
      body: '',
      cards: [],
    };

    await expect(
      sendCarouselMessage({
        phoneNumberId: 'phone_123',
        accessToken: 'token_xyz',
        to: '15551234567',
        payload: invalidPayload,
      }),
    ).rejects.toThrow();

    expect(capturedUrl).toBe('');
  });
});
