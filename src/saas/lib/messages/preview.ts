import type { MessageObject } from './types';

/**
 * One-line summary for `conversations.last_message_text` and list rows,
 * following upstream's convention in `send-message.ts`: the human text when
 * there is some (interactive body, caption, text body), otherwise a
 * `[messageType]` placeholder. No emoji and no English labels, so it stays
 * locale-neutral and matches `interactivePayloadPreviewText` and
 * `carouselPayloadPreviewText` (carousel = its body).
 */
export function messagePreviewText(message: MessageObject): string {
  switch (message.message_type) {
    case 'text':
      return message.payload.text.body.trim();
    case 'interactive':
    case 'carousel':
      return message.payload.interactive.body.text.trim();
    case 'image':
      return message.payload.image.caption?.trim() || '[image]';
    case 'video':
      return message.payload.video.caption?.trim() || '[video]';
    case 'document': {
      const d = message.payload.document;
      return d.caption?.trim() || d.filename?.trim() || '[document]';
    }
    case 'audio':
      return '[audio]';
    case 'location':
      return (
        message.payload.location.name?.trim() ||
        message.payload.location.address?.trim() ||
        '[location]'
      );
    case 'contact':
      return (
        message.payload.contacts[0]?.name.formatted_name.trim() || '[contact]'
      );
  }
}
