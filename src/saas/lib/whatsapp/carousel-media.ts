// Client-side validation for media attached to an interactive carousel card.
// Thin adapter over `media-specs.ts`, the single media validator: MIME type
// takes priority, and the file extension is only a fallback when the browser
// reports an empty / generic MIME (e.g. some .3gp files). Limits mirror
// Meta's carousel header rules (images jpg/png <= 5 MB, mp4/3gp <= 16 MB).

import { MEDIA_LIMITS, validateMediaFile } from './media-specs';

export const CAROUSEL_MEDIA_RULES = {
  image: {
    maxBytes: MEDIA_LIMITS.image.maxBytes,
    accept: 'image/jpeg,image/png',
  },
  video: {
    maxBytes: MEDIA_LIMITS.video.maxBytes,
    accept: 'video/mp4,video/3gpp',
  },
} as const;

export type CarouselMediaKind = keyof typeof CAROUSEL_MEDIA_RULES;

export type CarouselMediaIssue = 'type' | 'size' | null;

export function validateCarouselMediaFile(
  file: { name: string; type: string; size: number },
  kind: CarouselMediaKind
): CarouselMediaIssue {
  const result = validateMediaFile(kind, file, { context: 'send' });
  if (result.ok) return null;
  return result.error?.code === 'tooLarge' ? 'size' : 'type';
}
