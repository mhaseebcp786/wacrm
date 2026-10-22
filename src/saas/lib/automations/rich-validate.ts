// ============================================================
// Activation-time check for the "Send rich message" step's config (a shared
// message object). Kept apart from the sender (`rich-step.ts`) so it carries
// no server-only imports.
// ============================================================

import { getT } from '@/lib/i18n/translate';
import { issueText } from '@/saas/components/quick-replies/issue-text';
import { validateQuickReplyMessage } from '@/saas/lib/quick-replies/validate';
import type { TriggerIssue } from './triggers';

export function validateRichMessageStep(
  config: unknown,
  path: string
): TriggerIssue[] {
  const result = validateQuickReplyMessage(config);
  if (result.ok) return [];
  const tIssues = getT('SaasQuickReplies.issues');
  const tCarousel = getT('SaasCarousel.issues');
  return result.issues.map((issue) => ({
    path: issue.path ? `${path}.${issue.path}` : path,
    message: issueText(issue, tIssues, tCarousel),
  }));
}
