/**
 * Tiny client-side store for the broadcast wizard's carousel send values
 * (per-card media + variables). The upstream wizard has no slot for them
 * (its state is `headerMediaUrl` only), so instead of threading new props
 * through three upstream files, Step 3 renders a fork section that writes
 * here and the sending hook reads the result back by template id.
 *
 * Values apply to every recipient of the broadcast (no per-contact
 * mapping for card variables).
 *
 * Lifetime: the store is seeded per wizard session, identified by the
 * identity of the selected template object (the wizard page holds one
 * object per session and refetches the list on every visit). A new visit,
 * or a changed card count, re-seeds from the template's stored sample.
 * It is deliberately NOT cleared when Step 3 unmounts: the sending step
 * reads these values afterwards.
 */

import {
  initCarouselSendState,
  isCarouselMessageTemplate,
  storedCarouselCards,
  toCarouselSendParams,
  validateCarouselSend,
  type CarouselCardSendParams,
  type CarouselIssue,
  type CarouselSendCardState,
} from './template-form-carousel';
import type { MessageTemplate } from '@/types';

export interface StoreState {
  templateId: string | null;
  /** The template object the state was seeded for (wizard-session identity). */
  templateRef: MessageTemplate | null;
  cards: CarouselSendCardState[];
}

const EMPTY: StoreState = { templateId: null, templateRef: null, cards: [] };
let state: StoreState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: StoreState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeBroadcastCarousel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBroadcastCarouselSnapshot(): StoreState {
  return state;
}

/** True when `snapshot` holds usable values for this template's cards. */
export function snapshotMatches(
  snapshot: StoreState,
  template: MessageTemplate
): boolean {
  return (
    snapshot.templateId === template.id &&
    snapshot.cards.length === storedCarouselCards(template).length
  );
}

/**
 * Seeds from the template's stored sample unless already seeded for this
 * wizard session's template object with the same card count.
 */
export function ensureBroadcastCarouselState(
  template: MessageTemplate
): StoreState {
  if (state.templateRef === template && snapshotMatches(state, template))
    return state;
  emit({
    templateId: template.id,
    templateRef: template,
    cards: initCarouselSendState(storedCarouselCards(template)),
  });
  return state;
}

export function setBroadcastCarouselCards(
  templateId: string,
  cards: CarouselSendCardState[]
): void {
  emit({ templateId, templateRef: state.templateRef, cards });
}

/**
 * Functional update against the LATEST store value (safe for async results
 * such as a finished media upload). Ignored when the store was re-seeded
 * for another template meanwhile.
 */
export function updateBroadcastCarouselCards(
  templateId: string,
  updater: (prev: CarouselSendCardState[]) => CarouselSendCardState[]
): void {
  if (state.templateId !== templateId) return;
  emit({
    templateId,
    templateRef: state.templateRef,
    cards: updater(state.cards),
  });
}

export function clearBroadcastCarousel(): void {
  emit(EMPTY);
}

/** Blocking issues for the snapshot (empty when valid / not a carousel). */
export function carouselBroadcastIssues(
  template: MessageTemplate,
  snapshot: StoreState
): CarouselIssue[] {
  if (!isCarouselMessageTemplate(template)) return [];
  const cards = storedCarouselCards(template);
  if (cards.length === 0) return [{ code: 'tooFewCards', params: { min: 2 } }];
  const values = snapshotMatches(snapshot, template)
    ? snapshot.cards
    : initCarouselSendState(cards);
  return validateCarouselSend(cards, values);
}

/**
 * Wraps upstream's broadcast `messageParams`: for a carousel template adds
 * `carouselCards` (contract: template_message_params.carouselCards);
 * everything else passes through unchanged.
 */
export function withBroadcastCarouselParams<T extends object>(
  template: MessageTemplate,
  params: T | undefined
): (T & { carouselCards?: CarouselCardSendParams[] }) | undefined {
  if (!isCarouselMessageTemplate(template)) return params;
  const cards = storedCarouselCards(template);
  const values = snapshotMatches(state, template)
    ? state.cards
    : initCarouselSendState(cards);
  return {
    ...(params ?? ({} as T)),
    carouselCards: toCarouselSendParams(cards, values),
  };
}

/** Per-recipient spread for upstream: `{ messageParams }` or `{}`. */
export function broadcastRecipientParams<T extends object>(
  template: MessageTemplate,
  params: T | undefined
): { messageParams?: T & { carouselCards?: CarouselCardSendParams[] } } {
  const merged = withBroadcastCarouselParams(template, params);
  return merged ? { messageParams: merged } : {};
}
