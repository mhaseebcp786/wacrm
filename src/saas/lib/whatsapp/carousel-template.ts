// ============================================================
// SaaS carousel TEMPLATE support — validation + Meta payload.
//
// Meta "media card carousel" templates:
//   components = [ BODY (required), CAROUSEL{ cards[2..10] } ]
//   card.components = [ HEADER(IMAGE|VIDEO, example.header_handle),
//                       BODY (<=160, optional vars + examples),
//                       BUTTONS (<=2: QUICK_REPLY | URL | PHONE_NUMBER) ]
// Every card must use the same header format and the same button
// layout (count + types, in order). Marketing category only.
//
// Behavior mirrors the reference app's builder (2-10 cards, <=2 buttons/card,
// 160-char card body, MARKETING-only) while enforcing the Meta
// consistency rules the reference app leaves to Meta's review.
// ============================================================

import type { TemplatePayload } from '@/lib/whatsapp/template-validators';
import {
  validateTemplateName,
  extractVariableIndices,
  TEMPLATE_LIMITS,
} from '@/lib/whatsapp/template-validators';
import type { MetaComponent } from '@/lib/whatsapp/template-components';
import type { TemplateButton } from '@/types';

export const CAROUSEL_TEMPLATE_LIMITS = {
  minCards: 2,
  maxCards: 10,
  maxCardBodyLength: 160,
  maxButtonsPerCard: 2,
  maxCardBodyVariables: 10,
  maxButtonTextLength: TEMPLATE_LIMITS.buttonTextMaxLength,
  maxUrlLength: 2000,
  maxBodyLength: TEMPLATE_LIMITS.bodyMaxLength,
} as const;

export type CarouselCardButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
const CARD_BUTTON_TYPES: readonly string[] = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
];

export interface CarouselTemplateCard {
  header_type: 'image' | 'video';
  /** Public sample media URL. Kept for sends (default link) and for re-creating the handle. */
  header_media_url?: string;
  /** Meta resumable-upload handle; derived server-side from header_media_url at submit. */
  header_handle?: string;
  body_text: string; // <= 160 chars, supports {{1}}
  buttons: TemplateButton[]; // <= 2, identical layout across cards
  body_sample?: string[]; // example values for the variables in body_text
}

export interface CarouselTemplatePayload extends Omit<
  TemplatePayload,
  'header_type'
> {
  header_type: 'carousel';
  cards: CarouselTemplateCard[];
}

/** The `{ type:'CAROUSEL', cards }` component Meta expects. */
export interface MetaCarouselComponent {
  type: 'CAROUSEL';
  cards: { components: MetaComponent[] }[];
}

export type SaasMetaTemplateComponent = MetaComponent | MetaCarouselComponent;

export interface MetaCarouselTemplateSubmitPayload {
  name: string;
  category: 'MARKETING';
  language: string;
  components: SaasMetaTemplateComponent[];
}

/** Ordered button-type signature of a card, e.g. `URL,QUICK_REPLY`. */
function buttonLayout(card: CarouselTemplateCard): string {
  return (card.buttons ?? []).map((b) => b.type).join(',');
}

function assertContiguous(indices: number[], where: string): void {
  indices.forEach((n, i) => {
    if (n !== i + 1) {
      throw new Error(
        `${where}: variables must be numbered {{1}}, {{2}}, … without gaps.`
      );
    }
  });
}

function validateCardButton(btn: TemplateButton, where: string): void {
  if (!CARD_BUTTON_TYPES.includes(btn.type)) {
    throw new Error(
      `${where}: carousel cards only support Quick Reply, URL or Call buttons.`
    );
  }
  if (!btn.text?.trim()) {
    throw new Error(`${where}: Button text is required.`);
  }
  if (btn.text.length > CAROUSEL_TEMPLATE_LIMITS.maxButtonTextLength) {
    throw new Error(
      `${where}: Button text exceeds ${CAROUSEL_TEMPLATE_LIMITS.maxButtonTextLength} characters.`
    );
  }
  if (btn.type === 'URL') {
    const url = btn.url?.trim() ?? '';
    if (!url) throw new Error(`${where}: URL is required.`);
    if (!url.toLowerCase().startsWith('https://')) {
      throw new Error(`${where}: URL must start with https://`);
    }
    if (url.length > CAROUSEL_TEMPLATE_LIMITS.maxUrlLength) {
      throw new Error(
        `${where}: URL exceeds ${CAROUSEL_TEMPLATE_LIMITS.maxUrlLength} characters.`
      );
    }
    const vars = extractVariableIndices(url);
    if (vars.length > 1 || (vars.length === 1 && !/\{\{1\}\}$/.test(url))) {
      throw new Error(
        `${where}: a URL variable must be a single {{1}} at the end of the URL.`
      );
    }
    if (vars.length === 1 && !btn.example?.trim()) {
      throw new Error(
        `${where}: an example URL is required when the URL contains {{1}}.`
      );
    }
  }
  if (btn.type === 'PHONE_NUMBER' && !btn.phone_number?.trim()) {
    throw new Error(`${where}: Phone number is required.`);
  }
}

export function validateCarouselTemplatePayload(
  payload: CarouselTemplatePayload
): void {
  validateTemplateName(payload.name);

  if (!payload.language?.trim()) {
    throw new Error('Language is required.');
  }

  if ((payload.category || '').toUpperCase() !== 'MARKETING') {
    throw new Error('Carousel templates must use the MARKETING category.');
  }

  if (!payload.body_text?.trim()) {
    throw new Error('Template body text is required for carousel templates.');
  }
  if (payload.body_text.length > CAROUSEL_TEMPLATE_LIMITS.maxBodyLength) {
    throw new Error(
      `Template body exceeds ${CAROUSEL_TEMPLATE_LIMITS.maxBodyLength} characters.`
    );
  }
  const bodyVars = extractVariableIndices(payload.body_text);
  assertContiguous(bodyVars, 'Body');
  if (bodyVars.length > 0) {
    const samples = payload.sample_values?.body ?? [];
    if (samples.length !== bodyVars.length || samples.some((s) => !s?.trim())) {
      throw new Error('Provide an example value for every body variable.');
    }
  }

  if (!Array.isArray(payload.cards)) {
    throw new Error('Carousel cards array is required.');
  }
  if (payload.cards.length < CAROUSEL_TEMPLATE_LIMITS.minCards) {
    throw new Error('Minimum 2 cards required.');
  }
  if (payload.cards.length > CAROUSEL_TEMPLATE_LIMITS.maxCards) {
    throw new Error('Maximum 10 cards allowed.');
  }

  const firstCard = payload.cards[0];
  const firstLayout = firstCard ? buttonLayout(firstCard) : '';

  // Meta: a card body is optional, but all cards must have one or none may.
  const withBody = payload.cards.filter((c) => c?.body_text?.trim()).length;
  if (withBody !== 0 && withBody !== payload.cards.length) {
    throw new Error(
      'Either every card has body text or none does (Meta requires consistent cards).'
    );
  }

  payload.cards.forEach((card, i) => {
    const where = `Card ${i + 1}`;
    if (!card) throw new Error(`${where} is missing.`);

    if (card.header_type !== 'image' && card.header_type !== 'video') {
      throw new Error(
        `${where}: carousel cards only support image or video headers (not PDF/document).`
      );
    }
    if (card.header_type !== firstCard.header_type) {
      throw new Error(
        'All cards must use the same media type (image or video).'
      );
    }

    if (!card.header_handle && !card.header_media_url) {
      throw new Error(`${where}: a media file is required.`);
    }
    if (card.header_media_url) {
      let protocol: string;
      try {
        protocol = new URL(card.header_media_url).protocol;
      } catch {
        throw new Error(`${where}: media URL is invalid.`);
      }
      if (protocol !== 'https:') {
        throw new Error(`${where}: media URL must be HTTPS.`);
      }
    }

    if (
      (card.body_text ?? '').length > CAROUSEL_TEMPLATE_LIMITS.maxCardBodyLength
    ) {
      throw new Error(
        `${where}: card body exceeds ${CAROUSEL_TEMPLATE_LIMITS.maxCardBodyLength} characters.`
      );
    }

    const vars = extractVariableIndices(card.body_text ?? '');
    assertContiguous(vars, where);
    if (vars.length > CAROUSEL_TEMPLATE_LIMITS.maxCardBodyVariables) {
      throw new Error(
        `${where}: maximum ${CAROUSEL_TEMPLATE_LIMITS.maxCardBodyVariables} variables per card body.`
      );
    }
    if (vars.length > 0) {
      const samples = card.body_sample ?? [];
      if (samples.length !== vars.length) {
        throw new Error(
          `${where}: expected ${vars.length} example values for body variables, got ${samples.length}.`
        );
      }
      samples.forEach((s, idx) => {
        if (!s?.trim()) {
          throw new Error(
            `${where}: example value for {{${idx + 1}}} cannot be empty.`
          );
        }
      });
    }

    const buttons = card.buttons ?? [];
    if (buttons.length > CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard) {
      throw new Error(
        `${where}: maximum ${CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard} buttons allowed per card.`
      );
    }
    buttons.forEach((btn, bIdx) =>
      validateCardButton(btn, `${where}, button ${bIdx + 1}`)
    );
    if (buttonLayout(card) !== firstLayout) {
      throw new Error(
        'All cards must have the same buttons (same number and types, in the same order).'
      );
    }
  });
}

function buildCardButtons(buttons: TemplateButton[]): MetaComponent['buttons'] {
  return buttons.flatMap((b) => {
    switch (b.type) {
      case 'QUICK_REPLY':
        return [{ type: 'QUICK_REPLY' as const, text: b.text }];
      case 'URL': {
        const out: NonNullable<MetaComponent['buttons']>[number] = {
          type: 'URL',
          text: b.text,
          url: b.url,
        };
        if (b.example) out.example = [b.example];
        return [out];
      }
      case 'PHONE_NUMBER':
        return [
          {
            type: 'PHONE_NUMBER' as const,
            text: b.text,
            phone_number: b.phone_number,
          },
        ];
      default:
        // Rejected by the validator; never reaches Meta.
        return [];
    }
  });
}

/**
 * Build the Meta submit/edit payload. Cards MUST carry `header_handle`
 * (Meta rejects a plain URL as the creation sample) — the submit route
 * derives it from `header_media_url` before calling this.
 */
export function buildMetaCarouselTemplatePayload(
  payload: CarouselTemplatePayload
): MetaCarouselTemplateSubmitPayload {
  const bodyComponent: MetaComponent = {
    type: 'BODY',
    text: payload.body_text,
  };
  if (payload.sample_values?.body && payload.sample_values.body.length > 0) {
    bodyComponent.example = { body_text: [payload.sample_values.body] };
  }

  const cards = payload.cards.map((card, i) => {
    if (!card.header_handle) {
      throw new Error(
        `Card ${i + 1}: media sample handle missing — upload the media again.`
      );
    }
    const components: MetaComponent[] = [
      {
        type: 'HEADER',
        format: card.header_type === 'image' ? 'IMAGE' : 'VIDEO',
        example: { header_handle: [card.header_handle] },
      },
    ];

    if (card.body_text?.trim()) {
      const bodyComp: MetaComponent = { type: 'BODY', text: card.body_text };
      if (card.body_sample && card.body_sample.length > 0) {
        bodyComp.example = { body_text: [card.body_sample] };
      }
      components.push(bodyComp);
    }

    if (card.buttons && card.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buildCardButtons(card.buttons),
      });
    }
    return { components };
  });

  return {
    name: payload.name,
    category: 'MARKETING',
    language: payload.language,
    components: [bodyComponent, { type: 'CAROUSEL', cards }],
  };
}
