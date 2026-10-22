'use client';

import { Component, type ReactNode } from 'react';
import { FileText, MapPin, Mic, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { InteractivePreview } from '@/components/interactive/interactive-preview';
import { cn } from '@/lib/utils';
import { CarouselPreview } from '@/saas/components/carousel-preview';
import {
  ContactCards,
  RichInteractiveCard,
  asContactCards,
} from '@/saas/components/payload-bubbles';
import { carouselFromMeta } from '@/saas/lib/messages/carousel-adapter';
import type { MessageObject } from '@/saas/lib/messages/types';
import { carouselPayloadToPreview } from '@/saas/lib/whatsapp/carousel-interactive';
import { messageToLegacyInteractive } from '@/saas/lib/quick-replies/legacy';

const BUBBLE =
  'w-full max-w-[260px] overflow-hidden rounded-lg bg-card text-foreground shadow-sm ring-1 ring-border';

/**
 * WhatsApp-style, read-only rendering of a message object. Reuses the
 * interactive and carousel previews the inbox already ships; the other
 * types are simple bubbles. Presentational only; tolerant of half-filled
 * drafts (every field may be empty).
 */
export function MessagePreview(props: {
  message: MessageObject;
  className?: string;
}) {
  return (
    <PreviewBoundary>
      <MessagePreviewInner {...props} />
    </PreviewBoundary>
  );
}

/**
 * A stored payload that no longer matches its type (a hand-edited row) must
 * not take the settings panel or the inbox picker down with it: render
 * nothing for that one preview.
 */
class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function MessagePreviewInner({
  message,
  className,
}: {
  message: MessageObject;
  className?: string;
}) {
  const t = useTranslations('SaasQuickReplies.preview');
  const tInteractive = useTranslations('Interactive');

  switch (message.message_type) {
    case 'text':
      return (
        <Bubble className={className}>
          <Text value={message.payload.text.body} empty={t('empty')} />
        </Bubble>
      );

    case 'interactive': {
      const i = message.payload.interactive;
      // A URL button, or reply buttons with a media header: drawn by the
      // same component the inbox thread uses for the sent message.
      if (
        i.type === 'cta_url' ||
        (i.type === 'button' && i.header && i.header.type !== 'text')
      ) {
        return <RichInteractiveCard interactive={i} className={className} />;
      }
      const legacy = messageToLegacyInteractive(message);
      if (legacy) {
        return (
          <InteractivePreview
            payload={legacy}
            className={className}
            labels={{
              body: tInteractive('previewBody'),
              button: tInteractive('previewButton'),
              menu: tInteractive('previewMenu'),
            }}
          />
        );
      }
      return <RichInteractiveCard interactive={i} className={className} />;
    }

    case 'image':
    case 'video': {
      const media =
        message.message_type === 'image'
          ? message.payload.image
          : message.payload.video;
      return (
        <Bubble className={className} flush>
          {message.message_type === 'image' && media.link ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote user-supplied URL, preview only
            <img
              src={media.link}
              alt=""
              className="max-h-48 w-full object-cover"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex h-32 items-center justify-center">
              {message.message_type === 'video' ? (
                <Play className="h-8 w-8" />
              ) : (
                <span className="text-xs">{t('noMedia')}</span>
              )}
            </div>
          )}
          {media.caption ? (
            <div className="px-3 py-2">
              <Text value={media.caption} empty="" />
            </div>
          ) : null}
        </Bubble>
      );
    }

    case 'audio':
      return (
        <Bubble className={className}>
          <div className="flex items-center gap-2 text-sm">
            <Mic className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground">{t('audio')}</span>
          </div>
        </Bubble>
      );

    case 'document': {
      const d = message.payload.document;
      return (
        <Bubble className={className}>
          <div className="flex items-center gap-2 text-sm">
            <FileText className="text-muted-foreground h-5 w-5 shrink-0" />
            <span className="min-w-0 truncate">
              {d.filename || d.link || t('document')}
            </span>
          </div>
          {d.caption ? (
            <div className="mt-2">
              <Text value={d.caption} empty="" />
            </div>
          ) : null}
        </Bubble>
      );
    }

    case 'carousel': {
      const carousel = carouselFromMeta(message.payload);
      if (!carousel) return null;
      const preview = carouselPayloadToPreview(carousel);
      return (
        <CarouselPreview
          body={preview.body}
          cards={preview.cards}
          className={className}
        />
      );
    }

    case 'location': {
      const l = message.payload.location;
      return (
        <Bubble className={className}>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium break-words">
                {l.name || t('location')}
              </p>
              {l.address ? (
                <p className="text-muted-foreground text-xs break-words">
                  {l.address}
                </p>
              ) : null}
              {Number.isFinite(l.latitude) && Number.isFinite(l.longitude) ? (
                <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                  {l.latitude}, {l.longitude}
                </p>
              ) : null}
            </div>
          </div>
        </Bubble>
      );
    }

    case 'contact': {
      // Same guard the inbox bubble uses: a malformed stored payload draws
      // nothing instead of throwing (an error boundary cannot help while
      // the page is server-rendered).
      const contacts = asContactCards(message.payload);
      return contacts ? (
        <ContactCards contacts={contacts} className={className} />
      ) : null;
    }
  }
}

function Bubble({
  children,
  className,
  flush,
}: {
  children: React.ReactNode;
  className?: string;
  /** No inner padding (full-bleed media). */
  flush?: boolean;
}) {
  return (
    <div className={cn(BUBBLE, className)}>
      <div className={flush ? '' : 'px-3 py-2'}>{children}</div>
    </div>
  );
}

function Text({ value, empty }: { value: string; empty: string }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {value || <span className="text-muted-foreground">{empty}</span>}
    </p>
  );
}
