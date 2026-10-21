// ============================================================
// SaaS carousel TEMPLATE — send-time components.
//
// Upstream `buildSendComponents` has no notion of a carousel. It calls
// the two helpers below through a small hook:
//   - isCarouselTemplate(template)        → take the carousel path
//   - buildCarouselSendComponents(...)    → body + `carousel` component
//
// Shape follows Meta's carousel-template send contract (and LeminAi's
// builder): trailing component
//   { type:'carousel', cards:[{ card_index, components:[
//       header{image|video link}, body{vars?}, button{quick_reply|url}… ]}]}
// ============================================================

import type { MessageTemplate } from '@/types';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import type { CarouselTemplateCard } from './carousel-template';
import type { CarouselCardSendParams } from './template-form-carousel';

export type { CarouselCardSendParams } from './template-form-carousel';

export type SaasCarouselTemplate = Omit<MessageTemplate, 'header_type'> & {
  header_type: 'carousel';
  carousel_cards?: CarouselTemplateCard[] | null;
};

type CardParameter =
  | { type: 'text'; text: string }
  | { type: 'payload'; payload: string }
  | { type: 'image'; image: { link: string } }
  | { type: 'video'; video: { link: string } };

type CardComponent =
  | { type: 'header'; parameters: CardParameter[] }
  | { type: 'body'; parameters: CardParameter[] }
  | {
      type: 'button';
      sub_type: 'quick_reply' | 'url';
      index: string;
      parameters: CardParameter[];
    };

export type SaasCarouselSendComponent =
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | {
      type: 'carousel';
      cards: { card_index: number; components: CardComponent[] }[];
    };

export function isCarouselTemplate(
  template: MessageTemplate
): template is MessageTemplate & SaasCarouselTemplate {
  return (
    (template as { header_type?: string | null }).header_type === 'carousel'
  );
}

/** Cards of a carousel template row, tolerating legacy/garbled JSON. */
export function carouselCardsOf(
  template: SaasCarouselTemplate
): CarouselTemplateCard[] {
  return Array.isArray(template.carousel_cards) ? template.carousel_cards : [];
}

/**
 * `carouselCards` arrives as untrusted JSON (send route / broadcast
 * body). Keep only well-typed fields so a malformed entry yields the
 * normal "needs a value" errors instead of a TypeError.
 */
function sanitizeCardParams(raw: unknown): CarouselCardSendParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: CarouselCardSendParams = {};
  if (typeof r.headerMediaUrl === 'string')
    out.headerMediaUrl = r.headerMediaUrl;
  if (Array.isArray(r.bodyParams)) {
    out.bodyParams = r.bodyParams.filter(
      (v): v is string => typeof v === 'string'
    );
  }
  if (r.urlButtonParams && typeof r.urlButtonParams === 'object') {
    const entries = Object.entries(
      r.urlButtonParams as Record<string, unknown>
    ).filter((e): e is [string, string] => typeof e[1] === 'string');
    out.urlButtonParams = Object.fromEntries(
      entries.map(([k, v]) => [Number(k), v])
    );
  }
  return out;
}

export function buildCarouselSendComponents(
  template: SaasCarouselTemplate,
  params: SendTimeParams & { carouselCards?: CarouselCardSendParams[] }
): SaasCarouselSendComponent[] {
  const cards = carouselCardsOf(template);
  if (cards.length === 0) {
    throw new Error(
      'This carousel template has no card data locally — run "Sync from Meta" or re-create it.'
    );
  }

  const out: SaasCarouselSendComponent[] = [];

  // Template-level body variables.
  const bodyVarCount = extractVariableIndices(template.body_text).length;
  if (bodyVarCount > 0) {
    const body = params.body ?? [];
    if (body.length < bodyVarCount) {
      throw new Error(
        `Body needs ${bodyVarCount} value(s), got ${body.length}.`
      );
    }
    out.push({
      type: 'body',
      parameters: body
        .slice(0, bodyVarCount)
        .map((text) => ({ type: 'text', text: String(text) })),
    });
  }

  const sendCards = cards.map((card, cardIndex) => {
    const cardParams = sanitizeCardParams(params.carouselCards?.[cardIndex]);
    const where = `Card ${cardIndex + 1}`;

    const link = cardParams?.headerMediaUrl?.trim() || card.header_media_url;
    if (!link) {
      throw new Error(`${where}: select a media file before sending.`);
    }
    const header: CardParameter =
      card.header_type === 'video'
        ? { type: 'video', video: { link } }
        : { type: 'image', image: { link } };

    const components: CardComponent[] = [
      { type: 'header', parameters: [header] },
    ];

    const varCount = extractVariableIndices(card.body_text ?? '').length;
    if (varCount > 0) {
      // Never fall back to the template's example values: they are
      // placeholder text and must not reach real customers.
      const values = cardParams?.bodyParams ?? [];
      if (values.length < varCount) {
        throw new Error(
          `${where}: needs ${varCount} body value(s), got ${values.length}.`
        );
      }
      components.push({
        type: 'body',
        parameters: values
          .slice(0, varCount)
          .map((text) => ({ type: 'text', text: String(text) })),
      });
    }

    (card.buttons ?? []).forEach((btn, btnIndex) => {
      if (btn.type === 'QUICK_REPLY') {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(btnIndex),
          parameters: [{ type: 'payload', payload: btn.text }],
        });
      } else if (btn.type === 'URL') {
        if (extractVariableIndices(btn.url).length === 0) return;
        const suffix = cardParams?.urlButtonParams?.[btnIndex]?.trim();
        if (!suffix) {
          throw new Error(
            `${where}: button ${btnIndex + 1} needs a value for its URL variable.`
          );
        }
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(btnIndex),
          parameters: [{ type: 'text', text: suffix }],
        });
      }
      // PHONE_NUMBER buttons take no send-time parameter.
    });

    return { card_index: cardIndex, components };
  });

  out.push({ type: 'carousel', cards: sendCards });
  return out;
}

/** Document header `filename` (Meta shows it instead of a generic name). */
export function documentFilenameFromUrl(
  url: string | undefined
): string | undefined {
  if (!url) return undefined;
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (!last) return undefined;
    const decoded = decodeURIComponent(last);
    return decoded.length <= 240 ? decoded : decoded.slice(-240);
  } catch {
    return undefined;
  }
}
