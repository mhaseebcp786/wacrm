import { describe, it, expect } from 'vitest';
import type { MessageTemplate } from '@/types';
import {
  addCard,
  addCardButton,
  applyCarouselDefaults,
  buildCarouselRequest,
  carouselFormError,
  changeCardMediaType,
  checkCarouselConsistency,
  createBlankCard,
  createInitialCards,
  ensureCardIds,
  patchCardById,
  removeCardById,
  describeCarouselIssue,
  ensureMinCards,
  initCarouselSendState,
  insertVariableAtCaret,
  patchCardButton,
  removeCard,
  removeCardButton,
  setCardBody,
  setCardMediaUrl,
  setCardSample,
  templateCarouselCards,
  toCardPayload,
  toCarouselSendParams,
  toPreviewCards,
  validateCarouselCards,
  validateCarouselForm,
  validateCarouselSend,
  type CarouselTemplateCard,
} from './template-form-carousel';

function goodCard(
  overrides: Partial<CarouselTemplateCard> = {}
): CarouselTemplateCard {
  return {
    header_type: 'image',
    header_media_url: 'https://x.com/a.png',
    body_text: 'Hello',
    buttons: [],
    ...overrides,
  };
}

describe('card list operations', () => {
  it('starts with exactly two blank image cards', () => {
    const cards = createInitialCards();
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      cid: expect.any(String),
      header_type: 'image',
      header_media_url: '',
      body_text: '',
      buttons: [],
    });
    expect(cards[0]).not.toBe(cards[1]);
    expect(cards[0]!.cid).not.toBe(cards[1]!.cid);
  });

  it('pads legacy / empty values up to 2 cards and caps at 10', () => {
    expect(ensureMinCards(undefined)).toHaveLength(2);
    expect(ensureMinCards([goodCard()])).toHaveLength(2);
    expect(
      ensureMinCards(Array.from({ length: 12 }, () => goodCard()))
    ).toHaveLength(10);
  });

  it('adds up to 10 and removes only above 2', () => {
    let cards = createInitialCards();
    for (let i = 0; i < 12; i++) cards = addCard(cards);
    expect(cards).toHaveLength(10);
    expect(removeCard(createInitialCards(), 0)).toHaveLength(2);
    expect(removeCard(cards, 3)).toHaveLength(9);
    expect(removeCard(cards, 99)).toBe(cards);
  });

  it('clears media and handle when the media type changes', () => {
    const card = goodCard({ header_handle: 'h1' });
    const video = changeCardMediaType(card, 'video');
    expect(video.header_type).toBe('video');
    expect(video.header_media_url).toBe('');
    expect(video.header_handle).toBeUndefined();
    expect(changeCardMediaType(card, 'image')).toBe(card);
  });

  it('drops a stale handle when the URL changes', () => {
    const next = setCardMediaUrl(
      goodCard({ header_handle: 'h1' }),
      'https://x.com/b.png'
    );
    expect(next.header_media_url).toBe('https://x.com/b.png');
    expect(next.header_handle).toBeUndefined();
  });
});

describe('variables', () => {
  it('inserts {{1}} at the caret then {{2}} (numbering restarts per card)', () => {
    const a = insertVariableAtCaret(goodCard({ body_text: 'Hi ' }), 3)!;
    expect(a.card.body_text).toBe('Hi {{1}}');
    expect(a.caret).toBe(8);
    expect(a.card.body_sample).toEqual(['']);
    const b = insertVariableAtCaret(a.card, 8)!;
    expect(b.card.body_text).toBe('Hi {{1}}{{2}}');
    expect(b.card.body_sample).toEqual(['', '']);
    // another card starts again at 1
    expect(insertVariableAtCaret(createBlankCard(), 0)!.card.body_text).toBe(
      '{{1}}'
    );
  });

  it('replaces the selection and refuses past 160 chars or 10 variables', () => {
    const r = insertVariableAtCaret(goodCard({ body_text: 'abcdef' }), 1, 4)!;
    expect(r.card.body_text).toBe('a{{1}}ef');
    expect(
      insertVariableAtCaret(goodCard({ body_text: 'x'.repeat(158) }), 0)
    ).toBeNull();
    const ten = Array.from({ length: 10 }, (_, i) => `{{${i + 1}}}`).join('');
    expect(insertVariableAtCaret(goodCard({ body_text: ten }), 0)).toBeNull();
  });

  it('keeps samples attached to their variable when the body is edited', () => {
    let card = setCardBody(createBlankCard(), '{{1}} and {{2}}');
    card = setCardSample(card, 0, 'A');
    card = setCardSample(card, 1, 'B');
    const edited = setCardBody(card, 'only {{2}}');
    expect(edited.body_sample).toEqual(['B']);
    const grown = setCardBody(card, '{{1}} {{2}} {{3}}');
    expect(grown.body_sample).toEqual(['A', 'B', '']);
    expect('body_sample' in setCardBody(card, 'plain')).toBe(false);
  });
});

describe('buttons', () => {
  it('adds up to 2 buttons of each supported kind and patches them', () => {
    let card = addCardButton(createBlankCard(), 'QUICK_REPLY');
    card = addCardButton(card, 'URL');
    card = addCardButton(card, 'PHONE_NUMBER');
    expect(card.buttons.map((b) => b.type)).toEqual(['QUICK_REPLY', 'URL']);
    card = patchCardButton(card, 1, {
      text: 'Shop',
      url: 'https://s.com/{{1}}',
      example: 'x',
    });
    expect(card.buttons[1]).toEqual({
      type: 'URL',
      text: 'Shop',
      url: 'https://s.com/{{1}}',
      example: 'x',
    });
    // a patch with fields of another variant is ignored per variant
    card = patchCardButton(card, 0, { text: 'Hi', phone_number: '1' });
    expect(card.buttons[0]).toEqual({ type: 'QUICK_REPLY', text: 'Hi' });
    expect(removeCardButton(card, 0).buttons).toHaveLength(1);
  });
});

describe('consistency (Meta rules)', () => {
  it('flags cards whose header type or button layout differ from card 1', () => {
    const cards = [
      goodCard({ buttons: [{ type: 'QUICK_REPLY', text: 'a' }] }),
      goodCard({
        header_type: 'video',
        buttons: [{ type: 'URL', text: 'b', url: 'https://x.com' }],
      }),
      goodCard({ buttons: [{ type: 'QUICK_REPLY', text: 'a' }] }),
    ];
    expect(checkCarouselConsistency(cards)).toEqual([
      { code: 'headerTypeMismatch', card: 2 },
      { code: 'buttonLayoutMismatch', card: 2 },
    ]);
    expect(checkCarouselConsistency([goodCard(), goodCard()])).toEqual([]);
  });

  it('treats different counts as a layout mismatch', () => {
    const issues = checkCarouselConsistency([
      goodCard({ buttons: [{ type: 'QUICK_REPLY', text: 'a' }] }),
      goodCard(),
    ]);
    expect(issues).toEqual([{ code: 'buttonLayoutMismatch', card: 2 }]);
  });
});

describe('validateCarouselCards', () => {
  it('accepts two complete cards', () => {
    expect(validateCarouselCards([goodCard(), goodCard()])).toEqual([]);
  });

  it('reports the blank starting state per card', () => {
    const codes = validateCarouselCards(createInitialCards()).map(
      (i) => `${i.code}:${i.card}`
    );
    // All card bodies empty is valid (Meta: body optional, all-or-none).
    expect(codes).toEqual(['mediaMissing:1', 'mediaMissing:2']);
  });

  it('requires a body on every card as soon as one card has a body (all-or-none)', () => {
    const codes = validateCarouselCards([
      goodCard(),
      goodCard({ body_text: '' }),
    ]).map((i) => `${i.code}:${i.card}`);
    expect(codes).toEqual(['cardBodyRequired:2']);
    expect(
      validateCarouselCards([
        goodCard({ body_text: '' }),
        goodCard({ body_text: '  ' }),
      ])
    ).toEqual([]);
  });

  it('enforces card count', () => {
    expect(validateCarouselCards([goodCard()]).map((i) => i.code)).toContain(
      'tooFewCards'
    );
    const many = Array.from({ length: 11 }, () => goodCard());
    expect(validateCarouselCards(many).map((i) => i.code)).toContain(
      'tooManyCards'
    );
  });

  it('validates media with the card real type (video url on a video card)', () => {
    const ok = validateCarouselCards([
      goodCard({
        header_type: 'video',
        header_media_url: 'https://x.com/v.mp4',
      }),
      goodCard({
        header_type: 'video',
        header_media_url: 'https://x.com/v.mp4',
      }),
    ]);
    expect(ok).toEqual([]);
    const bad = validateCarouselCards([
      goodCard({ header_media_url: 'https://x.com/v.mp4' }),
      goodCard(),
    ]);
    expect(bad[0]).toMatchObject({
      code: 'mediaInvalid',
      card: 1,
      media: { code: 'invalidFormat' },
    });
  });

  it('requires samples, contiguous variables and button fields', () => {
    const issues = validateCarouselCards([
      goodCard({
        body_text: 'a {{1}} {{3}}',
        body_sample: ['x', ''],
        buttons: [
          { type: 'QUICK_REPLY', text: '' },
          { type: 'URL', text: 'Go', url: 'http://x.com' },
        ],
      }),
      goodCard({
        buttons: [
          { type: 'QUICK_REPLY', text: '' },
          { type: 'URL', text: 'Go', url: 'http://x.com' },
        ],
      }),
    ]).map((i) => i.code);
    expect(issues).toContain('cardVariablesNotContiguous');
    expect(issues).toContain('cardSampleMissing');
    expect(issues).toContain('buttonTextRequired');
    expect(issues).toContain('urlNotHttps');
  });

  it('requires an example for URLs with {{1}} and a phone number for call buttons', () => {
    const btns = (example: string) => [
      {
        type: 'URL' as const,
        text: 'Go',
        url: 'https://x.com/p/{{1}}',
        example,
      },
      { type: 'PHONE_NUMBER' as const, text: 'Call', phone_number: '' },
    ];
    const codes = (example: string) =>
      validateCarouselCards([
        goodCard({ buttons: btns(example) }),
        goodCard({ buttons: btns('ok') }),
      ]).map((i) => `${i.code}:${i.card}`);
    expect(codes('')).toEqual([
      'urlExampleRequired:1',
      'phoneRequired:1',
      'phoneRequired:2',
    ]);
    expect(codes('abc')).toEqual(['phoneRequired:1', 'phoneRequired:2']);
  });
});

describe('validateCarouselForm / carouselFormError', () => {
  const base = {
    category: 'Marketing' as const,
    header_format: 'carousel',
    body_text: 'Check these out',
    body_samples: [],
    carousel_cards: [goodCard(), goodCard()],
  };

  it('requires Marketing, a body and body samples', () => {
    expect(validateCarouselForm(base)).toEqual([]);
    expect(
      validateCarouselForm({ ...base, category: 'Utility' })[0]?.code
    ).toBe('categoryMustBeMarketing');
    expect(validateCarouselForm({ ...base, body_text: ' ' })[0]?.code).toBe(
      'bodyRequired'
    );
    expect(
      validateCarouselForm({
        ...base,
        body_text: 'Hi {{1}}',
        body_samples: [''],
      })[0]?.code
    ).toBe('bodySampleMissing');
  });

  it('returns null for non-carousel forms and a message for carousel issues', () => {
    const t = (key: string) => key;
    expect(
      carouselFormError({ ...base, header_format: 'image', body_text: '' }, t)
    ).toBeNull();
    expect(carouselFormError({ ...base, body_text: '' }, t)).toBe(
      'carousel.issues.bodyRequired'
    );
  });

  it('describes issues with the catalogue key and a nested media reason', () => {
    const calls: Array<[string, unknown]> = [];
    const t = (key: string, values?: Record<string, string | number>) => {
      calls.push([key, values]);
      return key;
    };
    describeCarouselIssue(t, {
      code: 'mediaInvalid',
      card: 2,
      media: { code: 'invalidFormat', params: { formats: 'PNG' } },
    });
    expect(calls[0]).toEqual([
      'media.issues.invalidFormat',
      { formats: 'PNG' },
    ]);
    expect(calls[1]![0]).toBe('carousel.issues.mediaInvalid');
    expect(calls[1]![1]).toMatchObject({
      n: 2,
      reason: 'media.issues.invalidFormat',
    });
  });
});

describe('template-manager glue', () => {
  const slice = {
    header_format: 'none',
    category: 'Utility' as const,
    carousel_cards: [] as CarouselTemplateCard[],
  };

  it('selecting carousel pins Marketing and stores two blank cards', () => {
    expect(applyCarouselDefaults(slice)).toBe(slice);
    const next = applyCarouselDefaults({ ...slice, header_format: 'carousel' });
    expect(next.category).toBe('Marketing');
    expect(next.carousel_cards).toHaveLength(2);
    // existing cards are preserved
    const keep = [goodCard(), goodCard(), goodCard()];
    const kept = applyCarouselDefaults({
      ...slice,
      header_format: 'carousel',
      carousel_cards: keep,
    }).carousel_cards;
    expect(kept.map((c) => ({ ...c, cid: undefined }))).toEqual(
      keep.map((c) => ({ ...c, cid: undefined }))
    );
    expect(kept.every((c) => c.cid)).toBe(true);
    // idempotent once valid (no needless new objects on every setForm)
    const settled = applyCarouselDefaults({
      ...slice,
      header_format: 'carousel',
    });
    expect(applyCarouselDefaults(settled)).toBe(settled);
  });

  it('restores stored cards in openEdit and ignores non-carousel rows', () => {
    const row = {
      id: '1',
      user_id: 'u',
      name: 'n',
      category: 'Marketing',
      body_text: 'b',
      created_at: '',
      header_type: 'carousel',
      carousel_cards: [goodCard()],
    } as unknown as MessageTemplate;
    expect(templateCarouselCards(row)).toHaveLength(2);
    expect(
      templateCarouselCards({ ...row, header_type: 'image' } as MessageTemplate)
    ).toEqual([]);
  });

  it('routes carousel submits to the fork endpoints and strips unsupported fields', () => {
    const form = {
      header_format: 'carousel',
      category: 'Marketing' as const,
      carousel_cards: [goodCard({ body_text: ' Hi ' }), goodCard()],
    };
    const payload = {
      name: 'n',
      category: 'Utility',
      language: 'en_US',
      header_type: 'carousel',
      body_text: 'b',
      footer_text: 'f',
      buttons: [{ type: 'QUICK_REPLY', text: 'x' }],
      header_media_url: 'u',
    };
    const create = buildCarouselRequest(form, payload, null)!;
    expect(create.url).toBe('/api/saas/templates/carousel');
    const body = JSON.parse(create.body);
    expect(body.header_type).toBe('carousel');
    expect(body.category).toBe('Marketing');
    expect(body.cards).toHaveLength(2);
    expect(body.cards[0].body_text).toBe('Hi');
    expect('footer_text' in body).toBe(false);
    expect('buttons' in body).toBe(false);
    expect(buildCarouselRequest(form, payload, 'abc')!.url).toBe(
      '/api/saas/templates/carousel/abc'
    );
    expect(
      buildCarouselRequest({ ...form, header_format: 'image' }, payload, null)
    ).toBeNull();
  });

  it('builds preview cards substituting examples', () => {
    const cards = [
      goodCard({
        body_text: 'Hi {{1}}',
        body_sample: ['Sam'],
        buttons: [{ type: 'QUICK_REPLY', text: 'Yes' }],
      }),
    ];
    expect(toPreviewCards(cards)).toEqual([
      {
        type: 'image',
        url: 'https://x.com/a.png',
        bodyText: 'Hi Sam',
        buttons: [{ text: 'Yes', type: 'QUICK_REPLY' }],
      },
    ]);
  });
});

describe('send-time state', () => {
  const cards: CarouselTemplateCard[] = [
    goodCard({
      body_text: 'Hi {{1}}',
      body_sample: ['Sam'],
      buttons: [
        {
          type: 'URL',
          text: 'Open',
          url: 'https://x.com/{{1}}',
          example: 'abc',
        },
      ],
    }),
    goodCard({ header_type: 'video', header_media_url: 'https://x.com/v.mp4' }),
  ];

  it('prefills media, body params and url params from the stored template', () => {
    expect(initCarouselSendState(cards)).toEqual([
      {
        mediaUrl: 'https://x.com/a.png',
        bodyParams: ['Sam'],
        urlButtonParams: { 0: 'abc' },
      },
      { mediaUrl: 'https://x.com/v.mp4', bodyParams: [], urlButtonParams: {} },
    ]);
  });

  it('emits the contract shape', () => {
    const state = initCarouselSendState(cards);
    state[0]!.bodyParams[0] = ' Alex ';
    expect(toCarouselSendParams(cards, state)).toEqual([
      {
        headerMediaUrl: 'https://x.com/a.png',
        bodyParams: ['Alex'],
        urlButtonParams: { 0: 'abc' },
      },
      { headerMediaUrl: 'https://x.com/v.mp4' },
    ]);
  });

  it('validates each card with its real type and requires variables', () => {
    const state = initCarouselSendState(cards);
    expect(validateCarouselSend(cards, state)).toEqual([]);
    state[0]!.mediaUrl = '';
    state[1]!.mediaUrl = 'https://x.com/pic.png'; // png on a video card
    state[0]!.bodyParams[0] = '';
    state[0]!.urlButtonParams[0] = ' ';
    const codes = validateCarouselSend(cards, state).map(
      (i) => `${i.code}:${i.card}`
    );
    expect(codes).toEqual([
      'sendMediaMissing:1',
      'sendBodyVarMissing:1',
      'sendUrlVarMissing:1',
      'sendMediaInvalid:2',
    ]);
  });
});

describe('stable card ids (async-safe edits)', () => {
  it('patches the card by cid against the latest list, not by index', () => {
    const [a, b] = createInitialCards();
    // The list changed while an upload for `b` was in flight: a was removed.
    const latest = [b!, { ...createBlankCard(), body_text: 'typed meanwhile' }];
    const next = patchCardById(latest, b!.cid!, (c) =>
      setCardMediaUrl(c, 'https://x.com/b.png')
    );
    expect(next[0]!.header_media_url).toBe('https://x.com/b.png');
    expect(next[1]).toBe(latest[1]);
    expect(a!.cid).not.toBe(b!.cid);
  });

  it('keeps edits made to the same card during the upload', () => {
    const [a, b] = createInitialCards();
    const typed = patchCardById([a!, b!], a!.cid!, {
      body_text: 'typed while uploading',
    });
    const done = patchCardById(typed, a!.cid!, (c) =>
      setCardMediaUrl(c, 'https://x.com/a.png')
    );
    expect(done[0]).toMatchObject({
      body_text: 'typed while uploading',
      header_media_url: 'https://x.com/a.png',
    });
  });

  it('drops a late result for a removed card (returns the same list)', () => {
    const cards = [...createInitialCards(), createBlankCard()];
    const gone = cards[2]!;
    const after = removeCardById(cards, gone.cid!);
    expect(after).toHaveLength(2);
    expect(
      patchCardById(after, gone.cid!, { header_media_url: 'https://late' })
    ).toBe(after);
  });

  it('removeCardById honours the 2-card minimum and unknown ids', () => {
    const two = createInitialCards();
    expect(removeCardById(two, two[0]!.cid!)).toBe(two);
    expect(removeCardById([...two, createBlankCard()], 'nope')).toHaveLength(3);
  });

  it('ensureCardIds only assigns missing ids and never leaks into the payload', () => {
    const cards = [goodCard(), goodCard({ cid: 'keep' })];
    const out = ensureCardIds(cards);
    expect(out[0]!.cid).toBeTruthy();
    expect(out[1]!.cid).toBe('keep');
    expect(ensureCardIds(out)).toBe(out);
    expect(JSON.stringify(toCardPayload(out))).not.toContain('cid');
  });
});
