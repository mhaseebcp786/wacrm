'use client';

import { useState, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  TemplatePicker,
  type TemplateSendValues,
} from '@/components/inbox/template-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutTemplate } from 'lucide-react';
import { TemplateHeaderMediaInput } from './template-header-media-input';
import { TemplateCarouselSendForm } from './template-carousel-send-form';
import { isMediaHeaderKind } from '@/lib/whatsapp/media-header-types';
import { validateMediaUrl } from '@/saas/lib/whatsapp/media-specs';
import {
  initCarouselSendState,
  isCarouselMessageTemplate,
  renderWithSamples,
  storedCarouselCards,
  toCarouselSendParams,
  validateCarouselSend,
  type CarouselCardSendParams,
  type CarouselSendCardState,
} from '@/saas/lib/whatsapp/template-form-carousel';
import type { MessageTemplate } from '@/types';

export type { CarouselCardSendParams };

export interface TemplatePickerWithMediaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Extended callback: optional header media URL (image/video/document
  // headers) and per-card params (carousel templates, contract:
  // `template_message_params.carouselCards`).
  onSelectWithMedia: (
    template: MessageTemplate,
    values: TemplateSendValues,
    headerMediaUrl?: string,
    carouselCards?: CarouselCardSendParams[]
  ) => void;
}

export function TemplatePickerWithMedia({
  open,
  onOpenChange,
  onSelectWithMedia,
}: TemplatePickerWithMediaProps) {
  const t = useTranslations('Inbox.templatePicker');
  const st = useTranslations('SaasTemplates');
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [pending, setPending] = useState<{
    template: MessageTemplate;
    values: TemplateSendValues;
  } | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [carouselState, setCarouselState] = useState<CarouselSendCardState[]>(
    []
  );
  const [confirmAttempted, setConfirmAttempted] = useState(false);
  const transitionRef = useRef(false);

  // Reset when the picker closes (state adjusted during render, not in an effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setMediaDialogOpen(false);
      setPending(null);
      setMediaUrl('');
      setCarouselState([]);
      setConfirmAttempted(false);
    }
  }

  const pendingCarousel = pending
    ? isCarouselMessageTemplate(pending.template)
    : false;
  const carouselCards = useMemo(
    () =>
      pending && pendingCarousel ? storedCarouselCards(pending.template) : [],
    [pending, pendingCarousel]
  );
  const carouselIssues = pendingCarousel
    ? validateCarouselSend(carouselCards, carouselState)
    : [];

  const handlePickerSelect = (
    template: MessageTemplate,
    values: TemplateSendValues
  ) => {
    if (isCarouselMessageTemplate(template)) {
      transitionRef.current = true;
      setPending({ template, values });
      setConfirmAttempted(false);
      setCarouselState(initCarouselSendState(storedCarouselCards(template)));
      setMediaDialogOpen(true);
    } else if (
      template.header_type &&
      isMediaHeaderKind(template.header_type)
    ) {
      transitionRef.current = true;
      setPending({ template, values });
      setMediaUrl(template.header_media_url ?? '');
      setMediaDialogOpen(true);
    } else {
      onSelectWithMedia(template, values);
    }
  };

  const handlePickerOpenChange = (next: boolean) => {
    if (transitionRef.current) {
      transitionRef.current = false;
      return;
    }
    if (!next) {
      setPending(null);
      setMediaDialogOpen(false);
    }
    onOpenChange(next);
  };

  const handleConfirmMedia = () => {
    if (!pending) return;
    if (pendingCarousel) {
      if (carouselCards.length === 0 || carouselIssues.length > 0) {
        setConfirmAttempted(true);
        return;
      }
      onSelectWithMedia(
        pending.template,
        pending.values,
        undefined,
        toCarouselSendParams(carouselCards, carouselState)
      );
    } else {
      onSelectWithMedia(pending.template, pending.values, mediaUrl.trim());
    }
    setMediaDialogOpen(false);
    setPending(null);
    onOpenChange(false);
  };

  const handleMediaDialogOpenChange = (next: boolean) => {
    if (!next) {
      setMediaDialogOpen(false);
      setPending(null);
      onOpenChange(false);
    }
  };

  const headerKind = pending?.template.header_type;
  // Carousel: the button stays clickable so a failed attempt can reveal the
  // issue list (see `showIssues`); other templates keep the disabled state.
  const canConfirm = pendingCarousel
    ? true
    : Boolean(
        mediaUrl.trim() &&
        isMediaHeaderKind(headerKind) &&
        validateMediaUrl(headerKind, mediaUrl, { context: 'send' }).ok
      );

  return (
    <>
      <TemplatePicker
        open={open && !mediaDialogOpen}
        onOpenChange={handlePickerOpenChange}
        onSelect={handlePickerSelect}
      />

      <Dialog
        open={open && mediaDialogOpen}
        onOpenChange={handleMediaDialogOpenChange}
      >
        <DialogContent className="border-border bg-popover max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-2">
              <LayoutTemplate className="text-primary h-4 w-4" />
              {pending ? pending.template.name : t('mediaHeaderTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {pendingCarousel
                ? st('send.dialogDescription')
                : t('mediaHeaderDesc', {
                    type: pending?.template.header_type ?? 'media',
                  })}
            </DialogDescription>
          </DialogHeader>

          {pending && pendingCarousel && (
            <div className="py-2">
              <TemplateCarouselSendForm
                cards={carouselCards}
                state={carouselState}
                onChange={setCarouselState}
                body={renderWithSamples(
                  pending.template.body_text,
                  pending.values.body
                )}
                issues={carouselIssues}
                showIssues={confirmAttempted}
              />
            </div>
          )}

          {pending &&
            !pendingCarousel &&
            isMediaHeaderKind(pending.template.header_type) && (
              <div className="py-2">
                <TemplateHeaderMediaInput
                  headerType={pending.template.header_type}
                  value={mediaUrl}
                  onChange={setMediaUrl}
                />
              </div>
            )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMediaDialogOpen(false);
                setPending(null);
              }}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('back')}
            </Button>
            <Button
              disabled={!canConfirm}
              onClick={handleConfirmMedia}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {t('confirmSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
