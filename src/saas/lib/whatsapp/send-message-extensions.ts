// ============================================================
// SaaS send-message extension hooks.
//
// All carousel / saas-specific validation and dispatch logic
// lives HERE — upstream send-message.ts only calls thin
// wrappers so the upstream diff stays within the 1-import +
// 1-3 line hook rule defined in AGENTS.md.
// ============================================================

import {
  sendCarouselMessage,
  validateCarouselInteractivePayload,
} from './carousel-send';
import type { CarouselInteractivePayload } from './carousel-interactive';
import { sendMessageObject } from '@/saas/lib/messages/send';
import { validateMessageObject } from '@/saas/lib/messages/validate';

/**
 * Message types added by SaaS extensions. `carousel` has its own sender;
 * `location`, `contact` and `rich_interactive` carry the Meta payload of the
 * shared message object in `interactivePayload` (the core's generic
 * "structured payload" slot) and are sent through it.
 *
 * `rich_interactive` is the persisted `content_type` for an interactive
 * message the upstream buttons/list sender cannot express: a URL button
 * (any header) or reply buttons with an image/video/document header.
 */
export const SAAS_MESSAGE_TYPES = [
  'carousel',
  'location',
  'contact',
  'rich_interactive',
] as const;

/** Message-object `message_type` behind each payload-carrying extension. */
const OBJECT_TYPE = {
  location: 'location',
  contact: 'contact',
  rich_interactive: 'interactive',
} as const;

type ObjectBackedType = keyof typeof OBJECT_TYPE;

function isObjectBacked(messageType: string): messageType is ObjectBackedType {
  return Object.prototype.hasOwnProperty.call(OBJECT_TYPE, messageType);
}

function asMessageObject(messageType: ObjectBackedType, payload: unknown) {
  return { message_type: OBJECT_TYPE[messageType], payload };
}

/**
 * Whether the send core should store the structured payload on the message
 * row (`messages.interactive_payload`) for this type, so the inbox can draw
 * the real message instead of a text fallback. `interactive` and `carousel`
 * are stored by the core itself.
 */
export function storesSaasPayload(messageType: string): boolean {
  return isObjectBacked(messageType);
}

/** Interactive kinds that may be sent as `rich_interactive`. */
const RICH_INTERACTIVE_KINDS: readonly string[] = ['cta_url', 'button'];

/**
 * Validate a SaaS-extended message type.
 * Returns an error string if invalid, or `null` if the payload is
 * valid OR the type is not a SaaS type (caller should continue).
 */
export function validateSaasMessageType(
  messageType: string,
  interactivePayload: unknown
): string | null {
  if (messageType === 'carousel') {
    const result = validateCarouselInteractivePayload(interactivePayload);
    if (!result.ok) return result.error;
  }
  if (isObjectBacked(messageType)) {
    const result = validateMessageObject(
      asMessageObject(messageType, interactivePayload)
    );
    if (!result.ok) {
      const first = result.issues[0];
      return `Invalid ${messageType} message: ${first.path || '(root)'} ${first.code}`;
    }
    // Only a URL-button or reply-button body may be sent as
    // `rich_interactive`: a list, a flow, or a carousel (which validation
    // normalizes to its own type) must not ride in under it.
    if (
      messageType === 'rich_interactive' &&
      !(
        result.message.message_type === 'interactive' &&
        RICH_INTERACTIVE_KINDS.includes(result.message.payload.interactive.type)
      )
    ) {
      return 'Invalid rich_interactive message: payload.interactive.type typeMismatch';
    }
  }
  return null;
}

export interface DispatchSaasMessageArgs {
  messageType: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  interactivePayload: unknown;
  contextMessageId?: string;
}

/**
 * Dispatch a SaaS-extended message type to Meta.
 * Returns the Meta message ID string if handled, or `null` if the
 * type is not a SaaS type (caller should continue normal dispatch).
 */
export async function dispatchSaasMessage(
  args: DispatchSaasMessageArgs
): Promise<string | null> {
  const {
    messageType,
    phoneNumberId,
    accessToken,
    to,
    interactivePayload,
    contextMessageId,
  } = args;

  if (messageType === 'carousel') {
    const result = await sendCarouselMessage({
      phoneNumberId,
      accessToken,
      to,
      payload: interactivePayload as CarouselInteractivePayload,
      contextMessageId,
    });
    return result.messageId;
  }

  if (isObjectBacked(messageType)) {
    const result = await sendMessageObject({
      phoneNumberId,
      accessToken,
      to,
      message: asMessageObject(messageType, interactivePayload),
      contextMessageId,
    });
    return result.messageId;
  }

  return null;
}
