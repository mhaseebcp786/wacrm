'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared, read-only carousel preview: one card at a time with prev/next
 * arrows and dots. Used by the Inbox bubble, the interactive-carousel
 * composer, and the carousel template editors.
 *
 * Purely presentational — buttons render as non-interactive labelled pills
 * (the customer taps them on their own device).
 */
export interface CarouselPreviewCard {
  type: 'image' | 'video';
  url?: string;
  bodyText: string;
  buttons: Array<{ text: string; type: string }>;
}

export interface CarouselPreviewProps {
  body?: string;
  cards: CarouselPreviewCard[];
  className?: string;
}

export function CarouselPreview({
  body,
  cards,
  className,
}: CarouselPreviewProps) {
  const t = useTranslations('SaasCarousel');
  const [rawIndex, setRawIndex] = useState(0);

  const count = cards.length;
  // Cards can be removed while the preview is mounted; clamp the cursor.
  const index = count === 0 ? 0 : Math.min(rawIndex, count - 1);
  const card = cards[index];

  const go = (delta: number) => {
    if (count < 2) return;
    setRawIndex((index + delta + count) % count);
  };

  return (
    <div
      className={cn('flex w-full max-w-[260px] flex-col gap-1.5', className)}
    >
      {body ? (
        <div className="bg-card text-foreground ring-border rounded-lg px-3 py-2 text-sm shadow-sm ring-1">
          <p className="break-words whitespace-pre-wrap">{body}</p>
        </div>
      ) : null}

      {card ? (
        <div className="bg-card text-foreground ring-border overflow-hidden rounded-lg shadow-sm ring-1">
          <div className="bg-muted relative flex h-[160px] w-full items-center justify-center">
            {card.url ? (
              card.type === 'video' ? (
                <>
                  <video
                    key={card.url}
                    src={card.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">
                      <Play className="h-5 w-5 fill-current" />
                    </span>
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary user media URL
                <img
                  key={card.url}
                  src={card.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )
            ) : (
              <span className="text-muted-foreground text-xs">
                {t('noMedia')}
              </span>
            )}

            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={t('previousCard')}
                  className="bg-background/80 text-foreground ring-border hover:bg-background absolute top-1/2 left-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full shadow ring-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label={t('nextCard')}
                  className="bg-background/80 text-foreground ring-border hover:bg-background absolute top-1/2 right-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full shadow ring-1"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>

          {card.bodyText ? (
            <p className="px-3 pt-2 text-sm break-words whitespace-pre-wrap">
              {card.bodyText}
            </p>
          ) : null}

          {card.buttons.length > 0 ? (
            <div className="flex flex-col gap-1.5 px-3 py-2">
              {card.buttons.map((b, i) => (
                <span
                  key={i}
                  className="border-border bg-muted/50 text-primary block truncate rounded-full border px-3 py-1.5 text-center text-xs font-medium"
                >
                  {b.text || t('buttonFallback')}
                </span>
              ))}
            </div>
          ) : (
            <div className="pb-2" />
          )}
        </div>
      ) : null}

      {count > 1 ? (
        <div className="flex items-center justify-center gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRawIndex(i)}
              aria-label={t('goToCard', { n: i + 1 })}
              aria-current={i === index}
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors',
                i === index ? 'bg-primary' : 'bg-muted-foreground/40'
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
