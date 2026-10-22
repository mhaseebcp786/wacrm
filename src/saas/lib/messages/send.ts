import { type MetaSendResult } from '@/lib/whatsapp/meta-api';
import { postMetaMessage } from '@/saas/lib/whatsapp/meta-request';
import { buildSendBody } from './build';
import { personalizeMessage, type PersonalizeOptions } from './tokens';
import type { ContactTokens, MessageIssue, MessageObject } from './types';
import { validateMessageObject } from './validate';

/** Thrown before any network call when the message object is invalid. */
export class MessageValidationError extends Error {
  readonly issues: MessageIssue[];

  constructor(issues: MessageIssue[]) {
    super(
      `Invalid message: ${issues.map((i) => `${i.path || '(root)'} ${i.code}`).join(', ')}`
    );
    this.name = 'MessageValidationError';
    this.issues = issues;
  }
}

export interface PrepareMessageArgs {
  /** A stored `{ message_type, payload }` (any unknown input is accepted). */
  message: unknown;
  /** Substitution values for `{{contact.name}}` / `{{contact.phone}}`. */
  contact?: ContactTokens;
  personalize?: PersonalizeOptions;
}

/**
 * Normalize → validate → personalize → re-validate. The second validation
 * matters: substituting a long contact name can push a field past its limit.
 * Throws `MessageValidationError`; returns the ready-to-send message.
 */
export function prepareMessage(args: PrepareMessageArgs): MessageObject {
  const first = validateMessageObject(args.message);
  if (!first.ok) throw new MessageValidationError(first.issues);

  // Always personalize: with no contact, tokens resolve to the fallbacks
  // (empty by default) instead of reaching the customer as literal
  // `{{contact.name}}` text.
  const second = validateMessageObject(
    personalizeMessage(first.message, args.contact ?? {}, args.personalize)
  );
  if (!second.ok) throw new MessageValidationError(second.issues);
  return second.message;
}

export interface SendMessageObjectArgs extends PrepareMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  contextMessageId?: string;
}

/**
 * Send any of the nine message types through the Cloud API. Free-form
 * messages are only deliverable inside the 24h customer-service window;
 * checking that window is the caller's job (it needs conversation state).
 */
export async function sendMessageObject(
  args: SendMessageObjectArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, contextMessageId } = args;
  const message = prepareMessage(args);
  const body = buildSendBody(message, to, { contextMessageId });

  return postMetaMessage({ phoneNumberId, accessToken, body });
}
