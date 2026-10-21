/**
 * Limits for the free-form (24h session) interactive media carousel.
 * Source: Meta "Interactive media carousel messages" doc
 * (developers.facebook.com/documentation/business-messaging/whatsapp/messages/
 * interactive-media-carousel-messages/): 2-10 cards, body <=1024, card body
 * optional <=160 with at most 2 line breaks, button label <=20, quick-reply
 * id <=256, image or video headers only, same header/button shape per card.
 */
export const CAROUSEL_LIMITS = {
  minCards: 2,
  maxCards: 10,
  maxBodyLength: 1024,
  maxCardBodyLength: 160,
  maxCardBodyLineBreaks: 2,
  maxButtonTextLength: 20,
  maxQuickReplyIdLength: 256,
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
  CarouselCardCtaButton | CarouselCardQuickReplyButton;

export interface CarouselCard {
  /**
   * Client-only stable id (editor state). Never meant to be persisted or
   * sent: strip with `stripCarouselCardIds` before handing the payload on.
   */
  cid?: string;
  card_index: number;
  header_type: 'image' | 'video';
  header_url: string;
  /** Optional per Meta; an empty string means "no card body". */
  body_text: string;
  button: CarouselCardButton;
}

export interface CarouselInteractivePayload {
  kind: 'carousel';
  body: string;
  cards: CarouselCard[];
}

/**
 * Machine-readable failure reason so the UI can localize the message while
 * the API keeps returning the English `error` string.
 */
export type CarouselIssueCode =
  | 'payload'
  | 'bodyRequired'
  | 'bodyTooLong'
  | 'minCards'
  | 'maxCards'
  | 'cardInvalid'
  | 'headerType'
  | 'headerMixed'
  | 'headerUrl'
  | 'cardBodyTooLong'
  | 'cardBodyLines'
  | 'buttonType'
  | 'buttonMixed'
  | 'buttonTextRequired'
  | 'buttonTextTooLong'
  | 'buttonUrl'
  | 'buttonIdTooLong';

export type CarouselValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: CarouselIssueCode;
      /** 1-based card number the issue belongs to, when card-specific. */
      card?: number;
    };

function fail(
  code: CarouselIssueCode,
  error: string,
  card?: number
): CarouselValidationResult {
  return { ok: false, error, code, card };
}

function ok(): CarouselValidationResult {
  return { ok: true };
}

export function isValidHttpsUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateCarouselInteractivePayload(
  payload: unknown
): CarouselValidationResult {
  if (!payload || typeof payload !== 'object') {
    return fail('payload', 'Carousel payload is required.');
  }

  const p = payload as Partial<CarouselInteractivePayload>;

  if (p.kind !== 'carousel') {
    return fail('payload', 'Carousel payload kind must be "carousel".');
  }

  if (typeof p.body !== 'string' || p.body.trim() === '') {
    return fail('bodyRequired', 'Carousel body text is required.');
  }

  if (p.body.length > CAROUSEL_LIMITS.maxBodyLength) {
    return fail(
      'bodyTooLong',
      `Carousel body exceeds ${CAROUSEL_LIMITS.maxBodyLength} character limit.`
    );
  }

  if (!Array.isArray(p.cards)) {
    return fail('payload', 'Carousel cards must be an array.');
  }

  if (p.cards.length < CAROUSEL_LIMITS.minCards) {
    return fail('minCards', 'Minimum 2 cards required.');
  }

  if (p.cards.length > CAROUSEL_LIMITS.maxCards) {
    return fail('maxCards', 'Maximum 10 cards allowed.');
  }

  // Meta: header type and button type/number must match across all cards.
  const firstButtonType = p.cards[0]?.button?.type;
  const firstHeaderType = p.cards[0]?.header_type;
  for (let i = 0; i < p.cards.length; i++) {
    const n = i + 1;
    const card = p.cards[i];
    if (!card || typeof card !== 'object') {
      return fail('cardInvalid', `Card ${n} is invalid.`, n);
    }

    if (card.header_type !== 'image' && card.header_type !== 'video') {
      return fail(
        'headerType',
        'Carousel cards only support image or video headers (not PDF/document).',
        n
      );
    }

    if (card.header_type !== firstHeaderType) {
      return fail(
        'headerMixed',
        'All cards must use the same header type (image or video).',
        n
      );
    }

    if (
      typeof card.header_url !== 'string' ||
      !isValidHttpsUrl(card.header_url)
    ) {
      return fail(
        'headerUrl',
        `Card ${n} header URL must be a valid HTTPS URL.`,
        n
      );
    }

    // Card body is optional per Meta.
    if (card.body_text !== undefined && typeof card.body_text !== 'string') {
      return fail('cardInvalid', `Card ${n} body text must be text.`, n);
    }
    const cardBody = card.body_text ?? '';
    if (cardBody.length > CAROUSEL_LIMITS.maxCardBodyLength) {
      return fail(
        'cardBodyTooLong',
        `Card ${n} body exceeds ${CAROUSEL_LIMITS.maxCardBodyLength} character limit.`,
        n
      );
    }
    if (
      (cardBody.match(/\n/g)?.length ?? 0) >
      CAROUSEL_LIMITS.maxCardBodyLineBreaks
    ) {
      return fail(
        'cardBodyLines',
        `Card ${n} body allows at most ${CAROUSEL_LIMITS.maxCardBodyLineBreaks} line breaks.`,
        n
      );
    }

    if (!card.button || typeof card.button !== 'object') {
      return fail('buttonType', `Card ${n} button is required.`, n);
    }

    if (card.button.type !== 'cta_url' && card.button.type !== 'quick_reply') {
      return fail(
        'buttonType',
        `Card ${n} button type must be cta_url or quick_reply.`,
        n
      );
    }

    if (card.button.type !== firstButtonType) {
      return fail('buttonMixed', 'All cards must use the same button type.', n);
    }

    if (card.button.type === 'cta_url') {
      if (
        typeof card.button.display_text !== 'string' ||
        card.button.display_text.trim() === ''
      ) {
        return fail(
          'buttonTextRequired',
          `Card ${n} button text is required.`,
          n
        );
      }
      if (
        card.button.display_text.length > CAROUSEL_LIMITS.maxButtonTextLength
      ) {
        return fail(
          'buttonTextTooLong',
          `Card ${n} button text exceeds ${CAROUSEL_LIMITS.maxButtonTextLength} character limit.`,
          n
        );
      }
      if (
        typeof card.button.url !== 'string' ||
        !isValidHttpsUrl(card.button.url)
      ) {
        return fail(
          'buttonUrl',
          `Card ${n} button URL must be a valid HTTPS URL.`,
          n
        );
      }
    } else {
      if (
        typeof card.button.title !== 'string' ||
        card.button.title.trim() === ''
      ) {
        return fail(
          'buttonTextRequired',
          `Card ${n} button text is required.`,
          n
        );
      }
      if (card.button.title.length > CAROUSEL_LIMITS.maxButtonTextLength) {
        return fail(
          'buttonTextTooLong',
          `Card ${n} button text exceeds ${CAROUSEL_LIMITS.maxButtonTextLength} character limit.`,
          n
        );
      }
      if (
        card.button.id !== undefined &&
        (typeof card.button.id !== 'string' ||
          card.button.id.length > CAROUSEL_LIMITS.maxQuickReplyIdLength)
      ) {
        return fail(
          'buttonIdTooLong',
          `Card ${n} button id exceeds ${CAROUSEL_LIMITS.maxQuickReplyIdLength} character limit.`,
          n
        );
      }
    }
  }

  return ok();
}

/** One-line preview for the conversation list / reply quote. */
export function carouselPayloadPreviewText(
  payload: CarouselInteractivePayload
): string {
  const body = payload.body?.trim();
  return body || '\u{1F3A0} Carousel';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRenderableCard(card: unknown): card is CarouselCard {
  if (!isRecord(card)) return false;
  if (card.header_type !== 'image' && card.header_type !== 'video')
    return false;
  if (typeof card.header_url !== 'string') return false;
  if (card.body_text !== undefined && typeof card.body_text !== 'string')
    return false;
  const button = card.button;
  if (!isRecord(button)) return false;
  if (button.type === 'cta_url') return typeof button.display_text === 'string';
  if (button.type === 'quick_reply') return typeof button.title === 'string';
  return false;
}

/**
 * Narrowing guard for a persisted `interactive_payload` of unknown shape.
 * Checks everything the bubble / preview dereferences, so one malformed
 * row renders the plain-text fallback instead of crashing the thread.
 */
export function isCarouselPayload(
  payload: unknown
): payload is CarouselInteractivePayload {
  if (!isRecord(payload) || payload.kind !== 'carousel') return false;
  if (typeof payload.body !== 'string') return false;
  const cards = payload.cards;
  return (
    Array.isArray(cards) && cards.length > 0 && cards.every(isRenderableCard)
  );
}

/** Message type to send/persist for an interactive payload of either family. */
export function interactiveMessageTypeFor(
  payload: unknown
): 'interactive' | 'carousel' {
  return (payload as { kind?: unknown } | null)?.kind === 'carousel'
    ? 'carousel'
    : 'interactive';
}

/** Maps a payload to the shape CarouselPreview expects. */
export function carouselPayloadToPreview(payload: CarouselInteractivePayload): {
  body: string;
  cards: Array<{
    type: 'image' | 'video';
    url?: string;
    bodyText: string;
    buttons: Array<{ text: string; type: string }>;
  }>;
} {
  return {
    body: payload.body ?? '',
    cards: (Array.isArray(payload.cards) ? payload.cards : []).map((c) => ({
      type: c.header_type === 'video' ? ('video' as const) : ('image' as const),
      url: c.header_url || undefined,
      bodyText: c.body_text ?? '',
      buttons: !c.button
        ? []
        : [
            c.button.type === 'cta_url'
              ? { text: c.button.display_text ?? '', type: 'cta_url' }
              : { text: c.button.title ?? '', type: 'quick_reply' },
          ],
    })),
  };
}

let carouselCardIdCounter = 0;
export function newCarouselCardId(): string {
  carouselCardIdCounter += 1;
  return `icard-${Date.now().toString(36)}-${carouselCardIdCounter}`;
}

/**
 * Applies `change` to the card with this client id against the LATEST
 * payload (use inside a functional state update). A card that was removed
 * meanwhile leaves the payload untouched (same reference).
 */
export function patchCarouselCardById(
  payload: CarouselInteractivePayload,
  cid: string,
  change: (card: CarouselCard) => CarouselCard
): CarouselInteractivePayload {
  if (!payload.cards.some((c) => c.cid === cid)) return payload;
  return {
    ...payload,
    cards: payload.cards.map((c) => (c.cid === cid ? change(c) : c)),
  };
}

/** Drops the editor-only `cid` so the payload sent/persisted is clean. */
export function stripCarouselCardIds(
  payload: CarouselInteractivePayload
): CarouselInteractivePayload {
  return {
    ...payload,
    cards: payload.cards.map((c) => {
      const { cid, ...rest } = c;
      void cid;
      return rest;
    }),
  };
}

/**
 * Blank two-card payload. Each card starts with an empty header URL (the
 * editor fills it from an upload or a pasted https link).
 */
export function blankCarouselPayload(): CarouselInteractivePayload {
  return {
    kind: 'carousel',
    body: '',
    cards: [0, 1].map((i) => ({
      cid: newCarouselCardId(),
      card_index: i,
      header_type: 'image' as const,
      header_url: '',
      body_text: '',
      button: { type: 'cta_url' as const, display_text: '', url: 'https://' },
    })),
  };
}
