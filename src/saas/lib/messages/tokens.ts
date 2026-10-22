import type { ContactTokens, MessageObject } from './types';

const TOKEN_RE = /\{\{\s*contact\.(name|phone)\s*\}\}/g;

/**
 * Keys whose string values are identifiers, URLs or enum-like markers: a
 * `{{contact.name}}` inside them is data, not copy, so it is never replaced.
 */
const SKIP_KEYS: ReadonlySet<string> = new Set([
  'id',
  'type',
  'link',
  'url',
  'flow_id',
  'flow_token',
  'flow_action',
  'flow_message_version',
  'screen',
  'wa_id',
]);

export interface PersonalizeOptions {
  /** Used when `contact.name` is missing or blank. Default: empty string. */
  fallbackName?: string;
  /** Used when `contact.phone` is missing or blank. Default: empty string. */
  fallbackPhone?: string;
}

/** Replace `{{contact.name}}` / `{{contact.phone}}` in one string. */
export function personalizeText(
  text: string,
  contact: ContactTokens,
  options: PersonalizeOptions = {}
): string {
  // `typeof` guards: contact rows come from the DB / imports and are not
  // guaranteed to hold strings.
  const name =
    (typeof contact.name === 'string' ? contact.name.trim() : '') ||
    options.fallbackName ||
    '';
  const phone =
    (typeof contact.phone === 'string' ? contact.phone.trim() : '') ||
    options.fallbackPhone ||
    '';
  return text.replace(TOKEN_RE, (_m, key: string) =>
    key === 'name' ? name : phone
  );
}

function walk(
  value: unknown,
  contact: ContactTokens,
  options: PersonalizeOptions
): unknown {
  if (typeof value === 'string')
    return personalizeText(value, contact, options);
  if (Array.isArray(value)) return value.map((v) => walk(v, contact, options));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SKIP_KEYS.has(k) ? v : walk(v, contact, options);
    }
    return out;
  }
  return value;
}

/**
 * Return a copy of the message with contact tokens substituted. The input
 * is never mutated (saved replies are shared across sends). Re-validate the
 * result: substitution can push a field over its length limit.
 */
export function personalizeMessage(
  message: MessageObject,
  contact: ContactTokens,
  options: PersonalizeOptions = {}
): MessageObject {
  return {
    message_type: message.message_type,
    payload: walk(message.payload, contact, options),
  } as MessageObject;
}

/** True when any string in the payload contains a contact token. */
export function hasContactTokens(message: MessageObject): boolean {
  let found = false;
  const scan = (value: unknown): void => {
    if (found) return;
    if (typeof value === 'string') {
      TOKEN_RE.lastIndex = 0;
      if (TOKEN_RE.test(value)) found = true;
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        if (!SKIP_KEYS.has(k)) scan(v);
      }
    }
  };
  scan(message.payload);
  TOKEN_RE.lastIndex = 0;
  return found;
}
