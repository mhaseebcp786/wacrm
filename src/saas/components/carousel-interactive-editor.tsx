'use client';

import { useTranslations } from 'next-intl';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
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
  CAROUSEL_LIMITS,
  validateCarouselInteractivePayload,
  type CarouselInteractivePayload,
  type CarouselCard,
  type CarouselCardButtonType,
} from '@/saas/lib/whatsapp/carousel-interactive';

interface CarouselInteractiveEditorProps {
  value: CarouselInteractivePayload;
  onChange: (payload: CarouselInteractivePayload) => void;
}

export function CarouselInteractiveEditor({
  value,
  onChange,
}: CarouselInteractiveEditorProps) {
  const t = useTranslations('Settings.templates');
  const tInteractive = useTranslations('Interactive');

  const validation = validateCarouselInteractivePayload(value);

  // Common button type from the first card (default to 'cta_url')
  const currentButtonType: CarouselCardButtonType =
    value.cards[0]?.button?.type || 'cta_url';

  const updateBody = (body: string) => {
    onChange({ ...value, body });
  };

  const updateCard = (index: number, patch: Partial<CarouselCard>) => {
    const updatedCards = value.cards.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    onChange({ ...value, cards: updatedCards });
  };

  const setAllButtonTypes = (type: CarouselCardButtonType) => {
    const updatedCards = value.cards.map((card) => {
      if (type === 'cta_url') {
        return {
          ...card,
          button: {
            type: 'cta_url' as const,
            display_text:
              card.button.type === 'quick_reply'
                ? card.button.title.slice(0, CAROUSEL_LIMITS.maxButtonTextLength)
                : card.button.display_text,
            url: card.button.type === 'cta_url' ? card.button.url : 'https://',
          },
        };
      } else {
        return {
          ...card,
          button: {
            type: 'quick_reply' as const,
            id: `card_${card.card_index}_btn`,
            title:
              card.button.type === 'cta_url'
                ? card.button.display_text.slice(0, CAROUSEL_LIMITS.maxButtonTextLength)
                : card.button.title,
          },
        };
      }
    });
    onChange({ ...value, cards: updatedCards });
  };

  const addCard = () => {
    if (value.cards.length >= CAROUSEL_LIMITS.maxCards) return;
    const newIndex = value.cards.length;
    const newCard: CarouselCard = {
      card_index: newIndex,
      header_type: 'image',
      header_url: '',
      body_text: '',
      button:
        currentButtonType === 'cta_url'
          ? { type: 'cta_url', display_text: '', url: 'https://' }
          : { type: 'quick_reply', id: `card_${newIndex}_btn`, title: '' },
    };
    onChange({
      ...value,
      cards: [...value.cards, newCard],
    });
  };

  const removeCard = (index: number) => {
    if (value.cards.length <= CAROUSEL_LIMITS.minCards) return;
    const filtered = value.cards
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, card_index: i }));
    onChange({ ...value, cards: filtered });
  };

  return (
    <div className="space-y-4">
      {/* Intro text */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <Label className="text-xs text-muted-foreground">
            {tInteractive('carouselBody')}
          </Label>
          <span className="text-[11px] text-muted-foreground">
            {value.body.length}/{CAROUSEL_LIMITS.maxBodyLength}
          </span>
        </div>
        <Textarea
          placeholder={tInteractive('carouselBodyPlaceholder')}
          value={value.body}
          maxLength={CAROUSEL_LIMITS.maxBodyLength}
          onChange={(e) => updateBody(e.target.value)}
          className="min-h-20 bg-muted text-foreground"
        />
      </div>

      {/* Button type selector (homogeneous across all cards) */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {t('carouselButtonType')}
        </Label>
        <Select
          value={currentButtonType}
          onValueChange={(val) => setAllButtonTypes(val as CarouselCardButtonType)}
        >
          <SelectTrigger className="w-full bg-muted border-border text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="cta_url" className="text-popover-foreground">
              {t('carouselButtonTypeCta')}
            </SelectItem>
            <SelectItem value="quick_reply" className="text-popover-foreground">
              {t('carouselButtonTypeReply')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground">
            {t('carouselCards')} ({value.cards.length}/{CAROUSEL_LIMITS.maxCards})
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

        {value.cards.map((card, idx) => (
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
                  disabled={value.cards.length <= CAROUSEL_LIMITS.minCards}
                  className="h-7 w-7 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              {/* Header type & URL */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {t('cardHeaderType')}
                  </Label>
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

                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {t('cardHeaderUrl')}
                  </Label>
                  <Input
                    placeholder="https://example.com/media.jpg"
                    value={card.header_url}
                    onChange={(e) =>
                      updateCard(idx, { header_url: e.target.value })
                    }
                    className="h-8 bg-muted text-xs font-mono"
                  />
                </div>
              </div>

              {/* Card body text */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label className="text-[11px] text-muted-foreground">
                    {t('cardBody')}
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    {card.body_text.length}/{CAROUSEL_LIMITS.maxCardBodyLength}
                  </span>
                </div>
                <Textarea
                  placeholder="Card description (max 160 characters)"
                  value={card.body_text}
                  maxLength={CAROUSEL_LIMITS.maxCardBodyLength}
                  onChange={(e) =>
                    updateCard(idx, { body_text: e.target.value })
                  }
                  rows={2}
                  className="min-h-14 bg-muted text-xs"
                />
              </div>

              {/* Card button */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  {t('cardButton')} ({card.button.type === 'cta_url' ? t('carouselButtonTypeCta') : t('carouselButtonTypeReply')})
                </Label>
                {card.button.type === 'cta_url' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={t('btnLabelPlaceholder')}
                      maxLength={CAROUSEL_LIMITS.maxButtonTextLength}
                      value={card.button.display_text}
                      onChange={(e) =>
                        updateCard(idx, {
                          button: {
                            type: 'cta_url',
                            display_text: e.target.value,
                            url: (card.button as { url: string }).url,
                          },
                        })
                      }
                      className="h-8 bg-muted text-xs"
                    />
                    <Input
                      placeholder="https://example.com"
                      value={card.button.url}
                      onChange={(e) =>
                        updateCard(idx, {
                          button: {
                            type: 'cta_url',
                            display_text: (card.button as { display_text: string })
                              .display_text,
                            url: e.target.value,
                          },
                        })
                      }
                      className="h-8 bg-muted text-xs font-mono"
                    />
                  </div>
                ) : (
                  <Input
                    placeholder={t('btnLabelPlaceholder')}
                    maxLength={CAROUSEL_LIMITS.maxButtonTextLength}
                    value={card.button.title}
                    onChange={(e) =>
                      updateCard(idx, {
                        button: {
                          type: 'quick_reply',
                          id: (card.button as { id?: string }).id || `card_${idx}_btn`,
                          title: e.target.value,
                        },
                      })
                    }
                    className="h-8 bg-muted text-xs"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!validation.ok && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{validation.error}</span>
        </div>
      )}
    </div>
  );
}
