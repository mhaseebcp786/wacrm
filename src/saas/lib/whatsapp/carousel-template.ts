import type { TemplatePayload } from '@/lib/whatsapp/template-validators';
import {
  validateTemplateName,
  extractVariableIndices,
} from '@/lib/whatsapp/template-validators';
import type {
  MetaTemplateSubmitPayload,
  MetaComponent,
} from '@/lib/whatsapp/template-components';
import type { TemplateButton } from '@/types';

export const CAROUSEL_TEMPLATE_LIMITS = {
  minCards: 2,
  maxCards: 10,
  maxCardBodyLength: 160,
  maxButtonsPerCard: 2,
} as const;

export interface CarouselTemplateCard {
  header_type: 'image' | 'video';
  header_media_url?: string;
  header_handle?: string;
  body_text: string; // ≤ 160 chars, supports {{1}}
  buttons: TemplateButton[]; // up to 2 buttons, consistent type across cards
  body_sample?: string[]; // sample values for variables in body_text
}

export interface CarouselTemplatePayload extends Omit<TemplatePayload, 'header_type'> {
  header_type: 'carousel';
  cards: CarouselTemplateCard[];
}

export function validateCarouselTemplatePayload(
  payload: CarouselTemplatePayload,
): void {
  validateTemplateName(payload.name);

  if (!payload.language?.trim()) {
    throw new Error('Language is required.');
  }

  const category = (payload.category || '').toUpperCase();
  if (category !== 'MARKETING') {
    throw new Error('Carousel templates must use the MARKETING category.');
  }

  if (!payload.body_text?.trim()) {
    throw new Error('Template body text is required.');
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

  // Ensure button types are consistent across all cards
  let commonButtonType: string | null = null;

  for (let i = 0; i < payload.cards.length; i++) {
    const card = payload.cards[i];
    if (!card) {
      throw new Error(`Card ${i + 1} is missing.`);
    }

    if (card.header_type !== 'image' && card.header_type !== 'video') {
      throw new Error(
        `Card ${i + 1}: Carousel cards only support image or video headers (not PDF/document).`,
      );
    }

    if (!card.header_handle && !card.header_media_url) {
      throw new Error(
        `Card ${i + 1}: Media header requires a media URL or upload handle.`,
      );
    }

    if (card.header_media_url) {
      try {
        const u = new URL(card.header_media_url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
          throw new Error(`Card ${i + 1}: Media URL must be HTTP or HTTPS.`);
        }
      } catch {
        throw new Error(`Card ${i + 1}: Media URL is invalid.`);
      }
    }

    if (!card.body_text || !card.body_text.trim()) {
      throw new Error(`Card ${i + 1}: Card body text is required.`);
    }

    if (card.body_text.length > CAROUSEL_TEMPLATE_LIMITS.maxCardBodyLength) {
      throw new Error('Card body exceeds 160 character limit.');
    }

    const varIndices = extractVariableIndices(card.body_text);
    if (varIndices.length > 0) {
      const samples = card.body_sample || [];
      if (samples.length !== varIndices.length) {
        throw new Error(
          `Card ${i + 1}: Expected ${varIndices.length} sample values for body variables, got ${samples.length}.`,
        );
      }
      for (let sIdx = 0; sIdx < samples.length; sIdx++) {
        if (!samples[sIdx]?.trim()) {
          throw new Error(
            `Card ${i + 1}: Sample value for {{${sIdx + 1}}} cannot be empty.`,
          );
        }
      }
    }

    if (card.buttons && card.buttons.length > 0) {
      if (card.buttons.length > CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard) {
        throw new Error(
          `Card ${i + 1}: Maximum ${CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard} buttons allowed per card.`,
        );
      }

      for (let bIdx = 0; bIdx < card.buttons.length; bIdx++) {
        const btn = card.buttons[bIdx];
        if (!btn.text?.trim()) {
          throw new Error(`Card ${i + 1}, button ${bIdx + 1}: Button text is required.`);
        }

        if (commonButtonType === null) {
          commonButtonType = btn.type;
        } else if (btn.type !== commonButtonType) {
          throw new Error('All cards must use the same button type.');
        }

        if (btn.type === 'URL' && !btn.url?.trim()) {
          throw new Error(`Card ${i + 1}, button ${bIdx + 1}: URL is required.`);
        }
      }
    }
  }
}

export function buildMetaCarouselTemplatePayload(
  payload: CarouselTemplatePayload,
): MetaTemplateSubmitPayload {
  const bodyComponent: MetaComponent = {
    type: 'BODY',
    text: payload.body_text,
  };

  if (payload.sample_values?.body && payload.sample_values.body.length > 0) {
    bodyComponent.example = {
      body_text: [payload.sample_values.body],
    };
  }

  const cards = payload.cards.map((card) => {
    const cardComponents: MetaComponent[] = [];

    // 1. HEADER
    const format = card.header_type === 'image' ? 'IMAGE' : 'VIDEO';
    const headerComponent: MetaComponent = {
      type: 'HEADER',
      format,
    };

    if (card.header_handle) {
      headerComponent.example = { header_handle: [card.header_handle] };
    } else if (card.header_media_url) {
      headerComponent.example = { header_url: [card.header_media_url] };
    }
    cardComponents.push(headerComponent);

    // 2. BODY
    const cardBodyComponent: MetaComponent = {
      type: 'BODY',
      text: card.body_text,
    };
    if (card.body_sample && card.body_sample.length > 0) {
      cardBodyComponent.example = {
        body_text: [card.body_sample],
      };
    }
    cardComponents.push(cardBodyComponent);

    // 3. BUTTONS
    if (card.buttons && card.buttons.length > 0) {
      const buttonsComponent: MetaComponent = {
        type: 'BUTTONS',
        buttons: card.buttons.map((b) => {
          switch (b.type) {
            case 'QUICK_REPLY':
              return { type: 'QUICK_REPLY', text: b.text };
            case 'URL': {
              const res: {
                type: 'URL';
                text: string;
                url: string;
                example?: string[];
              } = {
                type: 'URL',
                text: b.text,
                url: b.url,
              };
              if (b.example) res.example = [b.example];
              return res;
            }
            case 'PHONE_NUMBER':
              return {
                type: 'PHONE_NUMBER',
                text: b.text,
                phone_number: b.phone_number,
              };
            case 'COPY_CODE':
              return {
                type: 'COPY_CODE',
                text: b.text,
                example: [b.example],
              };
          }
        }),
      };
      cardComponents.push(buttonsComponent);
    }

    return { components: cardComponents };
  });

  const carouselComponent: any = {
    type: 'CAROUSEL',
    cards,
  };

  return {
    name: payload.name,
    category: 'MARKETING',
    language: payload.language,
    components: [bodyComponent, carouselComponent],
  };
}
