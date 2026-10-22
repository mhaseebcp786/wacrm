// ============================================================
// List-row styling and builder options for the extra triggers (React-free).
// Spread into upstream's `TRIGGER_META` and the builder's trigger dropdown.
// ============================================================

import type { SaasAutomationTriggerType } from './types';

export const SAAS_TRIGGER_META: Record<
  SaasAutomationTriggerType,
  { pillClass: string }
> = {
  button_reply: {
    pillClass: 'border-pink-500/30 bg-pink-500/10 text-pink-300',
  },
  list_reply: {
    pillClass: 'border-pink-500/30 bg-pink-500/10 text-pink-300',
  },
  flow_response: {
    pillClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  meta_ads_ctwa: {
    pillClass: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  },
  catalog_order: {
    pillClass: 'border-lime-500/30 bg-lime-500/10 text-lime-300',
  },
  anything_else: {
    pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
  },
};

/**
 * The builder's trigger dropdown entries, in display order. Kept next to the
 * message triggers it extends: after "Button / List Reply".
 */
export const SAAS_TRIGGER_OPTIONS: { value: SaasAutomationTriggerType }[] = [
  { value: 'button_reply' },
  { value: 'list_reply' },
  { value: 'flow_response' },
  { value: 'meta_ads_ctwa' },
  { value: 'catalog_order' },
  { value: 'anything_else' },
];
