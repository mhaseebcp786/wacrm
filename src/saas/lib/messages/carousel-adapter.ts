import type {
  CarouselCard,
  CarouselInteractivePayload,
} from '@/saas/lib/whatsapp/carousel-interactive';
import type { CarouselMessagePayload } from './types';

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Convert a stored Meta-shaped carousel payload into the editor/sender shape
 * used by `carousel-send.ts`, so the shared message object reuses that
 * module's validator and request builder instead of duplicating them.
 *
 * Tolerant on input: the reference app writes `card.type: "button"` for quick-reply
 * cards where Meta's doc says `cta_url`; both are accepted and the card kind
 * is decided by the `action` shape. Structural problems (not an object, no
 * cards array) return `null`; field-level problems are left for
 * `validateCarouselInteractivePayload` to report on the converted value.
 */
export function carouselFromMeta(
  payload: unknown
): CarouselInteractivePayload | null {
  if (!isRec(payload) || !isRec(payload.interactive)) return null;
  const interactive = payload.interactive;
  if (!isRec(interactive.action) || !Array.isArray(interactive.action.cards)) {
    return null;
  }
  const body = isRec(interactive.body) ? str(interactive.body.text) : '';

  const cards: CarouselCard[] = interactive.action.cards.map(
    (raw: unknown, idx: number): CarouselCard => {
      const card = isRec(raw) ? raw : {};
      const header = isRec(card.header) ? card.header : {};
      const headerType = header.type === 'video' ? 'video' : 'image';
      const media = isRec(header[headerType]) ? header[headerType] : {};
      const action = isRec(card.action) ? card.action : {};
      const params = isRec(action.parameters) ? action.parameters : {};
      const buttons = Array.isArray(action.buttons) ? action.buttons : [];
      const first = isRec(buttons[0]) ? buttons[0] : null;
      const qr = first && isRec(first.quick_reply) ? first.quick_reply : null;

      return {
        card_index: idx,
        header_type: headerType,
        header_url: str((media as Rec).link),
        body_text: isRec(card.body) ? str(card.body.text) : '',
        button: qr
          ? {
              type: 'quick_reply',
              title: str(qr.title),
              ...(typeof qr.id === 'string' && qr.id ? { id: qr.id } : {}),
            }
          : {
              type: 'cta_url',
              display_text: str(params.display_text),
              url: str(params.url),
            },
      };
    }
  );

  return { kind: 'carousel', body, cards };
}

/**
 * Inverse of `carouselFromMeta`: the editor shape as the stored Meta body.
 * Every card is written with `type: "cta_url"` (what Meta's doc specifies,
 * and what `buildCarouselRequestBody` sends); the card kind is carried by
 * its `action`. The editor-only `cid` is dropped.
 */
export function carouselToMeta(
  payload: CarouselInteractivePayload
): CarouselMessagePayload {
  return {
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: { text: payload.body },
      action: {
        cards: payload.cards.map((card, idx) => ({
          card_index: idx,
          type: 'cta_url',
          header:
            card.header_type === 'video'
              ? { type: 'video', video: { link: card.header_url } }
              : { type: 'image', image: { link: card.header_url } },
          ...(card.body_text ? { body: { text: card.body_text } } : {}),
          action:
            card.button.type === 'quick_reply'
              ? {
                  buttons: [
                    {
                      type: 'quick_reply' as const,
                      quick_reply: {
                        ...(card.button.id ? { id: card.button.id } : {}),
                        title: card.button.title,
                      },
                    },
                  ],
                }
              : {
                  name: 'cta_url' as const,
                  parameters: {
                    display_text: card.button.display_text,
                    url: card.button.url,
                  },
                },
        })),
      },
    },
  };
}
