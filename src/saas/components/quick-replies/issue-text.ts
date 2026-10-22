import { CAROUSEL_LIMITS } from '@/saas/lib/whatsapp/carousel-interactive';
import type { QuickReplyIssue } from '@/saas/lib/quick-replies/types';

type Translate = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** Leaf names of validator paths that have a label in the catalogue. */
const FIELD_KEYS = new Set([
  'text',
  'body',
  'caption',
  'filename',
  'link',
  'url',
  'display_text',
  'title',
  'description',
  'footer',
  'header',
  'button',
  'latitude',
  'longitude',
  'name',
  'address',
  'formatted_name',
  'phone',
  'email',
  'buttons',
  'rows',
  'sections',
]);

/**
 * Last meaningful segment of a validator path → catalogue key, skipping the
 * numeric indexes (`...buttons.0.reply.title` → `title`).
 */
export function fieldKey(path: string): string | null {
  const parts = path.split('.').filter((p) => p && !/^\d+$/.test(p));
  for (let i = parts.length - 1; i >= 0; i--) {
    if (FIELD_KEYS.has(parts[i])) return parts[i];
  }
  return null;
}

/**
 * Human sentence for one issue. `t` is bound to `SaasQuickReplies.issues`,
 * `tCarousel` to `SaasCarousel.issues` (the carousel module's own wording).
 */
export function issueText(
  issue: QuickReplyIssue,
  t: Translate,
  tCarousel: Translate
): string {
  if (issue.code === 'unsupported') {
    return t(`unsupported.${String(issue.params?.feature ?? 'flow')}`);
  }
  if (issue.code === 'carousel') {
    return tCarousel(String(issue.params?.reason ?? 'payload'), {
      card: Number(issue.params?.card ?? 0),
      maxBody: CAROUSEL_LIMITS.maxBodyLength,
      maxCardBody: CAROUSEL_LIMITS.maxCardBodyLength,
      maxLabel: CAROUSEL_LIMITS.maxButtonTextLength,
      maxLines: CAROUSEL_LIMITS.maxCardBodyLineBreaks,
    });
  }
  const key = fieldKey(issue.path);
  const field = key ? t(`fields.${key}`) : t('fields.generic');
  const params: Record<string, string | number> = { field };
  for (const [k, v] of Object.entries(issue.params ?? {})) params[k] = v;
  switch (issue.code) {
    case 'required':
    case 'tooLong':
    case 'tooFew':
    case 'tooMany':
    case 'duplicate':
    case 'outOfRange':
    case 'invalidUrl':
    case 'invalidMedia':
    case 'invalidValue':
      return t(issue.code, params);
    default:
      return t('malformed');
  }
}
