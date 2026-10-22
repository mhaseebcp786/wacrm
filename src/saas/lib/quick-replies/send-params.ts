// ============================================================
// Message object → arguments of the upstream send core
// (`sendMessageToConversation`).
//
// Routing every quick-reply send through that one core keeps a single place
// that resolves the recipient (phone variants, BSUID), decrypts the token,
// persists the message, updates the conversation preview and pauses active
// Flow runs. Types the core knows natively map onto its own params; the
// rest use the fork's extension types (`carousel`, `location`, `contact`,
// `rich_interactive` — see `send-message-extensions.ts`).
// ============================================================

import { carouselFromMeta } from '@/saas/lib/messages/carousel-adapter';
import type { MessageObject } from '@/saas/lib/messages/types';
import { messageToLegacyInteractive } from './legacy';

export interface QuickReplySendParams {
  messageType: string;
  contentText?: string;
  mediaUrl?: string;
  filename?: string;
  /**
   * Structured payload. Typed `unknown` because the core's own type only
   * covers upstream interactive messages; the caller casts at the boundary,
   * exactly as the carousel composer does.
   */
  interactivePayload?: unknown;
}

/**
 * Map a prepared (validated + personalized) message to send-core params.
 * Returns null for a message the core cannot deliver (a WhatsApp Flow
 * button) so callers fail with a clear error instead of sending something
 * different from what was saved.
 */
export function messageToSendParams(
  message: MessageObject
): QuickReplySendParams | null {
  switch (message.message_type) {
    case 'text':
      return { messageType: 'text', contentText: message.payload.text.body };
    case 'image':
      return {
        messageType: 'image',
        mediaUrl: message.payload.image.link,
        contentText: message.payload.image.caption,
      };
    case 'video':
      return {
        messageType: 'video',
        mediaUrl: message.payload.video.link,
        contentText: message.payload.video.caption,
      };
    case 'audio':
      return { messageType: 'audio', mediaUrl: message.payload.audio.link };
    case 'document':
      return {
        messageType: 'document',
        mediaUrl: message.payload.document.link,
        contentText: message.payload.document.caption,
        filename: message.payload.document.filename,
      };
    case 'carousel': {
      const carousel = carouselFromMeta(message.payload);
      return carousel
        ? { messageType: 'carousel', interactivePayload: carousel }
        : null;
    }
    case 'location': {
      const l = message.payload.location;
      return {
        messageType: 'location',
        // Conversation list, reply quotes and the plain-text fallback.
        contentText:
          [l.name, l.address].filter(Boolean).join(', ') ||
          `${l.latitude}, ${l.longitude}`,
        interactivePayload: message.payload,
      };
    }
    case 'contact':
      return {
        messageType: 'contact',
        contentText: message.payload.contacts
          .map((c) => c.name.formatted_name)
          .join(', '),
        interactivePayload: message.payload,
      };
    case 'interactive': {
      const i = message.payload.interactive;
      // A URL button, or reply buttons with an image/video/document header:
      // the upstream buttons/list sender cannot express either, so they go
      // through the shared message object and the payload is stored for the
      // inbox to draw. (A list with a non-text header is invalid per Meta
      // and never reaches this point; a Flow button is not deliverable yet.)
      if (
        i.type === 'cta_url' ||
        (i.type === 'button' &&
          i.header !== undefined &&
          i.header.type !== 'text')
      ) {
        return {
          messageType: 'rich_interactive',
          contentText: i.body.text,
          interactivePayload: message.payload,
        };
      }
      const legacy = messageToLegacyInteractive(message);
      return legacy
        ? { messageType: 'interactive', interactivePayload: legacy }
        : null;
    }
  }
}
