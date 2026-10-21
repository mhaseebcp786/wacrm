import { describe, expect, it } from 'vitest';
import {
  validateCarouselInteractivePayload,
  carouselPayloadPreviewText,
  blankCarouselPayload,
  carouselPayloadToPreview,
  interactiveMessageTypeFor,
  isCarouselPayload,
  patchCarouselCardById,
  stripCarouselCardIds,
  CAROUSEL_LIMITS,
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
          header_type: 'document' as unknown as 'image',
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

describe('validateCarouselInteractivePayload - Meta limits', () => {
  const withCard0 = (patch: Record<string, unknown>) => ({
    ...validPayload,
    cards: [{ ...validPayload.cards[0], ...patch }, validPayload.cards[1]],
  });

  it('accepts an empty card body (optional per Meta)', () => {
    expect(
      validateCarouselInteractivePayload(withCard0({ body_text: '' }))
    ).toEqual({ ok: true });
  });

  it('rejects a card body with more than 2 line breaks', () => {
    const r = validateCarouselInteractivePayload(
      withCard0({ body_text: 'a\nb\nc\nd' })
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a button label over 20 characters (cta_url)', () => {
    const r = validateCarouselInteractivePayload(
      withCard0({
        button: {
          type: 'cta_url',
          display_text: 'x'.repeat(21),
          url: 'https://a.co',
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(CAROUSEL_LIMITS.maxButtonTextLength).toBe(20);
  });

  it('accepts a 20-character button label', () => {
    const r = validateCarouselInteractivePayload(
      withCard0({
        button: {
          type: 'cta_url',
          display_text: 'x'.repeat(20),
          url: 'https://a.co',
        },
      })
    );
    expect(r).toEqual({ ok: true });
  });

  it('rejects a non-https button URL', () => {
    const r = validateCarouselInteractivePayload(
      withCard0({
        button: { type: 'cta_url', display_text: 'Go', url: 'http://a.co' },
      })
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a quick-reply id over 256 characters and a label over 20', () => {
    const qr = (button: Record<string, unknown>) => ({
      kind: 'carousel',
      body: 'b',
      cards: [0, 1].map((i) => ({
        card_index: i,
        header_type: 'image',
        header_url: 'https://a.co/i.jpg',
        body_text: '',
        button,
      })),
    });
    expect(
      validateCarouselInteractivePayload(
        qr({ type: 'quick_reply', id: 'i'.repeat(257), title: 'ok' })
      ).ok
    ).toBe(false);
    expect(
      validateCarouselInteractivePayload(
        qr({ type: 'quick_reply', id: 'i'.repeat(256), title: 'ok' })
      ).ok
    ).toBe(true);
    expect(
      validateCarouselInteractivePayload(
        qr({ type: 'quick_reply', title: 'y'.repeat(21) })
      ).ok
    ).toBe(false);
  });

  it('rejects mixed image/video headers', () => {
    const r = validateCarouselInteractivePayload(
      withCard0({ header_type: 'video', header_url: 'https://a.co/v.mp4' })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('same header type');
  });

  it('rejects a body over 1024 chars and an empty body', () => {
    expect(
      validateCarouselInteractivePayload({
        ...validPayload,
        body: 'a'.repeat(1025),
      }).ok
    ).toBe(false);
    expect(
      validateCarouselInteractivePayload({ ...validPayload, body: ' ' }).ok
    ).toBe(false);
  });
});

describe('carousel helpers', () => {
  it('isCarouselPayload / interactiveMessageTypeFor discriminate on kind', () => {
    expect(isCarouselPayload(validPayload)).toBe(true);
    expect(isCarouselPayload({ kind: 'buttons', body: 'x', buttons: [] })).toBe(
      false
    );
    expect(isCarouselPayload(null)).toBe(false);
    expect(interactiveMessageTypeFor(validPayload)).toBe('carousel');
    expect(interactiveMessageTypeFor({ kind: 'list' })).toBe('interactive');
  });

  it('carouselPayloadToPreview maps cards to preview props', () => {
    const preview = carouselPayloadToPreview(validPayload);
    expect(preview.body).toBe(validPayload.body);
    expect(preview.cards).toHaveLength(2);
    expect(preview.cards[0]).toEqual({
      type: 'image',
      url: 'https://example.com/product1.jpg',
      bodyText: 'Product 1: Premium Quality Shoes',
      buttons: [{ text: 'View Product', type: 'cta_url' }],
    });
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
      'Check out our featured products:'
    );
    expect(carouselPayloadPreviewText({ ...validPayload, body: '   ' })).toBe(
      '\u{1F3A0} Carousel'
    );
  });
});

describe('malformed persisted payloads (R15)', () => {
  const card = (over: Record<string, unknown> = {}) => ({
    card_index: 0,
    header_type: 'image',
    header_url: 'https://x.com/a.jpg',
    body_text: 'b',
    button: { type: 'cta_url', display_text: 'Go', url: 'https://x.com' },
    ...over,
  });
  const payload = (cards: unknown[], over: Record<string, unknown> = {}) => ({
    kind: 'carousel',
    body: 'hi',
    cards,
    ...over,
  });

  it('accepts a well formed payload', () => {
    expect(isCarouselPayload(payload([card(), card()]))).toBe(true);
  });

  it.each([
    ['cards missing', { kind: 'carousel', body: 'x' }],
    ['no cards', payload([])],
    ['null card', payload([null])],
    ['card without button', payload([card({ button: undefined })])],
    ['button of unknown type', payload([card({ button: { type: 'nope' } })])],
    [
      'cta without display_text',
      payload([card({ button: { type: 'cta_url' } })]),
    ],
    [
      'quick reply without title',
      payload([card({ button: { type: 'quick_reply' } })]),
    ],
    ['bad header type', payload([card({ header_type: 'document' })])],
    ['non-string header_url', payload([card({ header_url: 5 })])],
    ['non-string body_text', payload([card({ body_text: 5 })])],
    ['non-string body', payload([card()], { body: 5 })],
    ['array instead of object', []],
  ])('rejects: %s', (_label, value) => {
    expect(isCarouselPayload(value)).toBe(false);
  });

  it('carouselPayloadToPreview does not throw on a card with a missing button', () => {
    const broken = payload([
      card({ button: undefined }),
    ]) as unknown as CarouselInteractivePayload;
    expect(() => carouselPayloadToPreview(broken)).not.toThrow();
    expect(carouselPayloadToPreview(broken).cards[0]!.buttons).toEqual([]);
  });
});

describe('client card ids (R5)', () => {
  it('blank cards get distinct cids and stripCarouselCardIds removes them', () => {
    const blank = blankCarouselPayload();
    expect(blank.cards[0]!.cid).toBeTruthy();
    expect(blank.cards[0]!.cid).not.toBe(blank.cards[1]!.cid);
    const clean = stripCarouselCardIds(blank);
    expect(JSON.stringify(clean)).not.toContain('cid');
    expect(clean.cards).toHaveLength(2);
  });

  it('patches by cid against the latest payload and drops a late result for a removed card', () => {
    const blank = blankCarouselPayload();
    const [a, b] = blank.cards;
    // body typed on card b while an upload for b is in flight
    const typed = patchCarouselCardById(blank, b!.cid!, (c) => ({
      ...c,
      body_text: 'typed',
    }));
    const uploaded = patchCarouselCardById(typed, b!.cid!, (c) => ({
      ...c,
      header_url: 'https://x.com/b.jpg',
    }));
    expect(uploaded.cards[1]).toMatchObject({
      body_text: 'typed',
      header_url: 'https://x.com/b.jpg',
    });
    expect(uploaded.cards[0]).toBe(a);
    // card b removed: the late upload must not touch anything
    const removed = { ...uploaded, cards: [a!] };
    expect(
      patchCarouselCardById(removed, b!.cid!, (c) => ({
        ...c,
        header_url: 'late',
      }))
    ).toBe(removed);
  });
});
