'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { MessageObject } from '@/saas/lib/messages/types';
import {
  editorToMessage,
  emptyEditorState,
  messageToEditor,
  type EditorState,
} from '@/saas/lib/quick-replies/editor-state';
import {
  QUICK_REPLY_NAME_MAX,
  type QuickReplyIssue,
  type QuickReplyItem,
} from '@/saas/lib/quick-replies/types';
import { validateQuickReplyMessage } from '@/saas/lib/quick-replies/validate';
import { issueText } from './issue-text';
import { MessagePreview } from './message-preview';
import { QuickReplyEditor } from './quick-reply-editor';

interface Draft {
  /** Set when editing an existing reply (either table). */
  id?: string;
  legacy: boolean;
  name: string;
}

/**
 * Settings → Quick replies: the list (search, type, created, on/off) and the
 * create/edit dialog for all message types. Replaces upstream's text +
 * buttons/list manager; rows created there still appear and move to the new
 * table the first time they are saved here.
 */
export function QuickRepliesManager() {
  const t = useTranslations('SaasQuickReplies');
  // The app's locale, not the browser's.
  const format = useFormatter();
  const tIssues = useTranslations('SaasQuickReplies.issues');
  const tCarousel = useTranslations('SaasCarousel.issues');

  const [items, setItems] = useState<QuickReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editor, setEditor] = useState<EditorState>(() => emptyEditorState());
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<QuickReplyIssue[]>([]);
  const [showIssues, setShowIssues] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saas/quick-replies', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems((data.quick_replies as QuickReplyItem[]) ?? []);
      else toast.error(data.error ?? t('loadError'));
    } catch {
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.preview.toLowerCase().includes(q) ||
        t(`types.${i.message_type}`).toLowerCase().includes(q)
    );
  }, [items, query, t]);

  const openDraft = (next: Draft, state: EditorState) => {
    setIssues([]);
    setShowIssues(false);
    setEditor(state);
    setDraft(next);
  };

  const openCreate = () =>
    openDraft({ legacy: false, name: '' }, emptyEditorState());

  const openEdit = (item: QuickReplyItem) => {
    let state: EditorState;
    try {
      state = messageToEditor(item.message);
    } catch {
      // A stored payload that no longer matches its type (hand-edited row).
      toast.error(t('issues.malformed'));
      return;
    }
    openDraft(
      { id: item.id, legacy: item.source === 'legacy', name: item.name },
      state
    );
  };

  const candidate = useMemo(
    () => editorToMessage(editor) as MessageObject,
    [editor]
  );

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error(t('nameRequired'));
      return;
    }
    const checked = validateQuickReplyMessage(editorToMessage(editor));
    if (!checked.ok) {
      setIssues(checked.issues);
      setShowIssues(true);
      toast.error(t('fixIssues'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        draft.id
          ? `/api/saas/quick-replies/${draft.id}`
          : '/api/saas/quick-replies',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, message: checked.message }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.issues)) {
          setIssues(data.issues as QuickReplyIssue[]);
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

  const toggleActive = async (item: QuickReplyItem, next: boolean) => {
    // Optimistic; a failed call restores the real list.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_active: next } : i))
    );
    try {
      const res = await fetch(`/api/saas/quick-replies/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new Error();
      // An upstream row moves tables on its first edit, which changes its id.
      if (item.source === 'legacy') await load();
    } catch {
      toast.error(t('saveError'));
      await load();
    }
  };

  const remove = async (item: QuickReplyItem) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/saas/quick-replies/${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error(t('deleteError'));
      return;
    }
    await load();
  };

  const shownIssues = issues.filter(
    (i) => !(i.code === 'carousel' && editor.type === 'carousel')
  );

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

      <div className="relative mb-3">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="bg-muted text-foreground pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t('empty')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {t('noMatches')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
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
                    {t(`types.${item.message_type}`)}
                  </Badge>
                  {!item.is_active && (
                    <Badge variant="secondary">{t('inactive')}</Badge>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {item.preview}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {format.dateTime(new Date(item.created_at), {
                    dateStyle: 'medium',
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={item.is_active}
                  onCheckedChange={(c) => void toggleActive(item, c === true)}
                  aria-label={t('activeLabel')}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(item)}
                  aria-label={t('edit')}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void remove(item)}
                  aria-label={t('delete')}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t('edit') : t('new')}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid max-h-[70vh] gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-muted-foreground block text-xs">
                    {t('nameLabel')}
                  </label>
                  <Input
                    value={draft.name}
                    maxLength={QUICK_REPLY_NAME_MAX}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    placeholder={t('namePlaceholder')}
                    className="bg-muted text-foreground"
                  />
                </div>
                {draft.legacy && (
                  <p className="text-muted-foreground text-xs">
                    {t('legacyNotice')}
                  </p>
                )}
                <QuickReplyEditor
                  value={editor}
                  onChange={setEditor}
                  showIssues={showIssues}
                />
                {showIssues && shownIssues.length > 0 && (
                  <ul
                    role="alert"
                    className="space-y-1 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
                  >
                    {shownIssues.map((issue, n) => (
                      <li key={`${issue.path}-${n}`}>
                        {issueText(issue, tIssues, tCarousel)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2 md:sticky md:top-0 md:self-start">
                <p className="text-muted-foreground text-xs font-medium">
                  {t('preview.title')}
                </p>
                <MessagePreview message={candidate} />
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
