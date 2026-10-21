import { isBusinessScopedUserId } from '@/lib/whatsapp/wa-identity';
import { MetaApiError, type MetaSendResult } from '@/lib/whatsapp/meta-api';
import {
  type CarouselInteractivePayload,
  validateCarouselInteractivePayload,
} from './carousel-interactive';

export { validateCarouselInteractivePayload };

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface SendCarouselMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  payload: CarouselInteractivePayload;
  contextMessageId?: string;
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
    error_data?: { messaging_product?: string; details?: string };
  };
}

// Local copy: upstream `throwMetaError` / `recipientFields` are not exported
// from meta-api.ts and the 99/1 rule forbids touching that file.
function recipientFields(to: string): Record<string, unknown> {
  return isBusinessScopedUserId(to)
    ? { recipient: to.trim() }
    : { recipient_type: 'individual', to };
}

/**
 * Builds the Cloud API request body for an interactive media carousel.
 *
 * Schema source: Meta's "Interactive media carousel messages" doc
 * (developers.facebook.com/documentation/business-messaging/whatsapp/messages/
 * interactive-media-carousel-messages/). Where the older audit notes differed,
 * the OFFICIAL doc wins:
 *  - Every card has `type: 'cta_url'`, INCLUDING cards whose action holds
 *    quick-reply buttons (the doc's quick-reply example does exactly this).
 *  - URL card action: `{ name: 'cta_url', parameters: { display_text, url } }`.
 *  - Quick-reply card action:
 *    `{ buttons: [{ type: 'quick_reply', quick_reply: { id, title } }] }`.
 *  - Header: `{ type: 'image'|'video', image|video: { link } }`.
 *  - Card `body` is optional, so it is omitted when empty.
 *  - Top-level interactive header/footer are unsupported and never sent.
 * Pure (no I/O) so the shape can be asserted in tests. Call only after
 * `validateCarouselInteractivePayload` has passed.
 */
export function buildCarouselRequestBody(
  to: string,
  payload: CarouselInteractivePayload,
  contextMessageId?: string
): Record<string, unknown> {
  const cards = payload.cards.map((card, idx) => {
    // Array position is authoritative: Meta wants a contiguous 0-based index.
    const cardIndex = idx;

    const header =
      card.header_type === 'image'
        ? { type: 'image', image: { link: card.header_url } }
        : { type: 'video', video: { link: card.header_url } };

    const action =
      card.button.type === 'quick_reply'
        ? {
            buttons: [
              {
                type: 'quick_reply',
                quick_reply: {
                  id: card.button.id || `card_${cardIndex}_btn`,
                  title: card.button.title,
                },
              },
            ],
          }
        : {
            name: 'cta_url',
            parameters: {
              display_text: card.button.display_text,
              url: card.button.url,
            },
          };

    const out: Record<string, unknown> = {
      card_index: cardIndex,
      type: 'cta_url',
      header,
    };
    if (card.body_text && card.body_text.trim() !== '') {
      out.body = { text: card.body_text };
    }
    out.action = action;
    return out;
  });

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    ...recipientFields(to),
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: { text: payload.body },
      action: { cards },
    },
  };

  if (contextMessageId) {
    body.context = { message_id: contextMessageId };
  }

  return body;
}

export async function sendCarouselMessage(
  args: SendCarouselMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, payload, contextMessageId } = args;

  const validation = validateCarouselInteractivePayload(payload);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const body = buildCarouselRequestBody(to, payload, contextMessageId);

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Meta API error: ${response.status}`;
    let envelope: MetaErrorResponse['error'] | undefined;
    try {
      const data = (await response.json()) as MetaErrorResponse;
      envelope = data.error;
      if (envelope?.message) message = envelope.message;
    } catch {
      // response body wasn't JSON — keep fallback message
    }

    throw new MetaApiError(message, {
      code: typeof envelope?.code === 'number' ? envelope.code : null,
      subcode:
        typeof envelope?.error_subcode === 'number'
          ? envelope.error_subcode
          : null,
      type: envelope?.type ?? null,
      fbtraceId: envelope?.fbtrace_id ?? null,
      httpStatus: response.status,
      details: envelope?.error_data?.details ?? null,
    });
  }

  const data = (await response.json()) as { messages: [{ id: string }] };
  return { messageId: data.messages[0].id };
}
