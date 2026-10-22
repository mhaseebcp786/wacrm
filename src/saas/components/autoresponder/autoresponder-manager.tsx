'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { issueText } from '@/saas/components/quick-replies/issue-text';
import { MessagePreview } from '@/saas/components/quick-replies/message-preview';
import {
  emptyRuleForm,
  formToCandidate,
  itemToForm,
  type RuleForm,
} from '@/saas/lib/autoresponder/form';
import { scheduleSummary, whenSummary } from '@/saas/lib/autoresponder/summary';
import {
  AUTORESPONDER_NAME_MAX,
  INTERVAL_DAYS_MAX,
  INTERVAL_DAYS_MIN,
  type AutoresponderError,
  type AutoresponderItem,
} from '@/saas/lib/autoresponder/types';
import { validateAutoresponder } from '@/saas/lib/autoresponder/validate';
import type { MessageObject } from '@/saas/lib/messages/types';
import { editorToMessage } from '@/saas/lib/quick-replies/editor-state';
import { RuleFormFields } from './rule-form';

interface Draft {
  /** Set when editing an existing message. */
  id?: string;
  form: RuleForm;
}

/**
 * Settings → Welcome & away: the account's automatic greetings (list, on/off
 * switch) and the create/edit dialog. A message here is sent by itself when a
 * customer writes; multi-step or keyword rules belong to Automations.
 */
export function AutoresponderManager() {
  const t = useTranslations('SaasAutoresponder');
  const tIssues = useTranslations('SaasQuickReplies.issues');
  const tCarousel = useTranslations('SaasCarousel.issues');
  const tTypes = useTranslations('SaasQuickReplies.types');

  const [items, setItems] = useState<AutoresponderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<AutoresponderError[]>([]);
  const [showIssues, setShowIssues] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saas/autoresponders', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((data.autoresponders as AutoresponderItem[]) ?? []);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
        toast.error(data.error ?? t('loadError'));
      }
    } catch {
      setLoadFailed(true);
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDraft = (next: Draft) => {
    setErrors([]);
    setShowIssues(false);
    setDraft(next);
  };

  const openCreate = () => openDraft({ form: emptyRuleForm() });

  const openEdit = (item: AutoresponderItem) => {
    let form: RuleForm;
    try {
      form = itemToForm(item);
    } catch {
      // A stored message that no longer matches its type (hand-edited row).
      toast.error(t('loadError'));
      return;
    }
    openDraft({ id: item.id, form });
  };

  const setForm: Dispatch<SetStateAction<RuleForm>> = (update) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            form: typeof update === 'function' ? update(d.form) : update,
          }
        : d
    );

  const candidate = useMemo(
    () =>
      draft ? (editorToMessage(draft.form.editor) as MessageObject) : null,
    [draft]
  );

  const save = async () => {
    if (!draft) return;
    const checked = validateAutoresponder(formToCandidate(draft.form));
    if (!checked.ok) {
      setErrors(checked.errors);
      setShowIssues(true);
      toast.error(t('fixIssues'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        draft.id
          ? `/api/saas/autoresponders/${draft.id}`
          : '/api/saas/autoresponders',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: checked.value.name,
            message: checked.value.message,
            send_when: checked.value.send_when,
            interval_days: checked.value.interval_days,
            schedule: checked.value.schedule,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.errors)) {
          setErrors(data.errors as AutoresponderError[]);
          setShowIssues(true);
        }
        toast.error(data.error ?? t('saveError'));
        return;
      }
      toast.success(draft.id ? t('updated') : t('created'));
      setDraft(null);
      await load();
    } catch {
      toast.error(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: AutoresponderItem, next: boolean) => {
    // Optimistic; a failed call restores the real list.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i))
    );
    try {
      const res = await fetch(`/api/saas/autoresponders/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error(t('saveError'));
      await load();
    }
  };

  const remove = async (item: AutoresponderItem) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/saas/autoresponders/${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error(t('deleteError'));
      return;
    }
    await load();
  };

  const errorText = (e: AutoresponderError): string[] => {
    if (e.code === 'invalidMessage') {
      // The carousel editor shows its own problems inline.
      const issues = (e.issues ?? []).filter(
        (i) =>
          !(i.code === 'carousel' && draft?.form.editor.type === 'carousel')
      );
      return issues.length > 0
        ? issues.map((i) => issueText(i, tIssues, tCarousel))
        : [t('errors.invalidMessage')];
    }
    return [
      t(`errors.${e.code}`, {
        max:
          e.code === 'nameTooLong' ? AUTORESPONDER_NAME_MAX : INTERVAL_DAYS_MAX,
        min: INTERVAL_DAYS_MIN,
      }),
    ];
  };

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t('new')}
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      ) : loadFailed && items.length === 0 ? (
        // Not the "nothing yet" empty state: that would invite duplicates.
        <div className="border-border rounded-lg border border-dashed py-10 text-center">
          <p className="text-muted-foreground mb-3 text-sm">{t('loadError')}</p>
          <Button variant="outline" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const schedule = scheduleSummary(item.schedule, t);
              return (
                <li
                  key={item.id}
                  className="border-border bg-card flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-foreground truncate text-sm font-medium">
                        {item.name}
                      </p>
                      <Badge variant="outline">
                        {tTypes(item.message_type)}
                      </Badge>
                      {!item.is_active && (
                        <Badge variant="secondary">{t('inactive')}</Badge>
                      )}
                    </div>
                    <p className="text-foreground/80 mt-0.5 text-xs">
                      {whenSummary(item, t)}
                      {schedule ? ` · ${schedule}` : ''}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {item.preview}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={(c) =>
                        void toggleActive(item, c === true)
                      }
                      aria-label={t('toggleAria', { name: item.name })}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(item)}
                      aria-label={t('editAria', { name: item.name })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void remove(item)}
                      aria-label={t('deleteAria', { name: item.name })}
                      className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length > 1 && (
            <p className="text-muted-foreground mt-3 text-xs">
              {t('priorityNote')}
            </p>
          )}
        </>
      )}

      <Dialog
        open={!!draft}
        // Closing mid-save would let the save's completion close whatever
        // dialog is open next and lose its edits.
        onOpenChange={(o) => !o && !saving && setDraft(null)}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? t('dialogEdit') : t('dialogNew')}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid max-h-[70vh] gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 space-y-4">
                <RuleFormFields
                  form={draft.form}
                  onChange={setForm}
                  showIssues={showIssues}
                />
                {showIssues && errors.length > 0 && (
                  <ul
                    role="alert"
                    className="space-y-1 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
                  >
                    {errors.flatMap((e, n) =>
                      errorText(e).map((text, m) => (
                        <li key={`${e.code}-${n}-${m}`}>{text}</li>
                      ))
                    )}
                  </ul>
                )}
              </div>
              <div className="space-y-2 md:sticky md:top-0 md:self-start">
                <p className="text-muted-foreground text-xs font-medium">
                  {t('previewTitle')}
                </p>
                {candidate && <MessagePreview message={candidate} />}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
