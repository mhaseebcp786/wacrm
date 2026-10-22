import { describe, expect, it } from 'vitest';
import { buildSendBody } from './build';
import { validateMessageObject } from './validate';
import type { MessageObject } from './types';
import {
  SAMPLE_CAROUSEL_QR,
  SAMPLE_CAROUSEL_URL,
  SAMPLE_CTA,
  SAMPLE_IMAGE,
  SAMPLE_LIST,
  SAMPLE_REPLY_BUTTONS,
  SAMPLE_TEXT,
} from './fixtures';

function valid(input: unknown): MessageObject {
  const r = validateMessageObject(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.message;
}

const TO = '919876543210';

describe('buildSendBody', () => {
  it('sends location coordinates as strings, as Meta documents them', () => {
    const body = buildSendBody(
      valid({
        message_type: 'location',
        payload: {
          type: 'location',
          location: {
            latitude: 12.9716,
            longitude: -77.5946,
            name: 'Head office',
            address: '1 MG Road',
          },
        },
      }),
      TO
    );
    expect(body.location).toEqual({
      latitude: '12.9716',
      longitude: '-77.5946',
      name: 'Head office',
      address: '1 MG Road',
    });
    // The stored message keeps numbers; only the wire form changes.
    const noText = buildSendBody(
      valid({
        message_type: 'location',
        payload: {
          type: 'location',
          location: { latitude: 0, longitude: 180 },
        },
      }),
      TO
    );
    expect(noText.location).toEqual({ latitude: '0', longitude: '180' });
  });

  it('wraps the stored payload with the Cloud API envelope', () => {
    expect(buildSendBody(valid(SAMPLE_TEXT), TO)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: TO,
      type: 'text',
      text: {
        body: 'Hello {{contact.name}}, thanks for contacting Invicto Associates LLP.',
        preview_url: true,
      },
    });
  });

  it('round-trips reply buttons, cta and list payloads verbatim', () => {
    for (const fixture of [SAMPLE_REPLY_BUTTONS, SAMPLE_CTA, SAMPLE_LIST]) {
      const body = buildSendBody(valid(fixture), TO);
      expect(body.type).toBe('interactive');
      expect(body.interactive).toEqual(fixture.payload.interactive);
    }
  });

  it('round-trips an image payload and adds reply context', () => {
    const body = buildSendBody(valid(SAMPLE_IMAGE), TO, {
      contextMessageId: 'wamid.X',
    });
    expect(body.image).toEqual(SAMPLE_IMAGE.payload.image);
    expect(body.context).toEqual({ message_id: 'wamid.X' });
  });

  it('drops unknown stray keys instead of forwarding them to Meta', () => {
    const body = buildSendBody(
      valid({
        message_type: 'image',
        payload: {
          type: 'image',
          image: { link: 'https://x.test/a.png', evil: 1 },
          junk: true,
        },
      }),
      TO
    );
    expect(body.image).toEqual({ link: 'https://x.test/a.png' });
    expect(body).not.toHaveProperty('junk');
  });

  it('defaults the flow message version and keeps the optional parameters', () => {
    const body = buildSendBody(
      valid({
        message_type: 'interactive',
        payload: {
          type: 'interactive',
          interactive: {
            type: 'flow',
            body: { text: 'Form' },
            action: {
              name: 'flow',
              parameters: {
                flow_id: '1',
                flow_cta: 'Open',
                flow_action: 'navigate',
                flow_action_payload: { screen: 'SCREEN_ONE' },
              },
            },
          },
        },
      }),
      TO
    );
    expect(body.interactive).toMatchObject({
      type: 'flow',
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: '1',
          flow_cta: 'Open',
          flow_action: 'navigate',
          flow_action_payload: { screen: 'SCREEN_ONE' },
        },
      },
    });
  });

  it('sends contacts with a derived first_name and omits blank list section titles', () => {
    const body = buildSendBody(
      valid({
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: [
            {
              name: { formatted_name: 'Asha Rao' },
              phones: [{ phone: '+919876543210' }],
            },
          ],
        },
      }),
      TO
    );
    expect(body.type).toBe('contacts');
    expect(body.contacts).toEqual([
      {
        name: { formatted_name: 'Asha Rao', first_name: 'Asha Rao' },
        phones: [{ phone: '+919876543210' }],
      },
    ]);
  });

  it('uses the business-scoped recipient field when the id is a BSUID', () => {
    const body = buildSendBody(valid(SAMPLE_TEXT), 'US.1234567890');
    expect(body).toHaveProperty('recipient', 'US.1234567890');
    expect(body).not.toHaveProperty('to');
  });
});

describe('buildSendBody — carousel', () => {
  it('sends cta_url on every card, including the reference app "button" quick-reply cards', () => {
    const body = buildSendBody(valid(SAMPLE_CAROUSEL_QR), TO);
    const cards = (
      body.interactive as { action: { cards: Array<Record<string, unknown>> } }
    ).action.cards;
    expect(cards.map((c) => c.type)).toEqual(['cta_url', 'cta_url']);
    expect(cards[0].action).toEqual({
      buttons: [
        {
          type: 'quick_reply',
          quick_reply: { id: 'qr_1792585152611_y2dfz0', title: 'Know more' },
        },
      ],
    });
  });

  it('matches the existing carousel builder output for a URL carousel', () => {
    const body = buildSendBody(valid(SAMPLE_CAROUSEL_URL), TO);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: TO,
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: 'Our latest laminate collections' },
      },
    });
    const cards = (
      body.interactive as { action: { cards: Array<Record<string, unknown>> } }
    ).action.cards;
    expect(cards[1]).toMatchObject({
      card_index: 1,
      type: 'cta_url',
      body: { text: 'Lavvic Acrylic Marble' },
      action: { name: 'cta_url', parameters: { display_text: 'View range' } },
    });
  });
});

describe('buildSendBody — upstream alignment', () => {
  it('sends audio as { link } only (upstream sendMediaMessage; Meta infers voice notes from OGG/OPUS)', () => {
    const body = buildSendBody(
      valid({
        message_type: 'audio',
        payload: {
          type: 'audio',
          audio: { link: 'https://x.test/a.ogg', voice: true },
        },
      }),
      TO
    );
    expect(body.audio).toEqual({ link: 'https://x.test/a.ogg' });
  });
});
