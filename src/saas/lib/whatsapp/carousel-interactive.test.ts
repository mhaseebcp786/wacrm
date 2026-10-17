import { describe, expect, it } from 'vitest';
import {
  validateCarouselInteractivePayload,
  carouselPayloadPreviewText,
  blankCarouselPayload,
  type CarouselInteractivePayload,
} from './carousel-interactive';

const validPayload: CarouselInteractivePayload = {
  kind: 'carousel',
  body: 'Check out our featured products:',
  cards: [
    {
      card_index: 0,
      header_type: 'image',
      header_url: 'https://example.com/product1.jpg',
      body_text: 'Product 1: Premium Quality Shoes',
      button: {
        type: 'cta_url',
        display_text: 'View Product',
        url: 'https://example.com/products/1',
      },
    },
    {
      card_index: 1,
      header_type: 'image',
      header_url: 'https://example.com/product2.jpg',
      body_text: 'Product 2: Casual Sneakers',
      button: {
        type: 'cta_url',
        display_text: 'View Product',
        url: 'https://example.com/products/2',
      },
    },
  ],
};

describe('validateCarouselInteractivePayload', () => {
  it('accepts a valid payload with 2 cards, image headers, and cta_url buttons', () => {
    const result = validateCarouselInteractivePayload(validPayload);
    expect(result).toEqual({ ok: true });
  });

  it('accepts a valid payload with quick_reply buttons', () => {
    const payload: CarouselInteractivePayload = {
      kind: 'carousel',
      body: 'Select an option:',
      cards: [
        {
          card_index: 0,
          header_type: 'video',
          header_url: 'https://example.com/v1.mp4',
          body_text: 'Option A details',
          button: {
            type: 'quick_reply',
            id: 'opt_a',
            title: 'Choose A',
          },
        },
        {
          card_index: 1,
          header_type: 'video',
          header_url: 'https://example.com/v2.mp4',
          body_text: 'Option B details',
          button: {
            type: 'quick_reply',
            id: 'opt_b',
            title: 'Choose B',
          },
        },
      ],
    };
    expect(validateCarouselInteractivePayload(payload)).toEqual({ ok: true });
  });

  it('fails with < 2 cards', () => {
    const invalid = {
      ...validPayload,
      cards: [validPayload.cards[0]],
    };
    const result = validateCarouselInteractivePayload(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Minimum 2 cards required');
    }
  });

  it('fails with > 10 cards', () => {
    const elevenCards = Array.from({ length: 11 }, (_, i) => ({
      card_index: i,
      header_type: 'image' as const,
      header_url: `https://example.com/item${i}.jpg`,
      body_text: `Item ${i}`,
      button: {
        type: 'cta_url' as const,
        display_text: 'View',
        url: `https://example.com/items/${i}`,
      },
    }));
    const invalid = {
      ...validPayload,
      cards: elevenCards,
    };
    const result = validateCarouselInteractivePayload(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Maximum 10 cards allowed');
    }
  });

  it('fails with mixed button types', () => {
    const mixed = {
      ...validPayload,
      cards: [
        validPayload.cards[0],
        {
          card_index: 1,
          header_type: 'image' as const,
          header_url: 'https://example.com/img.jpg',
          body_text: 'Item 2',
          button: {
            type: 'quick_reply' as const,
            id: 'btn_2',
            title: 'Quick Reply',
          },
        },
      ],
    };
    const result = validateCarouselInteractivePayload(mixed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('All cards must use the same button type');
    }
  });

  it('fails with document header type', () => {
    const withDoc = {
      ...validPayload,
      cards: [
        {
          ...validPayload.cards[0],
          header_type: 'document' as any,
        },
        validPayload.cards[1],
      ],
    };
    const result = validateCarouselInteractivePayload(withDoc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('only support image or video');
    }
  });

  it('fails with card body > 160 chars', () => {
    const longBody = {
      ...validPayload,
      cards: [
        {
          ...validPayload.cards[0],
          body_text: 'a'.repeat(161),
        },
        validPayload.cards[1],
      ],
    };
    const result = validateCarouselInteractivePayload(longBody);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('160 character limit');
    }
  });

  it('fails with non-https header URL', () => {
    const badUrl = {
      ...validPayload,
      cards: [
        {
          ...validPayload.cards[0],
          header_url: 'http://example.com/img.jpg',
        },
        validPayload.cards[1],
      ],
    };
    const result = validateCarouselInteractivePayload(badUrl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('valid HTTPS URL');
    }
  });
});

describe('blankCarouselPayload', () => {
  it('returns a 2-card blank carousel structure', () => {
    const blank = blankCarouselPayload();
    expect(blank.kind).toBe('carousel');
    expect(blank.cards.length).toBe(2);
    expect(blank.cards[0].card_index).toBe(0);
    expect(blank.cards[1].card_index).toBe(1);
    expect(blank.cards[0].button.type).toBe('cta_url');
    expect(blank.cards[1].button.type).toBe('cta_url');
  });
});

describe('carouselPayloadPreviewText', () => {
  it('returns body text or sensible fallback', () => {
    expect(carouselPayloadPreviewText(validPayload)).toBe(
      'Check out our featured products:',
    );
    expect(
      carouselPayloadPreviewText({ ...validPayload, body: '   ' }),
    ).toBe('[carousel]');
  });
});
