'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  Phone,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { uploadAccountMedia } from '@/lib/storage/upload-media';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import { CarouselPreview } from '@/saas/components/carousel-preview';
import {
  describeMediaLimit,
  deriveDocumentFilename,
  validateMediaFile,
  validateMediaUrl,
} from '@/saas/lib/whatsapp/media-specs';
import {
  CAROUSEL_FORM_LIMITS,
  addCard,
  addCardButton,
  changeCardMediaType,
  checkCarouselConsistency,
  describeCarouselIssue,
  insertVariableAtCaret,
  patchCardButton,
  patchCardById,
  removeCardById,
  removeCardButton,
  setCardBody,
  setCardMediaUrl,
  setCardSample,
  toPreviewCards,
  validateCarouselCards,
  type CarouselCardButtonKind,
  type CarouselIssue,
  type CarouselTemplateCard,
} from '@/saas/lib/whatsapp/template-form-carousel';
import { MEDIA_HEADER_SPECS } from '@/lib/whatsapp/media-header-types';
import type { TemplateButton } from '@/types';

type CardsUpdate =
  | CarouselTemplateCard[]
  | ((prev: CarouselTemplateCard[]) => CarouselTemplateCard[]);

export interface CarouselCardEditorProps {
  cards: CarouselTemplateCard[];
  /**
   * Receives either the next list or an updater against the LATEST list.
   * Async work (media uploads) always uses the updater form, so edits made
   * while a file uploads are never overwritten with a stale array.
   */
  onChange: (next: CardsUpdate) => void;
  /** Main template body, shown above the cards in the live preview. */
  bodyText?: string;
}

/** Issues that only mean "not filled in yet"; shown on submit, not live. */
const REQUIRED_CODES = new Set([
  'mediaMissing',
  'cardBodyRequired',
  'cardSampleMissing',
  'buttonTextRequired',
  'urlRequired',
  'urlExampleRequired',
  'phoneRequired',
]);

export function CarouselCardEditor({
  cards,
  onChange,
  bodyText,
}: CarouselCardEditorProps) {
  const t = useTranslations('SaasTemplates');
  // In-flight uploads, keyed by the card's stable client id.
  const [uploading, setUploading] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const bodyRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // False once the editor (its dialog) is gone: late upload results are dropped.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const uploadKey = (card: CarouselTemplateCard | undefined, index: number) =>
    card?.cid ?? `idx-${index}`;

  /** Applies `change` to the card at `index`, resolved by stable id at apply time. */
  const patchCard = (
    index: number,
    change: (card: CarouselTemplateCard) => CarouselTemplateCard
  ) => {
    const cid = cards[index]?.cid;
    onChange((prev) =>
      cid
        ? patchCardById(prev, cid, change)
        : prev.map((c, i) => (i === index ? change(c) : c))
    );
  };

  const setUploadState = (key: string, active: boolean) =>
    setUploading((prev) => {
      const next = new Set(prev);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });

  const handleFile = async (index: number, file: File) => {
    const card = cards[index];
    if (!card) return;
    const cid = card.cid;
    const mediaType = card.header_type;
    const key = uploadKey(card, index);
    const res = validateMediaFile(card.header_type, file, { context: 'send' });
    if (!res.ok && res.error) {
      toast.error(
        t('media.toastRejected', {
          reason: t(`media.issues.${res.error.code}`, res.error.params ?? {}),
        })
      );
      return;
    }
    setUploadState(key, true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      // The dialog was closed meanwhile: nothing to update.
      if (!mountedRef.current) return;
      // Resolve the card by id against the latest list. A card removed
      // during the upload is skipped; so is one whose media type changed.
      onChange((prev) =>
        cid
          ? patchCardById(prev, cid, (c) =>
              c.header_type === mediaType ? setCardMediaUrl(c, publicUrl) : c
            )
          : prev
      );
      toast.success(t('media.toastUploaded'));
    } catch (err) {
      console.error('Carousel card media upload failed:', err);
      if (mountedRef.current) {
        toast.error(
          err instanceof Error ? err.message : t('media.toastUploadFailed')
        );
      }
    } finally {
      if (mountedRef.current) setUploadState(key, false);
    }
  };

  const handleAddVariable = (index: number) => {
    const card = cards[index];
    const el = bodyRefs.current[index];
    if (!card) return;
    const start = el?.selectionStart ?? card.body_text.length;
    const end = el?.selectionEnd ?? start;
    const result = insertVariableAtCaret(card, start, end);
    if (!result) return;
    patchCard(index, (c) => insertVariableAtCaret(c, start, end)?.card ?? c);
    // Restore the caret after React re-renders the controlled textarea.
    requestAnimationFrame(() => {
      const target = bodyRefs.current[index];
      if (!target) return;
      target.focus();
      target.setSelectionRange(result.caret, result.caret);
    });
  };

  const translate = (key: string, values?: Record<string, string | number>) =>
    t(key, values);
  const consistency = checkCarouselConsistency(cards);
  const issuesByCard = new Map<number, CarouselIssue[]>();
  for (const issue of validateCarouselCards(cards)) {
    if (!issue.card || REQUIRED_CODES.has(issue.code)) continue;
    if (
      issue.code === 'headerTypeMismatch' ||
      issue.code === 'buttonLayoutMismatch'
    )
      continue;
    issuesByCard.set(issue.card, [
      ...(issuesByCard.get(issue.card) ?? []),
      issue,
    ]);
  }

  const atMax = cards.length >= CAROUSEL_FORM_LIMITS.maxCards;
  const canRemove = cards.length > CAROUSEL_FORM_LIMITS.minCards;

  return (
    <div className="space-y-4">
      <div className="border-border bg-muted/30 text-muted-foreground rounded-md border px-3 py-2 text-[11px] leading-relaxed">
        <p>{t('carousel.categoryNote')}</p>
        <p>{t('carousel.bodyNote')}</p>
      </div>

      <Label className="text-muted-foreground text-xs font-semibold">
        {t('carousel.cardsCount', {
          n: cards.length,
          max: CAROUSEL_FORM_LIMITS.maxCards,
          min: CAROUSEL_FORM_LIMITS.minCards,
        })}
      </Label>

      {consistency.length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5 shrink-0" />
            {t('carousel.consistencyTitle')}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {consistency.map((issue, i) => (
              <li key={i}>{describeCarouselIssue(translate, issue)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {cards.map((card, idx) => {
          const isUploading = uploading.has(uploadKey(card, idx));
          const varIndices = extractVariableIndices(card.body_text);
          const limit = describeMediaLimit(card.header_type, 'send');
          const mediaUrl = card.header_media_url ?? '';
          const urlCheck = mediaUrl.trim()
            ? validateMediaUrl(card.header_type, mediaUrl, { context: 'send' })
            : null;
          const fileName = mediaUrl.trim()
            ? deriveDocumentFilename(mediaUrl)
            : null;
          const cardIssues = issuesByCard.get(idx + 1) ?? [];
          return (
            <Card key={card.cid ?? idx} className="border-border bg-muted/30">
              <CardContent className="space-y-3 p-3.5">
                <div className="border-border/50 flex items-center justify-between border-b pb-2">
                  <span className="text-foreground text-xs font-medium">
                    {t('carousel.cardTitle', { n: idx + 1 })}
                  </span>
                  {canRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const cid = card.cid;
                        onChange((prev) =>
                          cid
                            ? removeCardById(prev, cid)
                            : prev.filter((_, i) => i !== idx)
                        );
                      }}
                      className="h-7 gap-1 px-2 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" />
                      {t('carousel.removeCard')}
                    </Button>
                  )}
                </div>

                {/* Media: type select, upload, pasted URL */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-32">
                      <Select
                        value={card.header_type}
                        onValueChange={(val) => {
                          if (val !== 'image' && val !== 'video') return;
                          patchCard(idx, (c) => changeCardMediaType(c, val));
                        }}
                      >
                        <SelectTrigger className="bg-muted h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image" className="text-xs">
                            {t('carousel.typeImage')}
                          </SelectItem>
                          <SelectItem value="video" className="text-xs">
                            {t('carousel.typeVideo')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <input
                      ref={(el) => {
                        fileInputRefs.current[idx] = el;
                      }}
                      type="file"
                      accept={MEDIA_HEADER_SPECS[
                        card.header_type
                      ].mimeTypes.join(',')}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(idx, file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                      onClick={() => fileInputRefs.current[idx]?.click()}
                      className="h-8 gap-1.5 text-xs"
                    >
                      {isUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {card.header_type === 'image'
                        ? t('carousel.uploadImage')
                        : t('carousel.uploadVideo')}
                    </Button>
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
                      {t('media.metaLimit', limit)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Input
                      type="url"
                      placeholder={t('carousel.mediaUrlPlaceholder')}
                      value={mediaUrl}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchCard(idx, (c) => setCardMediaUrl(c, v));
                      }}
                      aria-label={t('carousel.mediaUrlLabel', { n: idx + 1 })}
                      className="bg-muted h-8 flex-1 font-mono text-xs"
                    />
                    {mediaUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          patchCard(idx, (c) => setCardMediaUrl(c, ''))
                        }
                        aria-label={t('media.clear')}
                        className="text-muted-foreground h-8 w-8 shrink-0 hover:text-red-400"
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  {fileName && (
                    <p className="text-muted-foreground truncate text-[11px]">
                      {fileName}
                    </p>
                  )}
                  {urlCheck && !urlCheck.ok && urlCheck.error && (
                    <p className="flex items-center gap-1 text-[11px] text-red-400">
                      <AlertCircle className="size-3 shrink-0" />
                      {t(
                        `media.issues.${urlCheck.error.code}`,
                        urlCheck.error.params ?? {}
                      )}
                    </p>
                  )}
                  {urlCheck?.ok && urlCheck.warning && (
                    <p className="text-[11px] text-amber-300">
                      {t(`media.issues.${urlCheck.warning.code}`)}
                    </p>
                  )}
                  {mediaUrl.trim() && card.header_type === 'image' && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl.trim()}
                      alt={t('carousel.mediaAlt', { n: idx + 1 })}
                      className="border-border max-h-24 rounded border object-contain"
                    />
                  )}
                  {mediaUrl.trim() && card.header_type === 'video' && (
                    <video
                      src={mediaUrl.trim()}
                      muted
                      playsInline
                      preload="metadata"
                      className="border-border max-h-24 rounded border"
                    />
                  )}
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-[11px]">
                      {t('carousel.bodyLabel')}
                    </Label>
                    <span className="text-muted-foreground text-[10px]">
                      {card.body_text.length}/
                      {CAROUSEL_FORM_LIMITS.maxCardBodyLength}
                    </span>
                  </div>
                  <Textarea
                    ref={(el) => {
                      bodyRefs.current[idx] = el;
                    }}
                    placeholder={t('carousel.bodyPlaceholder')}
                    value={card.body_text}
                    maxLength={CAROUSEL_FORM_LIMITS.maxCardBodyLength}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchCard(idx, (c) => setCardBody(c, v));
                    }}
                    rows={3}
                    className="bg-muted min-h-14 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddVariable(idx)}
                    disabled={
                      varIndices.length >=
                      CAROUSEL_FORM_LIMITS.maxCardBodyVariables
                    }
                    className="h-6 gap-1 px-1.5 text-[10px]"
                  >
                    <Plus className="size-3" />
                    {t('carousel.addVariable', {
                      n: varIndices.length,
                      max: CAROUSEL_FORM_LIMITS.maxCardBodyVariables,
                    })}
                  </Button>
                </div>

                {varIndices.length > 0 && (
                  <div className="bg-muted/20 space-y-1 rounded p-2">
                    <Label className="text-muted-foreground text-[10px] font-semibold uppercase">
                      {t('carousel.examplesLabel')}
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {varIndices.map((vNum, sIdx) => (
                        <Input
                          key={vNum}
                          placeholder={t('carousel.examplePlaceholder', {
                            var: `{{${vNum}}}`,
                          })}
                          aria-label={t('carousel.examplePlaceholder', {
                            var: `{{${vNum}}}`,
                          })}
                          value={card.body_sample?.[sIdx] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchCard(idx, (c) => setCardSample(c, sIdx, v));
                          }}
                          className="bg-muted h-7 text-xs"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-[11px]">
                      {t('carousel.buttonsLabel', {
                        n: card.buttons.length,
                        max: CAROUSEL_FORM_LIMITS.maxButtonsPerCard,
                      })}
                    </Label>
                    {card.buttons.length <
                      CAROUSEL_FORM_LIMITS.maxButtonsPerCard && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px]">
                          <Plus className="size-3" />
                          {t('carousel.addButton')}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {(
                            [
                              ['QUICK_REPLY', 'btnQuickReply'],
                              ['URL', 'btnUrl'],
                              ['PHONE_NUMBER', 'btnCall'],
                            ] as const satisfies ReadonlyArray<
                              readonly [CarouselCardButtonKind, string]
                            >
                          ).map(([kind, labelKey]) => (
                            <DropdownMenuItem
                              key={kind}
                              onClick={() =>
                                patchCard(idx, (c) => addCardButton(c, kind))
                              }
                            >
                              {t(`carousel.${labelKey}`)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {card.buttons.length >=
                    CAROUSEL_FORM_LIMITS.maxButtonsPerCard && (
                    <p className="text-muted-foreground text-[10px]">
                      {t('carousel.maxButtonsHint', {
                        max: CAROUSEL_FORM_LIMITS.maxButtonsPerCard,
                      })}
                    </p>
                  )}

                  {card.buttons.map((btn, bIdx) => (
                    <CardButtonRow
                      key={bIdx}
                      btn={btn}
                      onPatch={(patch) =>
                        patchCard(idx, (c) => patchCardButton(c, bIdx, patch))
                      }
                      onRemove={() =>
                        patchCard(idx, (c) => removeCardButton(c, bIdx))
                      }
                    />
                  ))}
                </div>

                {cardIssues.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-red-400">
                    {cardIssues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <AlertCircle className="mt-0.5 size-3 shrink-0" />
                        {describeCarouselIssue(translate, issue)}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange((prev) => addCard(prev))}
          disabled={atMax}
          className="w-full gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          {t('carousel.addCard', {
            n: cards.length,
            max: CAROUSEL_FORM_LIMITS.maxCards,
          })}
        </Button>
        {atMax && (
          <p className="text-[11px] text-red-400">
            {t('carousel.maxCardsReached', {
              max: CAROUSEL_FORM_LIMITS.maxCards,
            })}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-[11px] font-semibold uppercase">
          {t('carousel.previewTitle')}
        </p>
        <CarouselPreview body={bodyText} cards={toPreviewCards(cards)} />
      </div>
    </div>
  );
}

function CardButtonRow({
  btn,
  onPatch,
  onRemove,
}: {
  btn: TemplateButton;
  onPatch: (patch: {
    text?: string;
    url?: string;
    example?: string;
    phone_number?: string;
  }) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('SaasTemplates');
  const tag =
    btn.type === 'QUICK_REPLY'
      ? t('carousel.btnQuickReply')
      : btn.type === 'URL'
        ? t('carousel.btnUrl')
        : t('carousel.btnCall');
  const urlVar =
    btn.type === 'URL' && extractVariableIndices(btn.url).length > 0;
  return (
    <div className="border-border/40 bg-muted/40 space-y-1.5 rounded border p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase">
          {btn.type === 'PHONE_NUMBER' && <Phone className="size-3" />}
          {tag}
        </span>
        <Input
          placeholder={t('carousel.buttonTextPlaceholder')}
          value={btn.text}
          maxLength={CAROUSEL_FORM_LIMITS.maxButtonTextLength}
          onChange={(e) => onPatch({ text: e.target.value })}
          className="bg-muted h-7 flex-1 text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={t('carousel.removeButton')}
          className="text-muted-foreground h-6 w-6 shrink-0 hover:text-red-400"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {btn.type === 'URL' && (
        <div className="space-y-1.5">
          <Input
            placeholder={t('carousel.urlPlaceholder')}
            value={btn.url}
            maxLength={CAROUSEL_FORM_LIMITS.maxUrlLength}
            onChange={(e) => onPatch({ url: e.target.value })}
            className="bg-muted h-7 font-mono text-xs"
          />
          {urlVar && (
            <Input
              placeholder={t('carousel.urlExamplePlaceholder', {
                var: '{{1}}',
              })}
              value={btn.example ?? ''}
              onChange={(e) => onPatch({ example: e.target.value })}
              className="bg-muted h-7 text-xs"
            />
          )}
        </div>
      )}
      {btn.type === 'PHONE_NUMBER' && (
        <Input
          placeholder={t('carousel.phonePlaceholder')}
          value={btn.phone_number}
          onChange={(e) => onPatch({ phone_number: e.target.value })}
          className="bg-muted h-7 font-mono text-xs"
        />
      )}
    </div>
  );
}
