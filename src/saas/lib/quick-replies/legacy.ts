// ============================================================
// Upstream `quick_replies` rows ⇄ the shared message object.
//
// Upstream stores a snippet as `kind: 'text'` (+ `content_text`) or
// `kind: 'interactive'` (+ the `InteractiveMessagePayload` that the inbox
// composer, the automation builder and the message bubble all use). These
// converters let the new quick-reply UI treat both as message objects, and
// hand a reply back to the upstream interactive builder / send core, which
// only understand the legacy shape.
// ============================================================

import type {
  InteractiveButtonsPayload,
  InteractiveListPayload,
  InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';
import type { QuickReply } from '@/types';
import type {
  InteractiveHeader,
  MessageObject,
} from '@/saas/lib/messages/types';

function headerOf(header: string | undefined): {
  header?: InteractiveHeader;
} {
  return header ? { header: { type: 'text', text: header } } : {};
}

function footerOf(footer: string | undefined): { footer?: { text: string } } {
  return footer ? { footer: { text: footer } } : {};
}

/** Upstream interactive payload → message object (Meta interactive body). */
export function legacyInteractiveToMessage(
  p: InteractiveMessagePayload
): MessageObject {
  const common = {
    ...headerOf(p.header),
    body: { text: p.body },
    ...footerOf(p.footer),
  };
  if (p.kind === 'buttons') {
    return {
      message_type: 'interactive',
      payload: {
        type: 'interactive',
        interactive: {
          type: 'button',
          ...common,
          action: {
            buttons: p.buttons.map((b) => ({
              type: 'reply' as const,
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      },
    };
  }
  return {
    message_type: 'interactive',
    payload: {
      type: 'interactive',
      interactive: {
        type: 'list',
        ...common,
        action: {
          button: p.button_label,
          sections: p.sections.map((s) => ({
            ...(s.title ? { title: s.title } : {}),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title,
              ...(r.description ? { description: r.description } : {}),
            })),
          })),
        },
      },
    },
  };
}

/**
 * Message object → upstream interactive payload. Only reply-button and list
 * messages with no header, or a text header, are expressible; anything else
 * (CTA URL, WhatsApp Flow, media header, non-interactive) returns null.
 */
export function messageToLegacyInteractive(
  message: MessageObject
): InteractiveMessagePayload | null {
  if (message.message_type !== 'interactive') return null;
  const i = message.payload.interactive;
  if (i.header && i.header.type !== 'text') return null;
  const shared = {
    body: i.body.text,
    ...(i.header && i.header.type === 'text' ? { header: i.header.text } : {}),
    ...(i.footer ? { footer: i.footer.text } : {}),
  };
  if (i.type === 'button') {
    const out: InteractiveButtonsPayload = {
      kind: 'buttons',
      ...shared,
      buttons: i.action.buttons.map((b) => ({
        id: b.reply.id,
        title: b.reply.title,
      })),
    };
    return out;
  }
  if (i.type === 'list') {
    const out: InteractiveListPayload = {
      kind: 'list',
      ...shared,
      button_label: i.action.button,
      sections: i.action.sections.map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        rows: s.rows.map((r) => ({
          id: r.id,
          title: r.title,
          ...(r.description ? { description: r.description } : {}),
        })),
      })),
    };
    return out;
  }
  return null;
}

/**
 * An upstream row as a message object, or null when the row is unusable
 * (a text row without text, an interactive row without a payload). The
 * result is NOT validated: a legacy row may predate a limit this fork
 * enforces, and the list view should still show it.
 */
export function legacyQuickReplyToMessage(
  qr: Pick<QuickReply, 'kind' | 'content_text' | 'interactive_payload'>
): MessageObject | null {
  if (qr.kind === 'interactive') {
    return qr.interactive_payload
      ? legacyInteractiveToMessage(qr.interactive_payload)
      : null;
  }
  if (typeof qr.content_text !== 'string' || qr.content_text === '') {
    return null;
  }
  return {
    message_type: 'text',
    payload: { type: 'text', text: { body: qr.content_text } },
  };
}
