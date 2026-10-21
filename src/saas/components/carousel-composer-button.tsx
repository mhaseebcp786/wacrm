'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { GalleryHorizontal, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { InteractiveMessagePayload } from '@/types';
import { CarouselInteractiveEditor } from '@/saas/components/carousel-interactive-editor';
import { CarouselPreview } from '@/saas/components/carousel-preview';
import {
  blankCarouselPayload,
  carouselPayloadToPreview,
  stripCarouselCardIds,
  validateCarouselInteractivePayload,
  type CarouselInteractivePayload,
} from '@/saas/lib/whatsapp/carousel-interactive';

interface CarouselComposerButtonProps {
  /** Composer-level disable (read-only role or expired 24h session). */
  disabled?: boolean;
  replyToId?: string;
  /**
   * The thread's existing interactive send handler. It posts to
   * /api/whatsapp/send, shows the optimistic bubble and handles failures;
   * it picks message_type 'carousel' from the payload's `kind`.
   */
  onSendInteractive: (
    payload: InteractiveMessagePayload,
    replyToId?: string
  ) => void;
  /** Called after a successful hand-off (the composer clears its reply draft). */
  onSent?: () => void;
}

/**
 * Inbox composer entry point for the free-form interactive carousel:
 * a toolbar button that opens a dialog hosting the carousel editor.
 */
export function CarouselComposerButton({
  disabled,
  replyToId,
  onSendInteractive,
  onSent,
}: CarouselComposerButtonProps) {
  const t = useTranslations('SaasCarousel');
  const [open, setOpen] = useState(false);
  const [payload, setPayload] =
    useState<CarouselInteractivePayload>(blankCarouselPayload);
  const [showIssues, setShowIssues] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setPayload(blankCarouselPayload());
      setShowIssues(false);
    }
  };

  const handleSend = () => {
    const result = validateCarouselInteractivePayload(payload);
    if (!result.ok) {
      setShowIssues(true);
      toast.error(t('fixIssues'));
      return;
    }
    // The thread handler is typed for buttons/list payloads; the carousel
    // payload is structurally different but travels the same path.
    onSendInteractive(
      stripCarouselCardIds(payload) as unknown as InteractiveMessagePayload,
      replyToId
    );
    setOpen(false);
    onSent?.();
  };

  const preview = carouselPayloadToPreview(payload);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={t('openTitle')}
        aria-label={t('openTitle')}
        onClick={() => handleOpenChange(true)}
        className="text-muted-foreground hover:text-foreground h-9 w-9 shrink-0 p-0"
      >
        <GalleryHorizontal className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">{t('windowHint')}</p>
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_280px]">
            <CarouselInteractiveEditor
              value={payload}
              onChange={setPayload}
              showIssues={showIssues}
            />
            <div className="space-y-2 md:sticky md:top-0 md:self-start">
              <p className="text-muted-foreground text-xs font-medium">
                {t('preview')}
              </p>
              <CarouselPreview body={preview.body} cards={preview.cards} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSend}>
              <Send className="mr-1 h-4 w-4" />
              {t('send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
