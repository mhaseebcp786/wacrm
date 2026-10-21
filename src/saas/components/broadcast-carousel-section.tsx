'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { TemplateCarouselSendForm } from './template-carousel-send-form';
import { isMediaHeaderKind } from '@/lib/whatsapp/media-header-types';
import { validateMediaUrl } from '@/saas/lib/whatsapp/media-specs';
import {
  carouselBroadcastIssues,
  ensureBroadcastCarouselState,
  getBroadcastCarouselSnapshot,
  snapshotMatches,
  subscribeBroadcastCarousel,
  updateBroadcastCarouselCards,
} from '@/saas/lib/whatsapp/broadcast-carousel-store';
import {
  isCarouselMessageTemplate,
  renderWithSamples,
  storedCarouselCards,
} from '@/saas/lib/whatsapp/template-form-carousel';
import type { MessageTemplate } from '@/types';

function useSnapshot() {
  return useSyncExternalStore(
    subscribeBroadcastCarousel,
    getBroadcastCarouselSnapshot,
    getBroadcastCarouselSnapshot
  );
}

/** True while a carousel template's per-card media / variables are incomplete. */
export function useBroadcastCarouselBlocked(
  template: MessageTemplate
): boolean {
  const snapshot = useSnapshot();
  return useMemo(
    () => carouselBroadcastIssues(template, snapshot).length > 0,
    [template, snapshot]
  );
}

/**
 * Everything the upstream Step 3 needs from the fork in one hook:
 * `isCarousel` (hide the "nothing to personalize" empty state) and
 * `blocked` (disable Next): incomplete carousel cards, or a pasted media
 * header link whose type/extension Meta would reject (stricter than the
 * upstream http(s)-only check).
 */
export function useBroadcastStep3Extras(
  template: MessageTemplate,
  headerMediaUrl: string
): { isCarousel: boolean; blocked: boolean } {
  const carouselBlocked = useBroadcastCarouselBlocked(template);
  const kind = template.header_type;
  const url = headerMediaUrl.trim();
  const mediaBad =
    isMediaHeaderKind(kind) && url !== '' && !validateMediaUrl(kind, url).ok;
  return {
    isCarousel: isCarouselMessageTemplate(template),
    blocked: carouselBlocked || mediaBad,
  };
}

/** Broadcast wizard Step 3 section for carousel templates (renders nothing otherwise). */
export function BroadcastCarouselSection({
  template,
}: {
  template: MessageTemplate;
}) {
  const snapshot = useSnapshot();
  const isCarousel = isCarouselMessageTemplate(template);

  useEffect(() => {
    if (isCarousel) ensureBroadcastCarouselState(template);
  }, [isCarousel, template]);

  const cards = useMemo(() => storedCarouselCards(template), [template]);
  const issues = useMemo(
    () => carouselBroadcastIssues(template, snapshot),
    [template, snapshot]
  );

  if (!isCarousel) return null;
  // Wait for the seeding effect (also re-runs when the card count changes).
  if (snapshot.templateRef !== template || !snapshotMatches(snapshot, template))
    return null;

  return (
    <div className="border-border bg-card/50 rounded-xl border p-4">
      <TemplateCarouselSendForm
        cards={cards}
        state={snapshot.cards}
        onChange={(next) =>
          updateBroadcastCarouselCards(
            template.id,
            typeof next === 'function' ? next : () => next
          )
        }
        body={renderWithSamples(template.body_text)}
        issues={issues}
        broadcastNote
      />
    </div>
  );
}
