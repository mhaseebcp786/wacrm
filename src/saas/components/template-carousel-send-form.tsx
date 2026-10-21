'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CarouselPreview } from '@/saas/components/carousel-preview';
import { TemplateHeaderMediaInput } from '@/saas/components/template-header-media-input';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import {
  describeCarouselIssue,
  toSendPreviewCards,
  urlVariableButtons,
  type CarouselIssue,
  type CarouselSendCardState,
  type CarouselTemplateCard,
} from '@/saas/lib/whatsapp/template-form-carousel';

type SendStateUpdate =
  | CarouselSendCardState[]
  | ((prev: CarouselSendCardState[]) => CarouselSendCardState[]);

export interface TemplateCarouselSendFormProps {
  /** Cards stored on the template (type, sample media, body, buttons). */
  cards: CarouselTemplateCard[];
  state: CarouselSendCardState[];
  /**
   * Next state or an updater against the LATEST state. Edits (including the
   * result of a media upload that finishes later) always use the updater
   * form, so concurrent edits to other cards/fields are never overwritten.
   */
  onChange: (next: SendStateUpdate) => void;
  /** Rendered above the cards' preview (already-filled main body). */
  body?: string;
  /** Blocking issues (always the full list; shown only once `showIssues` or touched). */
  issues?: CarouselIssue[];
  /** The host's confirm was attempted and failed: reveal the issue list. */
  showIssues?: boolean;
  /** Broadcast: note that values are shared by all recipients. */
  broadcastNote?: boolean;
}

/**
 * Confirm-step body for carousel templates: one block per card with a
 * media preview + replace control (prefilled from the template sample),
 * an input per card body variable and per URL-button variable.
 */
export function TemplateCarouselSendForm({
  cards,
  state,
  onChange,
  body,
  issues = [],
  showIssues = false,
  broadcastNote = false,
}: TemplateCarouselSendFormProps) {
  const t = useTranslations('SaasTemplates');
  const translate = (key: string, values?: Record<string, string | number>) =>
    t(key, values);
  // The red list appears after a failed confirm, or once the user edits.
  const [touched, setTouched] = useState(false);
  const revealIssues = showIssues || touched;

  const patch = (
    index: number,
    change:
      | Partial<CarouselSendCardState>
      | ((current: CarouselSendCardState) => Partial<CarouselSendCardState>)
  ) => {
    setTouched(true);
    onChange((prev) =>
      prev.map((s, i) =>
        i === index
          ? { ...s, ...(typeof change === 'function' ? change(s) : change) }
          : s
      )
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-popover-foreground text-sm font-medium">
          {t('send.heading')}
        </p>
        <p className="text-muted-foreground text-xs">{t('send.description')}</p>
        {broadcastNote && (
          <p className="text-muted-foreground mt-1 text-xs">
            {t('send.broadcastNote')}
          </p>
        )}
      </div>

      {cards.map((card, i) => {
        const s = state[i];
        if (!s) return null;
        const vars = extractVariableIndices(card.body_text);
        const urlSlots = urlVariableButtons(card);
        return (
          <div
            key={i}
            className="border-border bg-background/50 space-y-2 rounded-lg border p-3"
          >
            <p className="text-popover-foreground text-xs font-semibold">
              {t('send.cardTitle', { n: i + 1 })}
            </p>
            <TemplateHeaderMediaInput
              headerType={card.header_type}
              label={t('send.mediaLabel', { n: i + 1 })}
              value={s.mediaUrl}
              onChange={(url) => patch(i, { mediaUrl: url })}
            />
            {vars.map((v, vi) => (
              <div key={v} className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  {t('send.bodyVarLabel', { n: i + 1, var: `{{${v}}}` })}
                </Label>
                <Input
                  value={s.bodyParams[vi] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch(i, (cur) => {
                      const next = [...cur.bodyParams];
                      next[vi] = v;
                      return { bodyParams: next };
                    });
                  }}
                  placeholder={t('send.bodyVarPlaceholder', {
                    var: `{{${v}}}`,
                  })}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {urlSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <Label className="text-popover-foreground text-xs">
                  {t('send.urlVarLabel', { n: i + 1, text: slot.text })}
                </Label>
                <Input
                  value={s.urlButtonParams[slot.index] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch(i, (cur) => ({
                      urlButtonParams: {
                        ...cur.urlButtonParams,
                        [slot.index]: v,
                      },
                    }));
                  }}
                  placeholder={t('send.urlVarPlaceholder')}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-muted-foreground text-[10px] break-all">
                  {slot.url.replace(
                    /\{\{1\}\}/g,
                    s.urlButtonParams[slot.index] || '{{1}}'
                  )}
                </p>
              </div>
            ))}
          </div>
        );
      })}

      {issues.length > 0 && !revealIssues && (
        <p className="text-muted-foreground text-xs">
          {t('send.completeHint')}
        </p>
      )}
      {issues.length > 0 && revealIssues && (
        <ul
          role="alert"
          className="space-y-0.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {issues.map((issue, i) => (
            <li key={i}>{describeCarouselIssue(translate, issue)}</li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-[11px] font-semibold uppercase">
          {t('carousel.previewTitle')}
        </p>
        <CarouselPreview body={body} cards={toSendPreviewCards(cards, state)} />
      </div>
    </div>
  );
}
