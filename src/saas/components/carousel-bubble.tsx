'use client';

import { CarouselPreview } from '@/saas/components/carousel-preview';
import {
  carouselPayloadToPreview,
  isCarouselPayload,
} from '@/saas/lib/whatsapp/carousel-interactive';

/**
 * Renders an outbound `content_type: 'carousel'` message: the intro text
 * bubble on top and the swipeable card preview below. Falls back to plain
 * text when the row has no (valid) `interactive_payload`.
 */
export function CarouselBubble({
  payload,
  fallbackText,
}: {
  payload: unknown;
  fallbackText?: string | null;
}) {
  if (!isCarouselPayload(payload)) {
    return (
      <p className="text-sm break-words whitespace-pre-wrap">{fallbackText}</p>
    );
  }
  const preview = carouselPayloadToPreview(payload);
  return <CarouselPreview body={preview.body} cards={preview.cards} />;
}
