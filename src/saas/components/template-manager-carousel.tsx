'use client';

/**
 * Single seam between the upstream `template-manager.tsx` and the carousel
 * template feature. The upstream file only imports from here and makes a
 * handful of one-line calls:
 *
 *   - `useSaasCarouselFormState(useState(...))` wraps the form setter so a
 *     carousel header always pins the Marketing category and keeps >= 2 cards
 *   - `useSaasCarouselTemplateForm(form, editingId)` returns the submit
 *     guard, the fetch interceptor (routes carousels to the fork endpoints),
 *     the extra header format + its label, and `isCarousel`
 *   - `<SaasCarouselSlot />` renders the card editor
 *   - `<SaasHideForCarousel />` hides the footer / template-level buttons
 */

import {
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CarouselCardEditor } from '@/saas/components/carousel-card-editor';
import {
  applyCarouselDefaults,
  buildCarouselRequest,
  carouselFormError,
  type CarouselFormSlice,
  type CarouselFormSnapshot,
} from '@/saas/lib/whatsapp/template-form-carousel';

export { CarouselTemplateBadge } from '@/saas/components/carousel-template-badge';
export {
  templateCarouselCards,
  type CarouselTemplateCard,
} from '@/saas/lib/whatsapp/template-form-carousel';

/**
 * Wraps `[form, setForm]` so every update passes through
 * `applyCarouselDefaults` (no-op unless the header format is 'carousel').
 */
export function useSaasCarouselFormState<T extends CarouselFormSlice>(
  state: readonly [T, Dispatch<SetStateAction<T>>]
): [T, Dispatch<SetStateAction<T>>] {
  const [form, rawSetForm] = state;
  const setForm = useCallback<Dispatch<SetStateAction<T>>>(
    (action) =>
      rawSetForm((prev) =>
        applyCarouselDefaults(
          typeof action === 'function' ? action(prev) : action
        )
      ),
    [rawSetForm]
  );
  return [form, setForm];
}

export function useSaasCarouselTemplateForm(
  form: CarouselFormSnapshot,
  editingId: string | null
) {
  const st = useTranslations('SaasTemplates');
  const tt = useTranslations('Settings.templates');
  const isCarousel = form.header_format === 'carousel';

  return {
    isCarousel,
    /** Toasts the first blocking carousel problem; true means "stop submit". */
    blockSubmit: (): boolean => {
      const error = carouselFormError(form, st);
      if (!error) return false;
      toast.error(error);
      return true;
    },
    /** `fetch` that sends carousel forms to the fork endpoints, others untouched. */
    fetch: (url: string, init: RequestInit): Promise<Response> => {
      if (!isCarousel) return fetch(url, init);
      const payload = JSON.parse(String(init.body ?? '{}')) as Record<
        string,
        unknown
      >;
      const request = buildCarouselRequest(form, payload, editingId);
      return request
        ? fetch(request.url, { ...init, body: request.body })
        : fetch(url, init);
    },
    /** The upstream format list plus 'carousel'. */
    headerFormats: <T extends string>(
      base: readonly T[]
    ): Array<T | 'carousel'> =>
      base.includes('carousel' as T) ? [...base] : [...base, 'carousel'],
    /** Label for the extra format; any other format keeps upstream's `fallback`. */
    headerLabel: (format: string, fallback: string): string =>
      format === 'carousel' ? tt('carousel') : fallback,
  };
}

/** Card editor for the carousel header format (renders nothing otherwise). */
export function SaasCarouselSlot<
  T extends CarouselFormSlice & { body_text: string },
>({ form, setForm }: { form: T; setForm: Dispatch<SetStateAction<T>> }) {
  if (form.header_format !== 'carousel') return null;
  return (
    <CarouselCardEditor
      cards={form.carousel_cards}
      bodyText={form.body_text}
      onChange={(next) =>
        setForm((prev) => ({
          ...prev,
          carousel_cards:
            typeof next === 'function' ? next(prev.carousel_cards) : next,
        }))
      }
    />
  );
}

/** Wraps the footer + template-level buttons: carousels have neither. */
export function SaasHideForCarousel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return <div className={active ? 'hidden' : 'space-y-4'}>{children}</div>;
}
