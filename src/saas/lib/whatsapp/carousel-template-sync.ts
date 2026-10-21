// ============================================================
// SaaS carousel TEMPLATE — "Sync from Meta" support.
//
// Upstream sync only understands HEADER / BODY / FOOTER / BUTTONS, so
// a Meta-side CAROUSEL template was stored as a plain text template
// (and then failed to send: Meta requires the `carousel` component).
// The sync route calls `saasCarouselSyncFields` through a one-line
// hook; it returns the extra row fields for carousel templates and
// `{}` for everything else.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TemplateButton } from '@/types';
import type { CarouselTemplateCard } from './carousel-template';

interface MetaCard {
  components?: {
    type?: string;
    format?: string;
    text?: string;
    buttons?: {
      type?: string;
      text?: string;
      url?: string;
      phone_number?: string;
      example?: string[] | string;
    }[];
    example?: { body_text?: string[][] };
  }[];
}

interface SyncableTemplate {
  name: string;
  language: string;
  components?: { type: string; cards?: MetaCard[] }[];
}

function parseCardButtons(
  buttons: NonNullable<NonNullable<MetaCard['components']>[number]['buttons']>
): TemplateButton[] {
  return buttons.flatMap((b): TemplateButton[] => {
    const text = b.text ?? '';
    switch (b.type) {
      case 'QUICK_REPLY':
        return [{ type: 'QUICK_REPLY', text }];
      case 'URL': {
        const example = Array.isArray(b.example) ? b.example[0] : b.example;
        return [
          {
            type: 'URL',
            text,
            url: b.url ?? '',
            ...(example ? { example } : {}),
          },
        ];
      }
      case 'PHONE_NUMBER':
        return [
          { type: 'PHONE_NUMBER', text, phone_number: b.phone_number ?? '' },
        ];
      default:
        return [];
    }
  });
}

/**
 * Cards of a Meta CAROUSEL template, or null when this is not a media
 * carousel (no CAROUSEL component, or a catalog "product" carousel we
 * do not model).
 */
export function parseMetaCarouselCards(
  components: SyncableTemplate['components']
): Omit<CarouselTemplateCard, 'header_media_url'>[] | null {
  const carousel = (components ?? []).find((c) => c.type === 'CAROUSEL');
  if (!carousel?.cards?.length) return null;

  const cards: Omit<CarouselTemplateCard, 'header_media_url'>[] = [];
  for (const card of carousel.cards) {
    const header = card.components?.find((c) => c.type === 'HEADER');
    const format = header?.format?.toUpperCase();
    if (format !== 'IMAGE' && format !== 'VIDEO') return null;
    const body = card.components?.find((c) => c.type === 'BODY');
    const buttons = card.components?.find((c) => c.type === 'BUTTONS');
    cards.push({
      header_type: format === 'IMAGE' ? 'image' : 'video',
      body_text: body?.text ?? '',
      body_sample: body?.example?.body_text?.[0],
      buttons: parseCardButtons(buttons?.buttons ?? []),
    });
  }
  return cards;
}

/**
 * Extra `message_templates` columns for a synced carousel template.
 * Sample-media URLs are not part of Meta's template response (only
 * expiring handle URLs), so they are carried over from the local row
 * when this template was created here; otherwise left empty and the
 * sender picks media per card at send time.
 */
export async function saasCarouselSyncFields(
  supabase: SupabaseClient,
  accountId: string,
  template: SyncableTemplate
): Promise<Record<string, unknown>> {
  const parsed = parseMetaCarouselCards(template.components);
  if (!parsed) return {};

  const { data: existing } = await supabase
    .from('message_templates')
    .select('carousel_cards')
    .eq('account_id', accountId)
    .eq('name', template.name)
    .eq('language', template.language)
    .maybeSingle();
  const local: CarouselTemplateCard[] = Array.isArray(existing?.carousel_cards)
    ? (existing.carousel_cards as CarouselTemplateCard[])
    : [];

  const cards: CarouselTemplateCard[] = parsed.map((card, i) => {
    const url =
      local[i]?.header_type === card.header_type
        ? local[i].header_media_url
        : undefined;
    return url ? { ...card, header_media_url: url } : card;
  });

  return {
    header_type: 'carousel',
    header_content: null,
    header_handle: null,
    carousel_cards: cards,
  };
}
