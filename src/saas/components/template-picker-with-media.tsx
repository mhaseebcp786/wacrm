'use client';

import { useState, useRef, useEffect } from 'react';
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
import { isMediaHeaderKind } from '@/lib/whatsapp/media-header-types';
import type { MessageTemplate } from '@/types';

export interface TemplatePickerWithMediaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Extended callback that also passes optional headerMediaUrl
  onSelectWithMedia: (
    template: MessageTemplate,
    values: TemplateSendValues,
    headerMediaUrl?: string,
  ) => void;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function TemplatePickerWithMedia({
  open,
  onOpenChange,
  onSelectWithMedia,
}: TemplatePickerWithMediaProps) {
  const t = useTranslations('Inbox.templatePicker');
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [pending, setPending] = useState<{
    template: MessageTemplate;
    values: TemplateSendValues;
  } | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const transitionRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setMediaDialogOpen(false);
      setPending(null);
      setMediaUrl('');
    }
  }, [open]);

  const handlePickerSelect = (
    template: MessageTemplate,
    values: TemplateSendValues,
  ) => {
    if (template.header_type && isMediaHeaderKind(template.header_type)) {
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
    onSelectWithMedia(pending.template, pending.values, mediaUrl.trim());
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

  const canConfirm = Boolean(mediaUrl.trim() && isValidHttpUrl(mediaUrl.trim()));

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
        <DialogContent className="border-border bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              {t('mediaHeaderTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('mediaHeaderDesc', {
                type: pending?.template.header_type ?? 'media',
              })}
            </DialogDescription>
          </DialogHeader>

          {pending && isMediaHeaderKind(pending.template.header_type) && (
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
