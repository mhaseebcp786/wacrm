/**
 * Pure helpers for the carousel TEMPLATE editor and the carousel send
 * forms. Everything here is framework-free so it can be unit-tested and so
 * the upstream `template-manager.tsx` only needs tiny hook calls into it.
 *
 * Validation functions return `CarouselIssue[]` (codes, never English):
 * components map `issue.code` to `SaasTemplates.carousel.issues.<code>`
 * through `describeCarouselIssue`.
 */

import type { MessageTemplate, TemplateButton } from '@/types';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import {
  CAROUSEL_TEMPLATE_LIMITS,
  type CarouselTemplateCard as ServerCarouselTemplateCard,
} from './carousel-template';
import { validateMediaUrl, type MediaIssue } from './media-specs';

/**
 * A template card as edited on the client. `cid` is a client-only stable id
 * (never persisted or sent: `toCardPayload` rebuilds every card without it)
 * so async work such as a media upload can find its card again after the
 * list was edited, reordered or shrunk in the meantime.
 */
export type CarouselTemplateCard = ServerCarouselTemplateCard & {
  cid?: string;
};

/**
 * Per-card send-time values (contract: `template_message_params.carouselCards`,
 * index = card index). Structurally identical to the server-side
 * `CarouselCardSendParams` in carousel-template-send.ts; declared here so
 * client code does not import the server builder module.
 */
export interface CarouselCardSendParams {
  /** Overrides the stored sample media link for this send. */
  headerMediaUrl?: string;
  bodyParams?: string[];
  /** URL-button suffix values keyed by the button's index within the card. */
  urlButtonParams?: Record<number, string>;
}

export const CAROUSEL_FORM_LIMITS = CAROUSEL_TEMPLATE_LIMITS;

export type CarouselCardButtonKind = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
export const CAROUSEL_BUTTON_KINDS: readonly CarouselCardButtonKind[] = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
];

export interface CarouselIssue {
  code: string;
  /** 1-based card number the issue belongs to. */
  card?: number;
  /** 1-based button number inside the card. */
  button?: number;
  params?: Record<string, string | number>;
  /** Underlying media problem, rendered as the `{reason}` text. */
  media?: MediaIssue;
}

// ---------------------------------------------------------------- cards

let cardIdCounter = 0;
export function newCardId(): string {
  cardIdCounter += 1;
  return `card-${Date.now().toString(36)}-${cardIdCounter}`;
}

export function createBlankCard(): CarouselTemplateCard {
  return {
    cid: newCardId(),
    header_type: 'image',
    header_media_url: '',
    body_text: '',
    buttons: [],
  };
}

/** Returns the same array when every card already has a `cid`. */
export function ensureCardIds(
  cards: CarouselTemplateCard[]
): CarouselTemplateCard[] {
  if (cards.every((c) => c.cid)) return cards;
  return cards.map((c) => (c.cid ? c : { ...c, cid: newCardId() }));
}

/** The two blank cards a new carousel starts with (stored in form state). */
export function createInitialCards(): CarouselTemplateCard[] {
  return [createBlankCard(), createBlankCard()];
}

/** Pads to the 2-card minimum so a legacy / empty value is editable. */
export function ensureMinCards(
  cards: CarouselTemplateCard[] | null | undefined
): CarouselTemplateCard[] {
  const list = Array.isArray(cards)
    ? cards.slice(0, CAROUSEL_FORM_LIMITS.maxCards)
    : [];
  while (list.length < CAROUSEL_FORM_LIMITS.minCards)
    list.push(createBlankCard());
  return ensureCardIds(list);
}

export function addCard(cards: CarouselTemplateCard[]): CarouselTemplateCard[] {
  if (cards.length >= CAROUSEL_FORM_LIMITS.maxCards) return cards;
  return [...cards, createBlankCard()];
}

export function removeCard(
  cards: CarouselTemplateCard[],
  index: number
): CarouselTemplateCard[] {
  if (cards.length <= CAROUSEL_FORM_LIMITS.minCards) return cards;
  if (index < 0 || index >= cards.length) return cards;
  return cards.filter((_, i) => i !== index);
}

export function updateCardAt(
  cards: CarouselTemplateCard[],
  index: number,
  patch: Partial<CarouselTemplateCard>
): CarouselTemplateCard[] {
  return cards.map((c, i) => (i === index ? { ...c, ...patch } : c));
}

/**
 * Applies `change` to the card with this `cid` against the LATEST list
 * (use it inside a functional state update). Returns the list unchanged
 * when the card no longer exists, so a late async result for a removed
 * card is dropped instead of landing on a neighbour.
 */
export function patchCardById(
  cards: CarouselTemplateCard[],
  cid: string,
  change:
    | Partial<CarouselTemplateCard>
    | ((card: CarouselTemplateCard) => CarouselTemplateCard)
): CarouselTemplateCard[] {
  if (!cards.some((c) => c.cid === cid)) return cards;
  return cards.map((c) => {
    if (c.cid !== cid) return c;
    return typeof change === 'function' ? change(c) : { ...c, ...change };
  });
}

/** Removes the card with this `cid` (respecting the 2-card minimum). */
export function removeCardById(
  cards: CarouselTemplateCard[],
  cid: string
): CarouselTemplateCard[] {
  const index = cards.findIndex((c) => c.cid === cid);
  return index < 0 ? cards : removeCard(cards, index);
}

/** Changing Image <-> Video clears the media (and any stale Meta handle). */
export function changeCardMediaType(
  card: CarouselTemplateCard,
  type: CarouselTemplateCard['header_type']
): CarouselTemplateCard {
  if (card.header_type === type) return card;
  const next: CarouselTemplateCard = {
    ...card,
    header_type: type,
    header_media_url: '',
  };
  delete next.header_handle;
  return next;
}

/** Sets/clears the media URL; a new URL invalidates any stored handle. */
export function setCardMediaUrl(
  card: CarouselTemplateCard,
  url: string
): CarouselTemplateCard {
  const next: CarouselTemplateCard = { ...card, header_media_url: url };
  delete next.header_handle;
  return next;
}

// --------------------------------------------------------- body + vars

/**
 * Sets the body text and re-aligns `body_sample` to the new variable set:
 * samples follow their variable number, new variables get '' and removed
 * ones drop out. No variables -> no `body_sample` key.
 */
export function setCardBody(
  card: CarouselTemplateCard,
  text: string
): CarouselTemplateCard {
  const oldIdx = extractVariableIndices(card.body_text);
  const bySlot = new Map<number, string>();
  oldIdx.forEach((v, i) => bySlot.set(v, card.body_sample?.[i] ?? ''));
  const newIdx = extractVariableIndices(text);
  const next: CarouselTemplateCard = { ...card, body_text: text };
  if (newIdx.length === 0) delete next.body_sample;
  else next.body_sample = newIdx.map((v) => bySlot.get(v) ?? '');
  return next;
}

export function setCardSample(
  card: CarouselTemplateCard,
  slot: number,
  value: string
): CarouselTemplateCard {
  const count = extractVariableIndices(card.body_text).length;
  const samples = Array.from(
    { length: count },
    (_, i) => card.body_sample?.[i] ?? ''
  );
  if (slot < 0 || slot >= count) return card;
  samples[slot] = value;
  return { ...card, body_sample: samples };
}

export interface InsertVariableResult {
  card: CarouselTemplateCard;
  /** Caret position to restore after the token. */
  caret: number;
}

/**
 * "Add variable": inserts the next `{{k}}` (per-card numbering restarting
 * at 1) at the caret / over the selection. Returns null when the card is
 * at the variable cap or the token would push the body past 160 chars.
 */
export function insertVariableAtCaret(
  card: CarouselTemplateCard,
  selectionStart: number,
  selectionEnd: number = selectionStart
): InsertVariableResult | null {
  const used = extractVariableIndices(card.body_text);
  if (used.length >= CAROUSEL_FORM_LIMITS.maxCardBodyVariables) return null;
  const nextNum = (used.length > 0 ? used[used.length - 1]! : 0) + 1;
  const token = `{{${nextNum}}}`;
  const start = Math.max(0, Math.min(selectionStart, card.body_text.length));
  const end = Math.max(start, Math.min(selectionEnd, card.body_text.length));
  const text =
    card.body_text.slice(0, start) + token + card.body_text.slice(end);
  if (text.length > CAROUSEL_FORM_LIMITS.maxCardBodyLength) return null;
  return { card: setCardBody(card, text), caret: start + token.length };
}

// -------------------------------------------------------------- buttons

export function createBlankButton(
  kind: CarouselCardButtonKind
): TemplateButton {
  switch (kind) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: '' };
    case 'URL':
      return { type: 'URL', text: '', url: '' };
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: '', phone_number: '' };
  }
}

export function addCardButton(
  card: CarouselTemplateCard,
  kind: CarouselCardButtonKind
): CarouselTemplateCard {
  if (card.buttons.length >= CAROUSEL_FORM_LIMITS.maxButtonsPerCard)
    return card;
  return { ...card, buttons: [...card.buttons, createBlankButton(kind)] };
}

export function removeCardButton(
  card: CarouselTemplateCard,
  index: number
): CarouselTemplateCard {
  return { ...card, buttons: card.buttons.filter((_, i) => i !== index) };
}

/** Per-variant patch that keeps the discriminated union intact. */
export interface CardButtonPatch {
  text?: string;
  url?: string;
  example?: string;
  phone_number?: string;
}

export function patchCardButton(
  card: CarouselTemplateCard,
  index: number,
  patch: CardButtonPatch
): CarouselTemplateCard {
  const current = card.buttons[index];
  if (!current) return card;
  let next: TemplateButton;
  switch (current.type) {
    case 'QUICK_REPLY':
      next = {
        ...current,
        ...(patch.text !== undefined && { text: patch.text }),
      };
      break;
    case 'URL':
      next = {
        ...current,
        ...(patch.text !== undefined && { text: patch.text }),
        ...(patch.url !== undefined && { url: patch.url }),
        ...(patch.example !== undefined && { example: patch.example }),
      };
      break;
    case 'PHONE_NUMBER':
      next = {
        ...current,
        ...(patch.text !== undefined && { text: patch.text }),
        ...(patch.phone_number !== undefined && {
          phone_number: patch.phone_number,
        }),
      };
      break;
    default:
      return card;
  }
  return {
    ...card,
    buttons: card.buttons.map((b, i) => (i === index ? next : b)),
  };
}

// ---------------------------------------------------------- consistency

/** Ordered button-type signature of a card: `URL,QUICK_REPLY`. */
export function buttonLayout(card: CarouselTemplateCard): string {
  return card.buttons.map((b) => b.type).join(',');
}

/**
 * Meta requires every card to share the header format and the button
 * layout (count + types, in order). Each card that differs from card 1
 * yields one issue so the editor can flag it in place.
 */
export function checkCarouselConsistency(
  cards: CarouselTemplateCard[]
): CarouselIssue[] {
  const issues: CarouselIssue[] = [];
  const first = cards[0];
  if (!first) return issues;
  const layout = buttonLayout(first);
  cards.forEach((card, i) => {
    if (i === 0) return;
    if (card.header_type !== first.header_type) {
      issues.push({ code: 'headerTypeMismatch', card: i + 1 });
    }
    if (buttonLayout(card) !== layout) {
      issues.push({ code: 'buttonLayoutMismatch', card: i + 1 });
    }
  });
  return issues;
}

// ----------------------------------------------------------- validation

function urlVariableProblem(url: string): boolean {
  const vars = extractVariableIndices(url);
  return vars.length > 1 || (vars.length === 1 && !/\{\{1\}\}$/.test(url));
}

function validateCardButtons(
  card: CarouselTemplateCard,
  cardNo: number,
  issues: CarouselIssue[]
): void {
  if (card.buttons.length > CAROUSEL_FORM_LIMITS.maxButtonsPerCard) {
    issues.push({ code: 'tooManyButtons', card: cardNo });
  }
  card.buttons.forEach((btn, bi) => {
    const at = { card: cardNo, button: bi + 1 };
    const text = btn.text?.trim() ?? '';
    if (!text) issues.push({ code: 'buttonTextRequired', ...at });
    else if (text.length > CAROUSEL_FORM_LIMITS.maxButtonTextLength) {
      issues.push({ code: 'buttonTextTooLong', ...at });
    }
    if (btn.type === 'URL') {
      const url = btn.url?.trim() ?? '';
      if (!url) issues.push({ code: 'urlRequired', ...at });
      else if (!url.toLowerCase().startsWith('https://')) {
        issues.push({ code: 'urlNotHttps', ...at });
      } else if (url.length > CAROUSEL_FORM_LIMITS.maxUrlLength) {
        issues.push({ code: 'urlTooLong', ...at });
      } else if (urlVariableProblem(url)) {
        issues.push({
          code: 'urlVariableInvalid',
          ...at,
          params: { var: '{{1}}' },
        });
      } else if (
        extractVariableIndices(url).length === 1 &&
        !btn.example?.trim()
      ) {
        issues.push({ code: 'urlExampleRequired', ...at });
      }
    }
    if (btn.type === 'PHONE_NUMBER' && !btn.phone_number?.trim()) {
      issues.push({ code: 'phoneRequired', ...at });
    }
  });
}

export function validateCarouselCards(
  cards: CarouselTemplateCard[]
): CarouselIssue[] {
  const issues: CarouselIssue[] = [];
  if (cards.length < CAROUSEL_FORM_LIMITS.minCards) {
    issues.push({
      code: 'tooFewCards',
      params: { min: CAROUSEL_FORM_LIMITS.minCards },
    });
  }
  if (cards.length > CAROUSEL_FORM_LIMITS.maxCards) {
    issues.push({
      code: 'tooManyCards',
      params: { max: CAROUSEL_FORM_LIMITS.maxCards },
    });
  }

  const anyCardBody = cards.some((c) => (c.body_text ?? '').trim().length > 0);

  cards.forEach((card, i) => {
    const n = i + 1;

    const url = card.header_media_url?.trim() ?? '';
    if (!url && !card.header_handle) {
      issues.push({ code: 'mediaMissing', card: n });
    } else if (url) {
      const res = validateMediaUrl(card.header_type, url, { context: 'send' });
      if (!res.ok && res.error) {
        issues.push({ code: 'mediaInvalid', card: n, media: res.error });
      }
    }

    const body = card.body_text ?? '';
    // Meta: a card body is optional, but all-or-none across the carousel.
    if (!body.trim() && anyCardBody)
      issues.push({ code: 'cardBodyRequired', card: n });
    if (body.length > CAROUSEL_FORM_LIMITS.maxCardBodyLength) {
      issues.push({ code: 'cardBodyTooLong', card: n });
    }
    const vars = extractVariableIndices(body);
    if (vars.length > CAROUSEL_FORM_LIMITS.maxCardBodyVariables) {
      issues.push({ code: 'cardVariablesTooMany', card: n });
    }
    if (vars.some((v, vi) => v !== vi + 1)) {
      issues.push({
        code: 'cardVariablesNotContiguous',
        card: n,
        params: { first: '{{1}}', second: '{{2}}' },
      });
    }
    vars.forEach((v, vi) => {
      if (!card.body_sample?.[vi]?.trim()) {
        issues.push({
          code: 'cardSampleMissing',
          card: n,
          params: { var: `{{${v}}}` },
        });
      }
    });

    validateCardButtons(card, n, issues);
  });

  issues.push(...checkCarouselConsistency(cards));
  return issues;
}

export interface CarouselFormSnapshot {
  category: MessageTemplate['category'];
  header_format: string;
  body_text: string;
  body_samples: string[];
  carousel_cards: CarouselTemplateCard[];
}

/** Whole-form validation used before submit (top body + cards). */
export function validateCarouselForm(
  form: CarouselFormSnapshot
): CarouselIssue[] {
  const issues: CarouselIssue[] = [];
  if (form.category !== 'Marketing')
    issues.push({ code: 'categoryMustBeMarketing' });
  if (!form.body_text.trim()) issues.push({ code: 'bodyRequired' });
  extractVariableIndices(form.body_text).forEach((v, i) => {
    if (!form.body_samples[i]?.trim()) {
      issues.push({ code: 'bodySampleMissing', params: { var: `{{${v}}}` } });
    }
  });
  issues.push(...validateCarouselCards(form.carousel_cards));
  return issues;
}

export type CarouselTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * Renders an issue with the `SaasTemplates` catalogue. `t` must be the
 * translator scoped to `SaasTemplates`.
 */
export function describeCarouselIssue(
  t: CarouselTranslate,
  issue: CarouselIssue
): string {
  const values: Record<string, string | number> = {
    n: issue.card ?? 0,
    b: issue.button ?? 0,
    ...(issue.params ?? {}),
  };
  if (issue.media) {
    values.reason = t(
      `media.issues.${issue.media.code}`,
      issue.media.params ?? {}
    );
  }
  return t(`carousel.issues.${issue.code}`, values);
}

// ------------------------------------------------- template-manager glue

type CategoryName = MessageTemplate['category'];

export interface CarouselFormSlice {
  header_format: string;
  category: CategoryName;
  carousel_cards: CarouselTemplateCard[];
}

/**
 * Applied to the form whenever the header format changes: choosing
 * 'carousel' pins the category to Marketing (carousel is Marketing-only)
 * and stores two blank cards so the editor never renders phantom state.
 */
export function applyCarouselDefaults<T extends CarouselFormSlice>(form: T): T {
  if (form.header_format !== 'carousel') return form;
  const cards = form.carousel_cards;
  const cardsOk =
    cards.length >= CAROUSEL_FORM_LIMITS.minCards &&
    cards.length <= CAROUSEL_FORM_LIMITS.maxCards &&
    cards.every((c) => c.cid);
  if (form.category === 'Marketing' && cardsOk) return form;
  return {
    ...form,
    category: 'Marketing',
    carousel_cards: cardsOk ? cards : ensureMinCards(cards),
  };
}

type CarouselCapableTemplate = MessageTemplate & {
  carousel_cards?: CarouselTemplateCard[] | null;
};

export function isCarouselMessageTemplate(template: MessageTemplate): boolean {
  return (template.header_type as string | undefined) === 'carousel';
}

/** Stored cards of a template row (always >= 2 cards for the editor). */
export function templateCarouselCards(
  template: MessageTemplate
): CarouselTemplateCard[] {
  const raw = (template as CarouselCapableTemplate).carousel_cards;
  return isCarouselMessageTemplate(template) ? ensureMinCards(raw) : [];
}

/** Stored cards exactly as persisted (no padding) — used at send time. */
export function storedCarouselCards(
  template: MessageTemplate
): CarouselTemplateCard[] {
  const raw = (template as CarouselCapableTemplate).carousel_cards;
  return Array.isArray(raw) ? raw : [];
}

/** Trim + normalise cards into the contract shape sent to the server. */
export function toCardPayload(
  cards: CarouselTemplateCard[]
): CarouselTemplateCard[] {
  return cards.map((card) => {
    const count = extractVariableIndices(card.body_text).length;
    const out: CarouselTemplateCard = {
      header_type: card.header_type,
      header_media_url: card.header_media_url?.trim() ?? '',
      body_text: card.body_text.trim(),
      buttons: card.buttons.map((b): TemplateButton => {
        switch (b.type) {
          case 'QUICK_REPLY':
            return { type: 'QUICK_REPLY', text: b.text.trim() };
          case 'URL': {
            const url = b.url.trim();
            const hasVar = extractVariableIndices(url).length > 0;
            return {
              type: 'URL',
              text: b.text.trim(),
              url,
              ...(hasVar && b.example?.trim()
                ? { example: b.example.trim() }
                : {}),
            };
          }
          case 'PHONE_NUMBER':
            return {
              type: 'PHONE_NUMBER',
              text: b.text.trim(),
              phone_number: b.phone_number.trim(),
            };
          case 'COPY_CODE':
            return b;
        }
      }),
    };
    if (card.header_handle) out.header_handle = card.header_handle;
    if (count > 0) {
      out.body_sample = Array.from({ length: count }, (_, i) =>
        (card.body_sample?.[i] ?? '').trim()
      );
    }
    return out;
  });
}

export interface CarouselRequest {
  url: string;
  body: string;
}

/**
 * For header_format === 'carousel', where and what to send. Returns null
 * for every other format so upstream keeps its own endpoints/payload.
 * `payload` is upstream's normal submit payload (name, category, language,
 * body_text, sample_values, …); footer / template-level buttons / media
 * header fields are dropped because carousel templates have none.
 */
export function buildCarouselRequest(
  form: CarouselFormSlice,
  payload: Record<string, unknown>,
  editingId: string | null
): CarouselRequest | null {
  if (form.header_format !== 'carousel') return null;
  const rest: Record<string, unknown> = { ...payload };
  for (const key of [
    'footer_text',
    'buttons',
    'header_content',
    'header_media_url',
  ]) {
    delete rest[key];
  }
  return {
    url: editingId
      ? `/api/saas/templates/carousel/${editingId}`
      : '/api/saas/templates/carousel',
    body: JSON.stringify({
      ...rest,
      category: 'Marketing',
      header_type: 'carousel',
      cards: toCardPayload(form.carousel_cards),
    }),
  };
}

/**
 * Returns the first blocking message for a carousel form, or null when
 * the form is fine / not a carousel. `t` is scoped to `SaasTemplates`.
 */
export function carouselFormError(
  form: CarouselFormSnapshot,
  t: CarouselTranslate
): string | null {
  if (form.header_format !== 'carousel') return null;
  const issues = validateCarouselForm(form);
  const first = issues[0];
  return first ? describeCarouselIssue(t, first) : null;
}

// -------------------------------------------------------- preview cards

export interface PreviewCard {
  type: 'image' | 'video';
  url?: string;
  bodyText: string;
  buttons: Array<{ text: string; type: string }>;
}

/** Substitutes example values for {{n}} so the preview reads naturally. */
export function renderWithSamples(text: string, samples?: string[]): string {
  const idx = extractVariableIndices(text);
  return text.replace(/\{\{(\d+)\}\}/g, (raw, num: string) => {
    const slot = idx.indexOf(Number(num));
    const value = slot >= 0 ? samples?.[slot] : undefined;
    return value && value.trim() ? value : raw;
  });
}

export function toPreviewCards(cards: CarouselTemplateCard[]): PreviewCard[] {
  return cards.map((c) => ({
    type: c.header_type,
    url: c.header_media_url?.trim() || undefined,
    bodyText: renderWithSamples(c.body_text, c.body_sample),
    buttons: c.buttons.map((b) => ({ text: b.text, type: b.type })),
  }));
}

// ------------------------------------------------------------ send time

/** Editable per-card values at send time. */
export interface CarouselSendCardState {
  mediaUrl: string;
  bodyParams: string[];
  urlButtonParams: Record<number, string>;
}

/** Indices (within the card) of URL buttons that need a {{1}} value. */
export function urlVariableButtons(
  card: CarouselTemplateCard
): Array<{ index: number; text: string; url: string }> {
  const out: Array<{ index: number; text: string; url: string }> = [];
  card.buttons.forEach((b, index) => {
    if (b.type === 'URL' && extractVariableIndices(b.url).length > 0) {
      out.push({ index, text: b.text, url: b.url });
    }
  });
  return out;
}

/** Prefills media from the stored sample and body params from examples. */
export function initCarouselSendState(
  cards: CarouselTemplateCard[]
): CarouselSendCardState[] {
  return cards.map((card) => {
    const count = extractVariableIndices(card.body_text).length;
    const urlParams: Record<number, string> = {};
    for (const slot of urlVariableButtons(card)) {
      const b = card.buttons[slot.index];
      urlParams[slot.index] = b?.type === 'URL' ? (b.example ?? '') : '';
    }
    return {
      mediaUrl: card.header_media_url ?? '',
      bodyParams: Array.from(
        { length: count },
        (_, i) => card.body_sample?.[i] ?? ''
      ),
      urlButtonParams: urlParams,
    };
  });
}

/** Send-time validation using each card's REAL media type. */
export function validateCarouselSend(
  cards: CarouselTemplateCard[],
  state: CarouselSendCardState[]
): CarouselIssue[] {
  const issues: CarouselIssue[] = [];
  cards.forEach((card, i) => {
    const n = i + 1;
    const s = state[i];
    const url = s?.mediaUrl.trim() ?? '';
    if (!url) {
      issues.push({ code: 'sendMediaMissing', card: n });
    } else {
      const res = validateMediaUrl(card.header_type, url, { context: 'send' });
      if (!res.ok && res.error) {
        issues.push({ code: 'sendMediaInvalid', card: n, media: res.error });
      }
    }
    extractVariableIndices(card.body_text).forEach((v, vi) => {
      if (!s?.bodyParams[vi]?.trim()) {
        issues.push({
          code: 'sendBodyVarMissing',
          card: n,
          params: { var: `{{${v}}}` },
        });
      }
    });
    for (const slot of urlVariableButtons(card)) {
      if (!s?.urlButtonParams[slot.index]?.trim()) {
        issues.push({
          code: 'sendUrlVarMissing',
          card: n,
          params: { text: slot.text },
        });
      }
    }
  });
  return issues;
}

/** Contract output: `template_message_params.carouselCards`. */
export function toCarouselSendParams(
  cards: CarouselTemplateCard[],
  state: CarouselSendCardState[]
): CarouselCardSendParams[] {
  return cards.map((card, i) => {
    const s = state[i];
    const out: CarouselCardSendParams = {};
    const media = s?.mediaUrl.trim();
    if (media) out.headerMediaUrl = media;
    if (extractVariableIndices(card.body_text).length > 0) {
      out.bodyParams = (s?.bodyParams ?? []).map((v) => v.trim());
    }
    const slots = urlVariableButtons(card);
    if (slots.length > 0) {
      out.urlButtonParams = Object.fromEntries(
        slots.map((slot) => [
          slot.index,
          (s?.urlButtonParams[slot.index] ?? '').trim(),
        ])
      );
    }
    return out;
  });
}

/** Preview cards at send time: uses the (possibly replaced) media + params. */
export function toSendPreviewCards(
  cards: CarouselTemplateCard[],
  state: CarouselSendCardState[]
): PreviewCard[] {
  return cards.map((c, i) => ({
    type: c.header_type,
    url: state[i]?.mediaUrl.trim() || undefined,
    bodyText: renderWithSamples(c.body_text, state[i]?.bodyParams),
    buttons: c.buttons.map((b) => ({ text: b.text, type: b.type })),
  }));
}
