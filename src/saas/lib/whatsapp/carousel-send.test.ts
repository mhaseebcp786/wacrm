import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCarouselRequestBody, sendCarouselMessage } from './carousel-send';
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
      header_type: 'image',
      header_url: 'https://example.com/jacket.jpg',
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
    })
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

    expect(capturedUrl).toBe(
      'https://graph.facebook.com/v21.0/phone_123/messages'
    );
    expect(capturedInit?.method).toBe('POST');
    expect(
      (capturedInit?.headers as Record<string, string>)?.['Authorization']
    ).toBe('Bearer token_xyz');

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
              type: 'cta_url',
              header: {
                type: 'image',
                image: { link: 'https://example.com/shoes.jpg' },
              },
              body: { text: 'Running shoes on sale' },
              action: {
                name: 'cta_url',
                parameters: {
                  display_text: 'Buy Now',
                  url: 'https://example.com/shoes',
                },
              },
            },
            {
              card_index: 1,
              type: 'cta_url',
              header: {
                type: 'image',
                image: { link: 'https://example.com/jacket.jpg' },
              },
              body: { text: 'Winter jackets collection' },
              action: {
                name: 'cta_url',
                parameters: {
                  display_text: 'Buy Now',
                  url: 'https://example.com/jackets',
                },
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
    const card0 = parsedBody.interactive.action.cards[0];
    // Per Meta's doc the card type stays 'cta_url' even for quick-reply cards.
    expect(card0.type).toBe('cta_url');
    expect(card0.action).toEqual({
      buttons: [
        {
          type: 'quick_reply',
          quick_reply: { id: 'btn_opt_1', title: 'Select 1' },
        },
      ],
    });
  });

  it('omits the optional card body when empty and falls back to a generated quick-reply id', () => {
    const body = buildCarouselRequestBody('15551234567', {
      kind: 'carousel',
      body: 'Pick one',
      cards: [
        {
          card_index: 5,
          header_type: 'image',
          header_url: 'https://example.com/a.jpg',
          body_text: '',
          button: { type: 'quick_reply', title: 'A' },
        },
        {
          card_index: 9,
          header_type: 'image',
          header_url: 'https://example.com/b.jpg',
          body_text: '   ',
          button: { type: 'quick_reply', title: 'B' },
        },
      ],
    }) as {
      interactive: { action: { cards: Array<Record<string, unknown>> } };
    };

    const cards = body.interactive.action.cards;
    // contiguous 0-based indices regardless of the stored card_index
    expect(cards.map((c) => c.card_index)).toEqual([0, 1]);
    expect(cards[0]).not.toHaveProperty('body');
    expect(cards[1]).not.toHaveProperty('body');
    expect(
      (cards[0].action as { buttons: Array<{ quick_reply: { id: string } }> })
        .buttons[0].quick_reply.id
    ).toBe('card_0_btn');
  });

  it('never sends a top-level interactive header or footer', () => {
    const body = buildCarouselRequestBody('15551234567', validPayload) as {
      interactive: Record<string, unknown>;
    };
    expect(Object.keys(body.interactive).sort()).toEqual([
      'action',
      'body',
      'type',
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
      })
    ).rejects.toThrow(MetaApiError);

    try {
      await sendCarouselMessage({
        phoneNumberId: 'phone_123',
        accessToken: 'token_xyz',
        to: '15551234567',
        payload: validPayload,
      });
    } catch (e) {
      const err = e as MetaApiError;
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
      })
    ).rejects.toThrow();

    expect(capturedUrl).toBe('');
  });
});

describe('buildCarouselRequestBody - video cards', () => {
  it('builds video headers when every card is a video', () => {
    const body = buildCarouselRequestBody('15551234567', {
      kind: 'carousel',
      body: 'Watch',
      cards: [0, 1].map((i) => ({
        card_index: i,
        header_type: 'video' as const,
        header_url: `https://example.com/v${i}.mp4`,
        body_text: 'clip',
        button: {
          type: 'cta_url' as const,
          display_text: 'Open',
          url: 'https://example.com',
        },
      })),
    }) as { interactive: { action: { cards: Array<{ header: unknown }> } } };
    expect(body.interactive.action.cards[1].header).toEqual({
      type: 'video',
      video: { link: 'https://example.com/v1.mp4' },
    });
  });
});
