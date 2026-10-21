'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Trash2, AlertCircle, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { uploadAccountMedia } from '@/lib/storage/upload-media';
import {
  CAROUSEL_LIMITS,
  isValidHttpsUrl,
  newCarouselCardId,
  patchCarouselCardById,
  validateCarouselInteractivePayload,
  type CarouselCard,
  type CarouselCardButton,
  type CarouselCardButtonType,
  type CarouselInteractivePayload,
} from '@/saas/lib/whatsapp/carousel-interactive';
import {
  CAROUSEL_MEDIA_RULES,
  validateCarouselMediaFile,
  type CarouselMediaKind,
} from '@/saas/lib/whatsapp/carousel-media';

const CHAT_MEDIA_BUCKET = 'chat-media';

type PayloadUpdate =
  | CarouselInteractivePayload
  | ((prev: CarouselInteractivePayload) => CarouselInteractivePayload);

interface CarouselInteractiveEditorProps {
  value: CarouselInteractivePayload;
  /**
   * Receives the next payload or an updater against the LATEST payload.
   * Async media uploads use the updater form (keyed by the card's stable
   * client id) so edits made while a file uploads are not overwritten.
   */
  onChange: (next: PayloadUpdate) => void;
  /** Show the validation summary (the host turns this on after a send attempt). */
  showIssues?: boolean;
}

function emptyButton(
  type: CarouselCardButtonType,
  index: number
): CarouselCardButton {
  return type === 'cta_url'
    ? { type: 'cta_url', display_text: '', url: 'https://' }
    : { type: 'quick_reply', id: `card_${index}_btn`, title: '' };
}

export function CarouselInteractiveEditor({
  value,
  onChange,
  showIssues = false,
}: CarouselInteractiveEditorProps) {
  const t = useTranslations('SaasCarousel');

  const validation = validateCarouselInteractivePayload(value);

  const buttonType: CarouselCardButtonType =
    value.cards[0]?.button?.type ?? 'cta_url';
  const mediaKind: CarouselMediaKind = value.cards[0]?.header_type ?? 'image';

  /**
   * Applies `change` to one card, resolved by its stable id against the
   * latest payload at apply time (falls back to the index for legacy cards
   * without an id).
   */
  const updateCard = (
    index: number,
    change: Partial<CarouselCard> | ((card: CarouselCard) => CarouselCard)
  ) => {
    const cid = value.cards[index]?.cid;
    const apply = (c: CarouselCard): CarouselCard =>
      typeof change === 'function' ? change(c) : { ...c, ...change };
    onChange((prev) =>
      cid
        ? patchCarouselCardById(prev, cid, apply)
        : {
            ...prev,
            cards: prev.cards.map((c, i) => (i === index ? apply(c) : c)),
          }
    );
  };

  // Meta requires the same header type and button type on every card, so
  // both are message-level choices applied to all cards at once.
  const setAllMediaKinds = (kind: CarouselMediaKind) => {
    onChange((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.header_type === kind ? c : { ...c, header_type: kind, header_url: '' }
      ),
    }));
  };

  const setAllButtonTypes = (type: CarouselCardButtonType) => {
    if (type === buttonType) return;
    onChange((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) => {
        const label =
          card.button.type === 'cta_url'
            ? card.button.display_text
            : card.button.title;
        const next = emptyButton(type, i);
        return {
          ...card,
          button:
            next.type === 'cta_url'
              ? { ...next, display_text: label }
              : { ...next, title: label },
        };
      }),
    }));
  };

  const addCard = () => {
    onChange((prev) => {
      if (prev.cards.length >= CAROUSEL_LIMITS.maxCards) return prev;
      const n = prev.cards.length;
      const kind = prev.cards[0]?.header_type ?? 'image';
      const type = prev.cards[0]?.button?.type ?? 'cta_url';
      return {
        ...prev,
        cards: [
          ...prev.cards,
          {
            cid: newCarouselCardId(),
            card_index: n,
            header_type: kind,
            header_url: '',
            body_text: '',
            button: emptyButton(type, n),
          },
        ],
      };
    });
  };

  const removeCard = (index: number) => {
    const cid = value.cards[index]?.cid;
    onChange((prev) => {
      if (prev.cards.length <= CAROUSEL_LIMITS.minCards) return prev;
      const at = cid ? prev.cards.findIndex((c) => c.cid === cid) : index;
      if (at < 0) return prev;
      return {
        ...prev,
        cards: prev.cards
          .filter((_, i) => i !== at)
          .map((c, i) => ({
            ...c,
            card_index: i,
            button:
              c.button.type === 'quick_reply' &&
              /^card_\d+_btn$/.test(c.button.id ?? '')
                ? { ...c.button, id: `card_${i}_btn` }
                : c.button,
          })),
      };
    });
  };

  const issueText = (() => {
    if (validation.ok) return null;
    return t(`issues.${validation.code}`, {
      card: validation.card ?? 0,
      maxBody: CAROUSEL_LIMITS.maxBodyLength,
      maxCardBody: CAROUSEL_LIMITS.maxCardBodyLength,
      maxLabel: CAROUSEL_LIMITS.maxButtonTextLength,
      maxLines: CAROUSEL_LIMITS.maxCardBodyLineBreaks,
    });
  })();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground text-xs">{t('body')}</Label>
          <span className="text-muted-foreground text-[11px]">
            {value.body.length}/{CAROUSEL_LIMITS.maxBodyLength}
          </span>
        </div>
        <Textarea
          placeholder={t('bodyPlaceholder')}
          value={value.body}
          maxLength={CAROUSEL_LIMITS.maxBodyLength}
          onChange={(e) => {
            const v = e.target.value;
            onChange((prev) => ({ ...prev, body: v }));
          }}
          className="bg-muted text-foreground min-h-20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">
            {t('mediaType')}
          </Label>
          <Select
            value={mediaKind}
            onValueChange={(v) => setAllMediaKinds(v as CarouselMediaKind)}
          >
            <SelectTrigger className="border-border bg-muted text-foreground w-full">
              <SelectValue>
                {mediaKind === 'image' ? t('image') : t('video')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="image" className="text-popover-foreground">
                {t('image')}
              </SelectItem>
              <SelectItem value="video" className="text-popover-foreground">
                {t('video')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">
            {t('buttonType')}
          </Label>
          <Select
            value={buttonType}
            onValueChange={(v) =>
              setAllButtonTypes(v as CarouselCardButtonType)
            }
          >
            <SelectTrigger className="border-border bg-muted text-foreground w-full">
              <SelectValue>
                {buttonType === 'cta_url'
                  ? t('buttonTypeCta')
                  : t('buttonTypeReply')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="cta_url" className="text-popover-foreground">
                {t('buttonTypeCta')}
              </SelectItem>
              <SelectItem
                value="quick_reply"
                className="text-popover-foreground"
              >
                {t('buttonTypeReply')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-muted-foreground text-[11px]">{t('sameForAllHint')}</p>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground text-xs font-semibold">
            {t('cardsCount', {
              count: value.cards.length,
              max: CAROUSEL_LIMITS.maxCards,
            })}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCard}
            disabled={value.cards.length >= CAROUSEL_LIMITS.maxCards}
            className="h-8 gap-1.5 text-xs"
          >
            <Plus className="size-3.5" />
            {t('addCard')}
          </Button>
        </div>

        {value.cards.map((card, idx) => {
          const btn = card.button;
          return (
            <Card key={card.cid ?? idx} className="border-border bg-muted/30">
              <CardContent className="space-y-3 p-3.5">
                <div className="border-border/50 flex items-center justify-between border-b pb-2">
                  <span className="text-foreground text-xs font-medium">
                    {t('cardTitle', { n: idx + 1 })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('removeCard')}
                    title={t('removeCard')}
                    onClick={() => removeCard(idx)}
                    disabled={value.cards.length <= CAROUSEL_LIMITS.minCards}
                    className="text-muted-foreground h-7 w-7 hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <CardMediaField
                  kind={mediaKind}
                  url={card.header_url}
                  onChange={(url) => updateCard(idx, { header_url: url })}
                  onUploaded={(url, uploadedKind) =>
                    // Skip when the media type was switched during the upload.
                    updateCard(idx, (c) =>
                      c.header_type === uploadedKind
                        ? { ...c, header_url: url }
                        : c
                    )
                  }
                />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-[11px]">
                      {t('cardBody')}
                    </Label>
                    <span className="text-muted-foreground text-[10px]">
                      {card.body_text.length}/
                      {CAROUSEL_LIMITS.maxCardBodyLength}
                    </span>
                  </div>
                  <Textarea
                    placeholder={t('cardBodyPlaceholder')}
                    value={card.body_text}
                    maxLength={CAROUSEL_LIMITS.maxCardBodyLength}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateCard(idx, { body_text: v });
                    }}
                    rows={2}
                    className="bg-muted min-h-14 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-[11px]">
                    {t('buttonLabel')}
                  </Label>
                  {btn.type === 'cta_url' ? (
                    <ButtonLabelInput
                      value={btn.display_text}
                      placeholder={t('buttonLabelPlaceholder')}
                      onChange={(v) =>
                        updateCard(idx, (c) =>
                          c.button.type === 'cta_url'
                            ? { ...c, button: { ...c.button, display_text: v } }
                            : c
                        )
                      }
                    />
                  ) : (
                    <ButtonLabelInput
                      value={btn.title}
                      placeholder={t('buttonLabelPlaceholder')}
                      onChange={(v) =>
                        updateCard(idx, (c) =>
                          c.button.type === 'quick_reply'
                            ? { ...c, button: { ...c.button, title: v } }
                            : c
                        )
                      }
                    />
                  )}
                  {btn.type === 'cta_url' ? (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-[11px]">
                        {t('buttonUrl')}
                      </Label>
                      <Input
                        placeholder={t('buttonUrlPlaceholder')}
                        value={btn.url}
                        aria-invalid={
                          btn.url !== '' &&
                          btn.url !== 'https://' &&
                          !isValidHttpsUrl(btn.url)
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          updateCard(idx, (c) =>
                            c.button.type === 'cta_url'
                              ? { ...c, button: { ...c.button, url: v } }
                              : c
                          );
                        }}
                        className="bg-muted h-8 font-mono text-xs"
                      />
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showIssues && issueText ? (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-xs text-red-400"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{issueText}</span>
        </div>
      ) : null}
    </div>
  );
}

function ButtonLabelInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        maxLength={CAROUSEL_LIMITS.maxButtonTextLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted h-8 pr-12 text-xs"
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px]">
        {value.length}/{CAROUSEL_LIMITS.maxButtonTextLength}
      </span>
    </div>
  );
}

/**
 * Per-card media: upload a file (validated against Meta's carousel header
 * rules) or paste an HTTPS link. Uploads go to the account-scoped chat-media
 * bucket, whose public URL Meta fetches at send time.
 */
function CardMediaField({
  kind,
  url,
  onChange,
  onUploaded,
}: {
  kind: CarouselMediaKind;
  url: string;
  /** Typed / pasted link. */
  onChange: (url: string) => void;
  /** An upload finished; `kind` is the media type the upload started with. */
  onUploaded: (url: string, kind: CarouselMediaKind) => void;
}) {
  const t = useTranslations('SaasCarousel');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // This field unmounts when its card is removed or the dialog closes; a
  // late upload result is then dropped instead of landing elsewhere.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const rule = CAROUSEL_MEDIA_RULES[kind];
  const maxMb = Math.round(rule.maxBytes / (1024 * 1024));

  const handleFile = async (file: File) => {
    const issue = validateCarouselMediaFile(file, kind);
    if (issue === 'type') {
      toast.error(
        t(kind === 'image' ? 'mediaTypeErrorImage' : 'mediaTypeErrorVideo')
      );
      return;
    }
    if (issue === 'size') {
      toast.error(t('mediaSizeError', { max: maxMb }));
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
      if (!mountedRef.current) return;
      onUploaded(publicUrl, kind);
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          t('uploadFailed', {
            reason: err instanceof Error ? err.message : t('unknownError'),
          })
        );
      }
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  };

  const showUrlError = url !== '' && !isValidHttpsUrl(url);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-[11px]">
          {kind === 'image' ? t('image') : t('video')}
        </Label>
        <span className="text-muted-foreground text-[10px]">
          {t(kind === 'image' ? 'mediaHintImage' : 'mediaHintVideo', {
            max: maxMb,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={rule.accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="h-8 shrink-0 gap-1.5 text-xs"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {uploading ? t('uploading') : t('upload')}
        </Button>
        <Input
          placeholder={t('pasteUrlPlaceholder')}
          value={url}
          aria-invalid={showUrlError}
          onChange={(e) => onChange(e.target.value.trim())}
          className="bg-muted h-8 font-mono text-xs"
        />
      </div>
      {showUrlError ? (
        <p className="text-[11px] text-red-400">{t('urlMustBeHttps')}</p>
      ) : null}
    </div>
  );
}
