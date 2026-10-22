// ============================================================
// Insert a `{{contact.*}}` token into a text field (client-safe).
//
// The editor offers "Insert name / phone" for ANY text field it shows,
// including those rendered by shared upstream components (the interactive
// builder, the carousel editor). Those own their state, so the token goes in
// through the DOM the way a paste would: set the field's value with the
// native setter and fire a bubbling `input` event, which React's onChange
// picks up. (Setting `el.value` directly would be ignored: React tracks the
// value and treats an unchanged tracker as "no change".)
// ============================================================

export const NAME_TOKEN = '{{contact.name}}';
export const PHONE_TOKEN = '{{contact.phone}}';

export interface InsertResult {
  value: string;
  /** Caret position after the inserted text. */
  caret: number;
}

/**
 * `token` spliced over the selection `[start, end)`. Null when the result
 * would exceed `maxLength` (0 or negative = no limit), so the caller can say
 * the field is full instead of silently truncating.
 */
export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  token: string,
  maxLength = 0
): InsertResult | null {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const next = value.slice(0, from) + token + value.slice(to);
  if (maxLength > 0 && next.length > maxLength) return null;
  return { value: next, caret: from + token.length };
}

export type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Input types a token makes sense in. Links, numbers and emails do not take one. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', '']);

/** `inputmode` values that mark a field as numeric or a link, never prose. */
const NON_TEXT_INPUT_MODES = new Set([
  'decimal',
  'numeric',
  'tel',
  'url',
  'email',
]);

/** Whether `el` is an editable plain-text field a token can go into. */
export function isTokenField(el: unknown): el is TextField {
  if (typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) {
    return false;
  }
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return (
      TEXT_INPUT_TYPES.has(el.type) &&
      !NON_TEXT_INPUT_MODES.has(el.inputMode) &&
      !el.readOnly &&
      !el.disabled
    );
  }
  return false;
}

/**
 * Insert `token` at the caret (or over the selection) of `el`. Returns false
 * when the field has no room for it.
 */
export function insertTokenIntoField(el: TextField, token: string): boolean {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const result = insertAtSelection(el.value, start, end, token, el.maxLength);
  if (!result) return false;

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setValue) return false;
  setValue.call(el, result.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  el.setSelectionRange(result.caret, result.caret);
  return true;
}
