export const CAROUSEL_LIMITS = {
  minCards: 2,
  maxCards: 10,
  maxBodyLength: 1024,
  maxCardBodyLength: 160,
  maxButtonTextLength: 25,
} as const;

export type CarouselCardButtonType = 'cta_url' | 'quick_reply';

export interface CarouselCardCtaButton {
  type: 'cta_url';
  display_text: string;
  url: string;
}

export interface CarouselCardQuickReplyButton {
  type: 'quick_reply';
  id?: string;
  title: string;
}

export type CarouselCardButton =
  | CarouselCardCtaButton
  | CarouselCardQuickReplyButton;

export interface CarouselCard {
  card_index: number;
  header_type: 'image' | 'video';
  header_url: string;
  body_text: string;
  button: CarouselCardButton;
}

export interface CarouselInteractivePayload {
  kind: 'carousel';
  body: string;
  cards: CarouselCard[];
}

export type CarouselValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function fail(error: string): CarouselValidationResult {
  return { ok: false, error };
}

function ok(): CarouselValidationResult {
  return { ok: true };
}

function isValidHttpsUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateCarouselInteractivePayload(
  payload: unknown,
): CarouselValidationResult {
  if (!payload || typeof payload !== 'object') {
    return fail('Carousel payload is required.');
  }

  const p = payload as Partial<CarouselInteractivePayload>;

  if (p.kind !== 'carousel') {
    return fail('Carousel payload kind must be "carousel".');
  }

  if (typeof p.body !== 'string' || p.body.trim() === '') {
    return fail('Carousel body text is required.');
  }

  if (p.body.length > CAROUSEL_LIMITS.maxBodyLength) {
    return fail(
      `Carousel body exceeds ${CAROUSEL_LIMITS.maxBodyLength} character limit.`,
    );
  }

  if (!Array.isArray(p.cards)) {
    return fail('Carousel cards must be an array.');
  }

  if (p.cards.length < CAROUSEL_LIMITS.minCards) {
    return fail('Minimum 2 cards required.');
  }

  if (p.cards.length > CAROUSEL_LIMITS.maxCards) {
    return fail('Maximum 10 cards allowed.');
  }

  // Check homogeneous button types across all cards
  const firstButtonType = p.cards[0]?.button?.type;
  for (let i = 0; i < p.cards.length; i++) {
    const card = p.cards[i];
    if (!card || typeof card !== 'object') {
      return fail(`Card ${i + 1} is invalid.`);
    }

    if (card.header_type !== 'image' && card.header_type !== 'video') {
      return fail(
        'Carousel cards only support image or video headers (not PDF/document).',
      );
    }

    if (typeof card.header_url !== 'string' || !isValidHttpsUrl(card.header_url)) {
      return fail(`Card ${i + 1} header URL must be a valid HTTPS URL.`);
    }

    if (typeof card.body_text !== 'string' || card.body_text.trim() === '') {
      return fail(`Card ${i + 1} body text is required.`);
    }

    if (card.body_text.length > CAROUSEL_LIMITS.maxCardBodyLength) {
      return fail('Card body exceeds 160 character limit.');
    }

    if (!card.button || typeof card.button !== 'object') {
      return fail(`Card ${i + 1} button is required.`);
    }

    if (card.button.type !== 'cta_url' && card.button.type !== 'quick_reply') {
      return fail(`Card ${i + 1} button type must be cta_url or quick_reply.`);
    }

    if (card.button.type !== firstButtonType) {
      return fail('All cards must use the same button type.');
    }

    if (card.button.type === 'cta_url') {
      if (
        typeof card.button.display_text !== 'string' ||
        card.button.display_text.trim() === ''
      ) {
        return fail(`Card ${i + 1} button text is required.`);
      }
      if (card.button.display_text.length > CAROUSEL_LIMITS.maxButtonTextLength) {
        return fail(
          `Card ${i + 1} button text exceeds ${CAROUSEL_LIMITS.maxButtonTextLength} character limit.`,
        );
      }
      if (
        typeof card.button.url !== 'string' ||
        !isValidHttpsUrl(card.button.url)
      ) {
        return fail(`Card ${i + 1} button URL must be a valid HTTPS URL.`);
      }
    } else {
      if (
        typeof card.button.title !== 'string' ||
        card.button.title.trim() === ''
      ) {
        return fail(`Card ${i + 1} button text is required.`);
      }
      if (card.button.title.length > CAROUSEL_LIMITS.maxButtonTextLength) {
        return fail(
          `Card ${i + 1} button text exceeds ${CAROUSEL_LIMITS.maxButtonTextLength} character limit.`,
        );
      }
    }
  }

  return ok();
}

export function carouselPayloadPreviewText(
  payload: CarouselInteractivePayload,
): string {
  const body = payload.body?.trim();
  return body || '[carousel]';
}

export function blankCarouselPayload(): CarouselInteractivePayload {
  return {
    kind: 'carousel',
    body: '',
    cards: [
      {
        card_index: 0,
        header_type: 'image',
        header_url: '',
        body_text: '',
        button: {
          type: 'cta_url',
          display_text: '',
          url: '',
        },
      },
      {
        card_index: 1,
        header_type: 'image',
        header_url: '',
        body_text: '',
        button: {
          type: 'cta_url',
          display_text: '',
          url: '',
        },
      },
    ],
  };
}
