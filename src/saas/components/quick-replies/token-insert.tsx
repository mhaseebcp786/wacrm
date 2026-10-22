'use client';

import { useCallback, useRef, type FocusEvent } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  insertTokenIntoField,
  isTokenField,
  NAME_TOKEN,
  PHONE_TOKEN,
  type TextField,
} from '@/saas/lib/quick-replies/insert-token';

/**
 * Remembers the last plain-text field focused inside a form so a button
 * outside that field can insert into it. Works for every field in the
 * subtree, including those drawn by shared components (the interactive
 * builder, the carousel editor) that this editor cannot add buttons to.
 */
export function useTokenInsert() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastField = useRef<TextField | null>(null);
  const t = useTranslations('SaasQuickReplies.insertBar');

  const onFocusCapture = useCallback((e: FocusEvent) => {
    // React focus events also bubble out of portals (a dialog opened from
    // inside the form); only fields that really live in this form count.
    if (isTokenField(e.target) && rootRef.current?.contains(e.target)) {
      lastField.current = e.target;
    }
  }, []);

  const insert = useCallback(
    (token: string) => {
      const root = rootRef.current;
      let field = lastField.current;
      // The remembered field may have been unmounted (type tab switched).
      if (!field || !field.isConnected || !root?.contains(field)) {
        const first = root?.querySelector('textarea');
        field = first && isTokenField(first) ? first : null;
      }
      if (!field) {
        toast.info(t('noField'));
        return;
      }
      if (!insertTokenIntoField(field, token)) toast.error(t('noRoom'));
    },
    [t]
  );

  return { rootRef, onFocusCapture, insert };
}

/**
 * "Insert: Name / Phone". The buttons never take focus (mouse-down is
 * cancelled), so the field the agent is typing in keeps its caret and
 * selection.
 */
export function TokenInsertBar({
  onInsert,
}: {
  onInsert: (t: string) => void;
}) {
  const t = useTranslations('SaasQuickReplies.insertBar');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">{t('label')}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onInsert(NAME_TOKEN)}
      >
        {t('name')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onInsert(PHONE_TOKEN)}
      >
        {t('phone')}
      </Button>
    </div>
  );
}
