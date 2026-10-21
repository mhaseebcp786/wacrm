import { describe, expect, it } from 'vitest';
import {
  validateCarouselTemplatePayload,
  buildMetaCarouselTemplatePayload,
  type CarouselTemplateCard,
  type CarouselTemplatePayload,
} from './carousel-template';

const card = (
  n: number,
  overrides: Partial<CarouselTemplateCard> = {}
): CarouselTemplateCard => ({
  header_type: 'image',
  header_media_url: `https://example.com/item${n}.jpg`,
  body_text: `Item ${n} is {{1}} off today!`,
  body_sample: ['20%'],
  buttons: [
    { type: 'URL', text: 'Shop Now', url: `https://example.com/items/${n}` },
  ],
  ...overrides,
});

const valid = (): CarouselTemplatePayload => ({
  name: 'featured_products_v1',
  category: 'Marketing',
  language: 'en_US',
  header_type: 'carousel',
  body_text: 'Discover our top products this season!',
  cards: [card(1), card(2)],
});

const fails = (
  mutate: (p: CarouselTemplatePayload) => void,
  message: RegExp
) => {
  const p = valid();
  mutate(p);
  expect(() => validateCarouselTemplatePayload(p)).toThrow(message);
};

describe('validateCarouselTemplatePayload', () => {
  it('passes on a well-formed carousel template', () => {
    expect(() => validateCarouselTemplatePayload(valid())).not.toThrow();
  });

  it('accepts video cards, quick replies and call buttons (up to 2 per card)', () => {
    const p = valid();
    const mk = (n: number): CarouselTemplateCard => ({
      header_type: 'video',
      header_media_url: `https://example.com/v${n}.mp4`,
      body_text: 'Watch this',
      buttons: [
        { type: 'QUICK_REPLY', text: 'More' },
        { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+14155550100' },
      ],
    });
    p.cards = [mk(1), mk(2)];
    expect(() => validateCarouselTemplatePayload(p)).not.toThrow();
  });

  it('requires the MARKETING category', () => {
    fails((p) => (p.category = 'Utility'), /MARKETING/);
  });

  it('requires a template body (Meta requires one for carousels)', () => {
    fails((p) => (p.body_text = ' '), /body text is required/i);
  });

  it('requires examples for template body variables', () => {
    fails((p) => (p.body_text = 'Hi {{1}}'), /example value/i);
  });

  it('enforces 2–10 cards', () => {
    fails((p) => (p.cards = [card(1)]), /Minimum 2 cards/);
    fails(
      (p) => (p.cards = Array.from({ length: 11 }, (_, i) => card(i + 1))),
      /Maximum 10 cards/
    );
  });

  it('rejects document headers and mixed media types', () => {
    fails(
      (p) => (p.cards[0] = { ...card(1), header_type: 'document' as never }),
      /image or video/
    );
    fails(
      (p) => (p.cards[1] = card(2, { header_type: 'video' })),
      /same media type/
    );
  });

  it('requires https media', () => {
    fails(
      (p) =>
        (p.cards[0] = card(1, {
          header_media_url: 'http://example.com/a.jpg',
        })),
      /HTTPS/
    );
    fails(
      (p) => (p.cards[0] = card(1, { header_media_url: undefined })),
      /media file is required/
    );
  });

  it('enforces the 160-char card body and body presence', () => {
    fails(
      (p) =>
        (p.cards[0] = card(1, { body_text: 'x'.repeat(161), body_sample: [] })),
      /160/
    );
    fails(
      (p) => (p.cards[0] = card(1, { body_text: '', body_sample: [] })),
      /every card has body text or none/
    );
    const none = valid();
    none.cards = [
      card(1, { body_text: '', body_sample: [] }),
      card(2, { body_text: '', body_sample: [] }),
    ];
    expect(() => validateCarouselTemplatePayload(none)).not.toThrow();
  });

  it('requires an example for every card body variable', () => {
    fails((p) => (p.cards[0] = card(1, { body_sample: [] })), /example values/);
  });

  it('caps buttons at 2 per card and button text at 25 chars', () => {
    const three: CarouselTemplateCard['buttons'] = [
      { type: 'QUICK_REPLY', text: 'a' },
      { type: 'QUICK_REPLY', text: 'b' },
      { type: 'QUICK_REPLY', text: 'c' },
    ];
    fails(
      (p) => (p.cards[0] = card(1, { buttons: three })),
      /maximum 2 buttons/
    );
    fails(
      (p) =>
        (p.cards[0] = card(1, {
          buttons: [{ type: 'QUICK_REPLY', text: 'x'.repeat(26) }],
        })),
      /25 characters/
    );
  });

  it('requires identical button layouts across cards', () => {
    fails(
      (p) =>
        (p.cards[1] = card(2, {
          buttons: [{ type: 'QUICK_REPLY', text: 'Hi' }],
        })),
      /same buttons/
    );
    fails((p) => (p.cards[1] = card(2, { buttons: [] })), /same buttons/);
  });

  it('validates URL buttons (https, {{1}} suffix + example)', () => {
    const url = (
      u: string,
      example?: string
    ): CarouselTemplateCard['buttons'] => [
      { type: 'URL', text: 'Go', url: u, ...(example ? { example } : {}) },
    ];
    fails(
      (p) => (p.cards[0] = card(1, { buttons: url('http://example.com') })),
      /https/
    );
    fails(
      (p) => (p.cards[0] = card(1, { buttons: url('https://e.com/{{1}}') })),
      /example URL is required/
    );
    fails(
      (p) =>
        (p.cards[0] = card(1, {
          buttons: url('https://e.com/{{1}}/x', 'https://e.com/a/x'),
        })),
      /at the end/
    );
    const p = valid();
    p.cards = [
      card(1, { buttons: url('https://e.com/{{1}}', 'https://e.com/a') }),
      card(2, { buttons: url('https://e.com/{{1}}', 'https://e.com/b') }),
    ];
    expect(() => validateCarouselTemplatePayload(p)).not.toThrow();
  });

  it('rejects copy-code buttons on cards', () => {
    fails(
      (p) =>
        (p.cards[0] = card(1, {
          buttons: [{ type: 'COPY_CODE', text: 'Copy', example: 'ABC' }],
        })),
      /Quick Reply, URL or Call/
    );
  });
});

describe('buildMetaCarouselTemplatePayload', () => {
  const withHandles = (): CarouselTemplatePayload => {
    const p = valid();
    p.cards.forEach((c, i) => (c.header_handle = `h${i}`));
    p.sample_values = { body: [] };
    return p;
  };

  it('emits BODY + CAROUSEL with per-card HEADER(handle)/BODY/BUTTONS', () => {
    const meta = buildMetaCarouselTemplatePayload(withHandles());
    expect(meta.category).toBe('MARKETING');
    expect(meta.components.map((c) => c.type)).toEqual(['BODY', 'CAROUSEL']);
    const carousel = meta.components[1];
    if (carousel.type !== 'CAROUSEL') throw new Error('expected carousel');
    expect(carousel.cards).toHaveLength(2);
    const [header, body, buttons] = carousel.cards[0].components;
    expect(header).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['h0'] },
    });
    expect(body).toEqual({
      type: 'BODY',
      text: 'Item 1 is {{1}} off today!',
      example: { body_text: [['20%']] },
    });
    expect(buttons).toEqual({
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'Shop Now', url: 'https://example.com/items/1' },
      ],
    });
  });

  it('never falls back to a plain URL sample (Meta rejects it at creation)', () => {
    expect(() => buildMetaCarouselTemplatePayload(valid())).toThrow(
      /handle missing/
    );
  });

  it('maps VIDEO format and attaches the template body example', () => {
    const p = withHandles();
    p.body_text = 'Hi {{1}}';
    p.sample_values = { body: ['Sam'] };
    p.cards.forEach((c) => (c.header_type = 'video'));
    const meta = buildMetaCarouselTemplatePayload(p);
    expect(meta.components[0]).toMatchObject({
      example: { body_text: [['Sam']] },
    });
    const carousel = meta.components[1];
    if (carousel.type !== 'CAROUSEL') throw new Error('expected carousel');
    expect(carousel.cards[0].components[0]).toMatchObject({ format: 'VIDEO' });
  });
});
