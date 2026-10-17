// ============================================================
// SaaS send-message extension hooks.
//
// All carousel / saas-specific validation and dispatch logic
// lives HERE — upstream send-message.ts only calls two thin
// wrappers so the upstream diff stays within the 1-import +
// 1-3 line hook rule defined in AGENTS.md.
// ============================================================

import {
  sendCarouselMessage,
  validateCarouselInteractivePayload,
} from './carousel-send';
import type { CarouselInteractivePayload } from './carousel-interactive';

/** Message types added by SaaS extensions. */
export const SAAS_MESSAGE_TYPES = ['carousel'] as const;

/**
 * Validate a SaaS-extended message type.
 * Returns an error string if invalid, or `null` if the payload is
 * valid OR the type is not a SaaS type (caller should continue).
 */
export function validateSaasMessageType(
  messageType: string,
  interactivePayload: unknown,
): string | null {
  if (messageType === 'carousel') {
    const result = validateCarouselInteractivePayload(interactivePayload);
    if (!result.ok) return result.error;
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
  args: DispatchSaasMessageArgs,
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

  return null;
}
