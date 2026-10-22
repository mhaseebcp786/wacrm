import { validateMessageObjectForSave } from '@/saas/lib/messages/validate';
import type { MessageObject } from '@/saas/lib/messages/types';
import type { QuickReplyValidation } from './types';

/**
 * Save-time validation for a quick reply: everything the shared message
 * object checks (including the worst case where every `{{contact.*}}` token
 * is empty), minus what this fork cannot deliver yet. A reply that could be
 * stored but never sent is rejected here instead of failing in front of an
 * agent mid-conversation.
 *
 * Not deliverable yet: `feature: 'flow'`, WhatsApp Flow buttons (they need
 * native Flow forms). A media header on reply buttons or a URL button is
 * deliverable (shared message object); on a list Meta allows a text header
 * only, which the shared validator already enforces.
 */
export function validateQuickReplyMessage(
  input: unknown
): QuickReplyValidation {
  const result = validateMessageObjectForSave(input);
  if (!result.ok) return result;
  if (isFlow(result.message)) {
    return {
      ok: false,
      issues: [
        {
          path: 'payload.interactive',
          code: 'unsupported',
          params: { feature: 'flow' },
        },
      ],
    };
  }
  const hit = findTokenInIdentifier(result.message.payload, 'payload');
  if (hit) {
    // Links and ids are never personalized (they are identifiers/URLs), so
    // a token there would reach the customer as literal text.
    return {
      ok: false,
      issues: [
        {
          path: hit.path,
          code: hit.key === 'id' ? 'invalidValue' : 'invalidUrl',
        },
      ],
    };
  }
  return result;
}

const TOKEN_RE = /\{\{\s*contact\./;
/** Keys whose values are identifiers or URLs, which personalization skips. */
const IDENTIFIER_KEYS: ReadonlySet<string> = new Set(['url', 'link', 'id']);

/** Path (and key) of the first url/link/id string that contains a contact token. */
function findTokenInIdentifier(
  value: unknown,
  path: string
): { path: string; key: string } | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findTokenInIdentifier(value[i], `${path}.${i}`);
      if (hit) return hit;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      if (IDENTIFIER_KEYS.has(k) && typeof v === 'string' && TOKEN_RE.test(v)) {
        return { path: `${path}.${k}`, key: k };
      }
      const hit = findTokenInIdentifier(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function isFlow(message: MessageObject): boolean {
  return (
    message.message_type === 'interactive' &&
    message.payload.interactive.type === 'flow'
  );
}
