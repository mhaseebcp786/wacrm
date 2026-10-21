import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SAAS_MESSAGE_TYPES,
  dispatchSaasMessage,
  validateSaasMessageType,
} from './send-message-extensions';
import {
  validateSendMessageParams,
  VALID_MESSAGE_TYPES,
} from '@/lib/whatsapp/send-message';
import {
  blankCarouselPayload,
  type CarouselInteractivePayload,
} from './carousel-interactive';

const good: CarouselInteractivePayload = {
  kind: 'carousel',
  body: 'Hello',
  cards: [0, 1].map((i) => ({
    card_index: i,
    header_type: 'image' as const,
    header_url: `https://example.com/${i}.jpg`,
    body_text: '',
    button: {
      type: 'cta_url' as const,
      display_text: 'Open',
      url: 'https://example.com',
    },
  })),
};

afterEach(() => vi.unstubAllGlobals());

describe('send-message extensions', () => {
  it('registers carousel as an accepted message_type', () => {
    expect(SAAS_MESSAGE_TYPES).toContain('carousel');
    expect(VALID_MESSAGE_TYPES).toContain('carousel');
  });

  it('validateSaasMessageType ignores non-saas types and validates carousel', () => {
    expect(validateSaasMessageType('text', undefined)).toBeNull();
    expect(validateSaasMessageType('carousel', good)).toBeNull();
    expect(validateSaasMessageType('carousel', blankCarouselPayload())).toMatch(
      /body/i
    );
  });

  it('validateSendMessageParams lets a valid carousel through and 400s a bad one', () => {
    expect(() =>
      validateSendMessageParams({
        messageType: 'carousel',
        interactivePayload: good as never,
      })
    ).not.toThrow();
    expect(() =>
      validateSendMessageParams({
        messageType: 'carousel',
        interactivePayload: { ...good, cards: [good.cards[0]] } as never,
      })
    ).toThrow(/Minimum 2 cards/);
  });

  it('dispatchSaasMessage posts the carousel and returns the wamid; passes through other types', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const id = await dispatchSaasMessage({
      messageType: 'carousel',
      phoneNumberId: 'p1',
      accessToken: 't',
      to: '15551234567',
      interactivePayload: good,
    });
    expect(id).toBe('wamid.X');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const other = await dispatchSaasMessage({
      messageType: 'text',
      phoneNumberId: 'p1',
      accessToken: 't',
      to: '1',
      interactivePayload: undefined,
    });
    expect(other).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
