import { describe, expect, it } from 'vitest';
import type { MessageTemplate } from '@/types';
import { buildSendComponents } from '@/lib/whatsapp/template-send-builder';
import {
  buildCarouselSendComponents,
  documentFilenameFromUrl,
  isCarouselTemplate,
  type SaasCarouselTemplate,
} from './carousel-template-send';
import { parseMetaCarouselCards } from './carousel-template-sync';

const template = (
  overrides: Partial<SaasCarouselTemplate> = {}
): SaasCarouselTemplate => ({
  id: 'tpl-1',
  user_id: 'u1',
  name: 'summer_carousel',
  category: 'Marketing',
  language: 'en_US',
  header_type: 'carousel',
  body_text: 'Hello {{1}}, check these out',
  created_at: '2026-01-01',
  carousel_cards: [
    {
      header_type: 'image',
      header_media_url: 'https://cdn.example.com/a.jpg',
      body_text: 'Item A {{1}}',
      body_sample: ['$5'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'More' },
        {
          type: 'URL',
          text: 'Buy',
          url: 'https://shop.example.com/{{1}}',
          example: 'https://shop.example.com/a',
        },
      ],
    },
    {
      header_type: 'image',
      header_media_url: 'https://cdn.example.com/b.jpg',
      body_text: 'Item B {{1}}',
      body_sample: ['$7'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'More' },
        {
          type: 'URL',
          text: 'Buy',
          url: 'https://shop.example.com/{{1}}',
          example: 'https://shop.example.com/b',
        },
      ],
    },
  ],
  ...overrides,
});

describe('buildCarouselSendComponents', () => {
  it('builds body + carousel with per-card header, body vars and buttons', () => {
    const out = buildCarouselSendComponents(template(), {
      body: ['Sam'],
      carouselCards: [
        { bodyParams: ['$9'], urlButtonParams: { 1: 'item-a' } },
        {
          headerMediaUrl: 'https://cdn.example.com/override.jpg',
          bodyParams: ['$11'],
          urlButtonParams: { 1: 'item-b' },
        },
      ],
    });
    expect(out[0]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'Sam' }],
    });
    const carousel = out[1];
    if (carousel.type !== 'carousel') throw new Error('expected carousel');
    expect(carousel.cards.map((c) => c.card_index)).toEqual([0, 1]);
    expect(carousel.cards[0].components).toEqual([
      {
        type: 'header',
        parameters: [
          { type: 'image', image: { link: 'https://cdn.example.com/a.jpg' } },
        ],
      },
      { type: 'body', parameters: [{ type: 'text', text: '$9' }] },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '0',
        parameters: [{ type: 'payload', payload: 'More' }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '1',
        parameters: [{ type: 'text', text: 'item-a' }],
      },
    ]);
    expect(carousel.cards[1].components[0]).toEqual({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: { link: 'https://cdn.example.com/override.jpg' },
        },
      ],
    });
  });

  it('uses video parameters for video cards and skips empty card bodies', () => {
    const t = template({
      body_text: 'Static body',
      carousel_cards: [
        {
          header_type: 'video',
          header_media_url: 'https://cdn.example.com/a.mp4',
          body_text: 'Watch {{1}}',
          body_sample: ['now'],
          buttons: [],
        },
        {
          header_type: 'video',
          header_media_url: 'https://cdn.example.com/b.mp4',
          body_text: '',
          buttons: [],
        },
      ],
    });
    const out = buildCarouselSendComponents(t, {
      carouselCards: [{ bodyParams: ['now'] }],
    });
    expect(out).toHaveLength(1);
    const carousel = out[0];
    if (carousel.type !== 'carousel') throw new Error('expected carousel');
    expect(carousel.cards[0].components[0]).toEqual({
      type: 'header',
      parameters: [
        { type: 'video', video: { link: 'https://cdn.example.com/a.mp4' } },
      ],
    });
    expect(carousel.cards[0].components[1]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'now' }],
    });
    expect(carousel.cards[1].components).toHaveLength(1);
  });

  it('never sends the template example values when a card variable value is missing', () => {
    expect(() =>
      buildCarouselSendComponents(template(), { body: ['Sam'] })
    ).toThrow(/Card 1: needs 1 body value/);
    expect(() =>
      buildCarouselSendComponents(template(), {
        body: ['Sam'],
        carouselCards: [{ bodyParams: [] }, { bodyParams: ['x'] }],
      })
    ).toThrow(/Card 1: needs 1 body value/);
  });

  it('ignores malformed carouselCards entries instead of crashing', () => {
    const bad = [
      'nope',
      { bodyParams: 'x', headerMediaUrl: 5, urlButtonParams: [1] },
    ] as never;
    expect(() =>
      buildCarouselSendComponents(template(), {
        body: ['Sam'],
        carouselCards: bad,
      })
    ).toThrow(/Card 1: needs 1 body value/);
  });

  it('throws a specific error when media, body or URL values are missing', () => {
    expect(() => buildCarouselSendComponents(template(), {})).toThrow(
      /Body needs 1/
    );
    const noMedia = template({
      carousel_cards: template().carousel_cards!.map((c) => ({
        ...c,
        header_media_url: undefined,
      })),
    });
    expect(() => buildCarouselSendComponents(noMedia, { body: ['x'] })).toThrow(
      /Card 1: select a media file/
    );
    expect(() =>
      buildCarouselSendComponents(template(), {
        body: ['x'],
        carouselCards: [{ bodyParams: ['1'] }, { bodyParams: ['2'] }],
      })
    ).toThrow(/needs a value for its URL variable/);
  });

  it('throws when the template has no local card data', () => {
    expect(() =>
      buildCarouselSendComponents(template({ carousel_cards: null }), {
        body: ['x'],
      })
    ).toThrow(/no card data/);
  });
});

describe('buildSendComponents hook', () => {
  it('routes carousel templates through the carousel builder', () => {
    const t = template() as unknown as MessageTemplate;
    expect(isCarouselTemplate(t)).toBe(true);
    const out = buildSendComponents(t, {
      body: ['Sam'],
      carouselCards: [
        { bodyParams: ['1'], urlButtonParams: { 1: 'a' } },
        { bodyParams: ['2'], urlButtonParams: { 1: 'b' } },
      ],
    });
    expect(out.map((c) => c.type)).toEqual(['body', 'carousel']);
  });

  it('adds a filename to document headers derived from the URL', () => {
    const t: MessageTemplate = {
      id: 't',
      user_id: 'u',
      name: 'doc',
      category: 'Utility',
      body_text: 'Hi',
      header_type: 'document',
      created_at: 'x',
      header_media_url: 'https://cdn.example.com/files/Price%20List.pdf',
    };
    expect(buildSendComponents(t)[0]).toEqual({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: 'https://cdn.example.com/files/Price%20List.pdf',
            filename: 'Price List.pdf',
          },
        },
      ],
    });
  });
});

describe('documentFilenameFromUrl', () => {
  it('returns the decoded last path segment or undefined', () => {
    expect(
      documentFilenameFromUrl('https://a.com/x/y/brochure.pdf?sig=1')
    ).toBe('brochure.pdf');
    expect(documentFilenameFromUrl('https://a.com/')).toBeUndefined();
    expect(documentFilenameFromUrl('not a url')).toBeUndefined();
    expect(documentFilenameFromUrl(undefined)).toBeUndefined();
  });
});

describe('parseMetaCarouselCards (sync)', () => {
  const metaComponents = [
    { type: 'BODY' },
    {
      type: 'CAROUSEL',
      cards: [
        {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            {
              type: 'BODY',
              text: 'Card {{1}}',
              example: { body_text: [['A']] },
            },
            {
              type: 'BUTTONS',
              buttons: [
                { type: 'QUICK_REPLY', text: 'Go' },
                {
                  type: 'URL',
                  text: 'Buy',
                  url: 'https://s.com/{{1}}',
                  example: ['https://s.com/x'],
                },
              ],
            },
          ],
        },
        {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Plain' },
          ],
        },
      ],
    },
  ];

  it('parses cards, samples and buttons', () => {
    const cards = parseMetaCarouselCards(metaComponents);
    expect(cards).toHaveLength(2);
    expect(cards![0]).toEqual({
      header_type: 'image',
      body_text: 'Card {{1}}',
      body_sample: ['A'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'Go' },
        {
          type: 'URL',
          text: 'Buy',
          url: 'https://s.com/{{1}}',
          example: 'https://s.com/x',
        },
      ],
    });
  });

  it('returns null for non-carousel and catalog (product) carousels', () => {
    expect(parseMetaCarouselCards([{ type: 'BODY' }])).toBeNull();
    expect(
      parseMetaCarouselCards([
        {
          type: 'CAROUSEL',
          cards: [{ components: [{ type: 'HEADER', format: 'PRODUCT' }] }],
        },
      ])
    ).toBeNull();
  });
});
