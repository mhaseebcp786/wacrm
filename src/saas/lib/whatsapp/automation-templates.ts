import type { MessageTemplate } from '@/types';

/**
 * Automations send templates through `src/lib/automations/meta-send.ts`,
 * which has no access to the template row: it cannot build the `carousel`
 * component (per-card media + variables), so Meta would reject the send.
 * Until that path supports it, carousel templates are not offered there.
 */
export function isSendableInAutomation(
  template: Pick<MessageTemplate, 'header_type'>
): boolean {
  return (template.header_type as string | null | undefined) !== 'carousel';
}
