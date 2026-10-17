import { describe, expect, it } from 'vitest';
import {
  validateCarouselTemplatePayload,
  buildMetaCarouselTemplatePayload,
  type CarouselTemplatePayload,
} from './carousel-template';

const validTemplate: CarouselTemplatePayload = {
  name: 'featured_products_v1',
  category: 'Marketing',
  language: 'en_US',
  header_type: 'carousel',
  body_text: 'Discover our top products this season!',
  cards: [
    {
      header_type: 'image',
      header_handle: 'handle_123',
      body_text: 'Item 1 is {{1}} off today!',
      body_sample: ['20%'],
      buttons: [
        {
          type: 'URL',
          text: 'Shop Now',
          url: 'https://example.com/items/1',
        },
      ],
    },
    {
      header_type: 'image',
      header_media_url: 'https://example.com/item2.jpg',
      body_text: 'Item 2 is {{1}} off today!',
      body_sample: ['15%'],
      buttons: [
        {
          type: 'URL',
          text: 'Shop Now',
          url: 'https://example.com/items/2',
        },
      ],
    },
  ],
};

describe('validateCarouselTemplatePayload', () => {
  it('passes on well-formed carousel template', () => {
    expect(() => validateCarouselTemplatePayload(validTemplate)).not.toThrow();
  });

  it('fails with mixed button types across cards', () => {
    const mixed: CarouselTemplatePayload = {
      ...validTemplate,
      cards: [
        validTemplate.cards[0],
        {
          header_type: 'image',
          header_media_url: 'https://example.com/item2.jpg',
          body_text: 'Item 2 description',
          buttons: [
            {
              type: 'QUICK_REPLY',
              text: 'View',
            },
          ],
        },
      ],
    };
    expect(() => validateCarouselTemplatePayload(mixed)).toThrow(
      'All cards must use the same button type',
    );
  });

  it('fails with < 2 cards', () => {
    const singleCard: CarouselTemplatePayload = {
      ...validTemplate,
      cards: [validTemplate.cards[0]],
    };
    expect(() => validateCarouselTemplatePayload(singleCard)).toThrow(
      'Minimum 2 cards required',
    );
  });

  it('fails with > 10 cards', () => {
    const elevenCards = Array.from({ length: 11 }, (_, i) => ({
      header_type: 'image' as const,
      header_media_url: `https://example.com/item${i}.jpg`,
      body_text: `Item ${i}`,
      buttons: [
        {
          type: 'URL' as const,
          text: 'Shop',
          url: `https://example.com/items/${i}`,
        },
      ],
    }));
    const tooMany: CarouselTemplatePayload = {
      ...validTemplate,
      cards: elevenCards,
    };
    expect(() => validateCarouselTemplatePayload(tooMany)).toThrow(
      'Maximum 10 cards allowed',
    );
  });

  it('fails with card body > 160 chars', () => {
    const longBody: CarouselTemplatePayload = {
      ...validTemplate,
      cards: [
        {
          ...validTemplate.cards[0],
          body_text: 'x'.repeat(161),
          body_sample: undefined,
        },
        validTemplate.cards[1],
      ],
    };
    expect(() => validateCarouselTemplatePayload(longBody)).toThrow(
      'Card body exceeds 160 character limit',
    );
  });

  it('fails when card has document header format', () => {
    const docCard: CarouselTemplatePayload = {
      ...validTemplate,
      cards: [
        {
          ...validTemplate.cards[0],
          header_type: 'document' as any,
        },
        validTemplate.cards[1],
      ],
    };
    expect(() => validateCarouselTemplatePayload(docCard)).toThrow(
      'only support image or video headers',
    );
  });
});

describe('buildMetaCarouselTemplatePayload', () => {
  it('produces correct Meta payload shape with CAROUSEL component', () => {
    const payload = buildMetaCarouselTemplatePayload(validTemplate);
    expect(payload.name).toBe('featured_products_v1');
    expect(payload.category).toBe('MARKETING');
    expect(payload.language).toBe('en_US');
    expect(payload.components.length).toBe(2);

    const bodyComp = payload.components[0];
    expect(bodyComp.type).toBe('BODY');
    expect(bodyComp.text).toBe('Discover our top products this season!');

    const carouselComp = payload.components[1] as any;
    expect(carouselComp.type).toBe('CAROUSEL');
    expect(carouselComp.cards.length).toBe(2);

    // Card 0 checks
    const card0 = carouselComp.cards[0];
    expect(card0.components.length).toBe(3);
    expect(card0.components[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['handle_123'] },
    });
    expect(card0.components[1]).toEqual({
      type: 'BODY',
      text: 'Item 1 is {{1}} off today!',
      example: { body_text: [['20%']] },
    });
    expect(card0.components[2]).toEqual({
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Shop Now',
          url: 'https://example.com/items/1',
        },
      ],
    });

    // Card 1 checks
    const card1 = carouselComp.cards[1];
    expect(card1.components[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_url: ['https://example.com/item2.jpg'] },
    });
  });
});
