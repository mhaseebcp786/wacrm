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

describe('payload-carrying extension types (location, contact, rich_interactive)', () => {
  const location = {
    type: 'location',
    location: { latitude: 12.9, longitude: 77.6, name: 'HQ' },
  };
  const contact = {
    type: 'contacts',
    contacts: [
      { name: { formatted_name: 'Jane' }, phones: [{ phone: '+15551234567' }] },
    ],
  };
  const cta = {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: 'Visit us' },
      action: {
        name: 'cta_url',
        parameters: { display_text: 'Open', url: 'https://example.com' },
      },
    },
  };

  it('registers them as accepted message types', () => {
    for (const t of ['location', 'contact', 'rich_interactive']) {
      expect(SAAS_MESSAGE_TYPES).toContain(t);
      expect(VALID_MESSAGE_TYPES).toContain(t);
    }
  });

  it('validates the payload per type', () => {
    expect(validateSaasMessageType('location', location)).toBeNull();
    expect(validateSaasMessageType('contact', contact)).toBeNull();
    expect(validateSaasMessageType('rich_interactive', cta)).toBeNull();
    expect(validateSaasMessageType('location', undefined)).toMatch(/location/);
    expect(
      validateSaasMessageType('location', {
        ...location,
        location: { latitude: 999, longitude: 0 },
      })
    ).toMatch(/outOfRange/);
    expect(
      validateSaasMessageType('contact', { type: 'contacts', contacts: [] })
    ).toMatch(/contact/);
  });

  it('accepts reply buttons (with a media header) but refuses lists under rich_interactive', () => {
    const buttons = {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'image', image: { link: 'https://example.com/a.jpg' } },
        body: { text: 'Pick' },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'a', title: 'A' } }],
        },
      },
    };
    expect(validateSaasMessageType('rich_interactive', buttons)).toBeNull();
    const list = {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Menu' },
        action: {
          button: 'Open',
          sections: [{ rows: [{ id: 'r', title: 'Row' }] }],
        },
      },
    };
    expect(validateSaasMessageType('rich_interactive', list)).toMatch(
      /typeMismatch/
    );
  });

  it('refuses a carousel under the rich_interactive type', () => {
    const carousel = {
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: 'Look' },
        action: {
          cards: [0, 1].map((i) => ({
            card_index: i,
            type: 'cta_url',
            header: {
              type: 'image',
              image: { link: `https://example.com/${i}.jpg` },
            },
            action: {
              name: 'cta_url',
              parameters: { display_text: 'Open', url: 'https://example.com' },
            },
          })),
        },
      },
    };
    expect(validateSaasMessageType('rich_interactive', carousel)).toMatch(
      /typeMismatch/
    );
  });

  it('lets a valid payload through validateSendMessageParams and 400s a bad one', () => {
    expect(() =>
      validateSendMessageParams({
        messageType: 'location',
        interactivePayload: location as never,
      })
    ).not.toThrow();
    expect(() =>
      validateSendMessageParams({
        messageType: 'contact',
        interactivePayload: { type: 'contacts', contacts: [] } as never,
      })
    ).toThrow(/Invalid contact message/);
  });

  it('dispatches each type to Meta in its Cloud API shape', async () => {
    const fetchMock = vi.fn<
      (url: string, init: { body: string }) => Promise<Response>
    >(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: 'wamid.Y' }] }), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const cases: Array<[string, unknown, string]> = [
      ['location', location, 'location'],
      ['contact', contact, 'contacts'],
      ['rich_interactive', cta, 'interactive'],
    ];
    for (const [messageType, payload, wireType] of cases) {
      const id = await dispatchSaasMessage({
        messageType,
        phoneNumberId: 'p1',
        accessToken: 't',
        to: '15551234567',
        interactivePayload: payload,
        contextMessageId: 'wamid.ctx',
      });
      expect(id).toBe('wamid.Y');
      const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
      expect(sent.type).toBe(wireType);
      expect(sent.to).toBe('15551234567');
      expect(sent.context).toEqual({ message_id: 'wamid.ctx' });
    }
  });
});
