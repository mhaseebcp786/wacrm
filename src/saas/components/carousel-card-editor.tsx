'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Upload, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import {
  MEDIA_HEADER_SPECS,
  type MediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import {
  CAROUSEL_TEMPLATE_LIMITS,
  type CarouselTemplateCard,
} from '@/saas/lib/whatsapp/carousel-template';
import type { TemplateButton } from '@/types';

interface CarouselCardEditorProps {
  cards: CarouselTemplateCard[];
  onChange: (cards: CarouselTemplateCard[]) => void;
}

export function CarouselCardEditor({
  cards,
  onChange,
}: CarouselCardEditorProps) {
  const t = useTranslations('Settings.templates');
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Ensure initial minCards
  const effectiveCards =
    cards && cards.length >= CAROUSEL_TEMPLATE_LIMITS.minCards
      ? cards
      : [
          {
            header_type: 'image' as const,
            header_media_url: '',
            body_text: '',
            buttons: [],
          },
          {
            header_type: 'image' as const,
            header_media_url: '',
            body_text: '',
            buttons: [],
          },
        ];

  const updateCard = (index: number, patch: Partial<CarouselTemplateCard>) => {
    const next = effectiveCards.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    onChange(next);
  };

  const handleFileUpload = async (index: number, file: File) => {
    const card = effectiveCards[index];
    const kind: MediaHeaderKind = card.header_type;
    const spec = MEDIA_HEADER_SPECS[kind];

    if (!spec.mimeTypes.includes(file.type)) {
      toast.error(
        kind === 'image' ? t('toastInvalidImage') : t('toastInvalidVideo'),
      );
      return;
    }

    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[kind];
    if (file.size > maxBytes) {
      toast.error(
        t('toastMediaTooLarge', {
          size: (file.size / 1024 / 1024).toFixed(1),
          max: Math.round(maxBytes / 1024 / 1024),
        }),
      );
      return;
    }

    setUploadingIdx(index);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      updateCard(index, { header_media_url: publicUrl });
      toast.success(t('toastUploadSuccess'));
    } catch (err) {
      console.error('Carousel card media upload failed:', err);
      toast.error(t('toastUploadFailed'));
    } finally {
      setUploadingIdx(null);
    }
  };

  const addCard = () => {
    if (effectiveCards.length >= CAROUSEL_TEMPLATE_LIMITS.maxCards) return;
    const newCard: CarouselTemplateCard = {
      header_type: 'image',
      header_media_url: '',
      body_text: '',
      buttons: [],
    };
    onChange([...effectiveCards, newCard]);
  };

  const removeCard = (index: number) => {
    if (effectiveCards.length <= CAROUSEL_TEMPLATE_LIMITS.minCards) return;
    const filtered = effectiveCards.filter((_, i) => i !== index);
    onChange(filtered);
  };

  const addButton = (cardIndex: number, type: 'QUICK_REPLY' | 'URL') => {
    const card = effectiveCards[cardIndex];
    if (card.buttons.length >= CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard) return;

    const newBtn: TemplateButton =
      type === 'QUICK_REPLY'
        ? { type: 'QUICK_REPLY', text: '' }
        : { type: 'URL', text: '', url: '' };

    updateCard(cardIndex, { buttons: [...card.buttons, newBtn] });
  };

  const updateButton = (
    cardIndex: number,
    btnIndex: number,
    patch: Partial<TemplateButton>,
  ) => {
    const card = effectiveCards[cardIndex];
    const updatedButtons = card.buttons.map((b, i) =>
      i === btnIndex ? ({ ...b, ...patch } as TemplateButton) : b,
    );
    updateCard(cardIndex, { buttons: updatedButtons });
  };

  const removeButton = (cardIndex: number, btnIndex: number) => {
    const card = effectiveCards[cardIndex];
    updateCard(cardIndex, {
      buttons: card.buttons.filter((_, i) => i !== btnIndex),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground">
          {t('carouselCards')} ({effectiveCards.length}/{CAROUSEL_TEMPLATE_LIMITS.maxCards})
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCard}
          disabled={effectiveCards.length >= CAROUSEL_TEMPLATE_LIMITS.maxCards}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          {t('addCard')}
        </Button>
      </div>

      <div className="space-y-4">
        {effectiveCards.map((card, idx) => {
          const varIndices = extractVariableIndices(card.body_text);
          return (
            <Card key={idx} className="border-border bg-muted/30">
              <CardContent className="p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs font-medium text-foreground">
                    {t('cardIndex', { n: idx + 1 })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCard(idx)}
                    disabled={
                      effectiveCards.length <= CAROUSEL_TEMPLATE_LIMITS.minCards
                    }
                    className="h-7 w-7 text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                {/* Header type + upload */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-32">
                      <Select
                        value={card.header_type}
                        onValueChange={(val) =>
                          updateCard(idx, {
                            header_type: val as 'image' | 'video',
                          })
                        }
                      >
                        <SelectTrigger className="h-8 bg-muted text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image" className="text-xs">
                            {t('headerImage')}
                          </SelectItem>
                          <SelectItem value="video" className="text-xs">
                            {t('headerVideo')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <input
                      ref={(el) => {
                        fileInputRefs.current[idx] = el;
                      }}
                      type="file"
                      accept={MEDIA_HEADER_SPECS[card.header_type].mimeTypes.join(',')}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFileUpload(idx, file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingIdx === idx}
                      onClick={() => fileInputRefs.current[idx]?.click()}
                      className="h-8 gap-1.5 text-xs"
                    >
                      {uploadingIdx === idx ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {card.header_type === 'image'
                        ? t('uploadImage')
                        : t('uploadVideo')}
                    </Button>
                  </div>

                  <Input
                    placeholder="https://… (or paste public media link)"
                    value={card.header_media_url || ''}
                    onChange={(e) =>
                      updateCard(idx, { header_media_url: e.target.value })
                    }
                    className="h-8 bg-muted text-xs font-mono"
                  />
                  {card.header_type === 'image' && card.header_media_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.header_media_url}
                      alt={t('headerSampleAlt')}
                      className="max-h-24 rounded border border-border object-contain"
                    />
                  )}
                </div>

                {/* Body Text */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] text-muted-foreground">
                      {t('cardBody')}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {card.body_text.length}/{CAROUSEL_TEMPLATE_LIMITS.maxCardBodyLength}
                    </span>
                  </div>
                  <Textarea
                    placeholder="Card description (supports {{1}}, max 160 chars)"
                    value={card.body_text}
                    maxLength={CAROUSEL_TEMPLATE_LIMITS.maxCardBodyLength}
                    onChange={(e) =>
                      updateCard(idx, { body_text: e.target.value })
                    }
                    rows={2}
                    className="min-h-14 bg-muted text-xs"
                  />
                </div>

                {/* Sample values for body variables */}
                {varIndices.length > 0 && (
                  <div className="space-y-1 rounded bg-muted/20 p-2">
                    <Label className="text-[10px] uppercase font-semibold text-muted-foreground">
                      {t('sampleValues')}
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {varIndices.map((vNum, sIdx) => (
                        <Input
                          key={sIdx}
                          placeholder={t('samplePlaceholder', { var: `{{${vNum}}}` })}
                          value={card.body_sample?.[sIdx] || ''}
                          onChange={(e) => {
                            const samples = [...(card.body_sample || [])];
                            while (samples.length < varIndices.length) {
                              samples.push('');
                            }
                            samples[sIdx] = e.target.value;
                            updateCard(idx, { body_sample: samples });
                          }}
                          className="h-7 bg-muted text-xs"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Buttons (up to 2) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">
                      {t('cardButton')} ({card.buttons.length}/{CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard})
                    </Label>
                    {card.buttons.length <
                      CAROUSEL_TEMPLATE_LIMITS.maxButtonsPerCard && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addButton(idx, 'QUICK_REPLY')}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          + {t('btnQuickReply')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addButton(idx, 'URL')}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          + {t('btnUrl')}
                        </Button>
                      </div>
                    )}
                  </div>

                  {card.buttons.map((btn, bIdx) => (
                    <div
                      key={bIdx}
                      className="flex items-center gap-1.5 rounded border border-border/40 bg-muted/40 p-1.5"
                    >
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {btn.type === 'QUICK_REPLY' ? 'QR' : 'URL'}
                      </span>
                      <Input
                        placeholder={t('btnLabelPlaceholder')}
                        value={btn.text}
                        maxLength={25}
                        onChange={(e) =>
                          updateButton(idx, bIdx, { text: e.target.value })
                        }
                        className="h-7 bg-muted text-xs flex-1"
                      />
                      {btn.type === 'URL' && (
                        <Input
                          placeholder="https://…"
                          value={btn.url}
                          onChange={(e) =>
                            updateButton(idx, bIdx, { url: e.target.value })
                          }
                          className="h-7 bg-muted text-xs font-mono flex-1"
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeButton(idx, bIdx)}
                        className="h-6 w-6 text-muted-foreground hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
