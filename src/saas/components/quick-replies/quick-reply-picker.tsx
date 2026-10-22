'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

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
import type { QuickReply } from '@/types';
import { messageToLegacyInteractive } from '@/saas/lib/quick-replies/legacy';
import type { QuickReplyItem } from '@/saas/lib/quick-replies/types';
import { MessagePreview } from './message-preview';

interface SaasQuickReplyPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Text and reply-button/list replies keep the composer's existing flow:
   * text fills the box, buttons/list open the builder pre-filled so the
   * agent can tweak them. Called with the contact's tokens already filled.
   */
  onPick: (qr: QuickReply) => void;
  conversationId: string;
  /** Message being quoted, forwarded to the send. */
  replyToId?: string;
  /** Called after a reply was sent straight from the picker. */
  onSent?: () => void;
}

/**
 * Inbox picker for suggested replies. Everything that cannot be edited in
 * the composer (media, carousel, link button, location, contact) is shown
 * as a preview with a Send button instead.
 */
export function SaasQuickReplyPicker({
  open,
  onOpenChange,
  onPick,
  conversationId,
  replyToId,
  onSent,
}: SaasQuickReplyPickerProps) {
  const t = useTranslations('SaasQuickReplies');
  const [items, setItems] = useState<QuickReplyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<QuickReplyItem | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPending(null);
    setQuery('');
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/saas/quick-replies?active_only=1&conversation_id=${encodeURIComponent(conversationId)}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          // The server resolves the contact's tokens for this conversation;
          // an item without that copy is never offered, so the raw stored
          // form (tokens intact) can't reach the composer or the customer.
          const all = (data.quick_replies as QuickReplyItem[]) ?? [];
          setItems(all.filter((i) => i.resolved));
        } else {
          setItems([]);
          toast.error(data.error ?? t('loadError'));
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          toast.error(t('loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, t]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q)
    );
  }, [items, query]);

  const choose = (item: QuickReplyItem) => {
    const message = item.resolved;
    if (!message) return;
    try {
      if (message.message_type === 'text') {
        onPick(
          asQuickReply(item, {
            kind: 'text',
            content_text: message.payload.text.body,
          })
        );
        return;
      }
      const legacy = messageToLegacyInteractive(message);
      if (legacy) {
        onPick(
          asQuickReply(item, {
            kind: 'interactive',
            interactive_payload: legacy,
          })
        );
        return;
      }
      setPending(item);
    } catch {
      // A stored payload that no longer matches its type (hand-edited row).
      toast.error(t('picker.sendFailed', { reason: t('issues.malformed') }));
    }
  };

  const send = async () => {
    if (!pending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/saas/quick-replies/${pending.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          reply_to_message_id: replyToId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          t('picker.sendFailed', { reason: data.error ?? `HTTP ${res.status}` })
        );
        return;
      }
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      toast.error(
        t('picker.sendFailed', {
          reason: err instanceof Error ? err.message : t('picker.networkError'),
        })
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pending ? pending.name : t('picker.title')}
          </DialogTitle>
        </DialogHeader>

        {pending ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {t('picker.confirmHint')}
            </p>
            <div className="bg-muted/40 flex justify-center rounded-md p-3">
              <MessagePreview message={pending.resolved!} />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPending(null)}
                disabled={sending}
              >
                {t('picker.back')}
              </Button>
              <Button onClick={() => void send()} disabled={sending}>
                {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {t('picker.send')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="bg-muted text-foreground pl-9"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {t('picker.empty')}
                </p>
              ) : visible.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {t('noMatches')}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {visible.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => choose(item)}
                        className="border-border bg-muted/40 hover:border-primary/50 hover:bg-muted flex w-full items-start gap-2 rounded-md border p-2.5 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-foreground block truncate text-sm font-medium">
                              {item.name}
                            </span>
                            <Badge variant="outline" className="shrink-0">
                              {t(`types.${item.message_type}`)}
                            </Badge>
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {item.preview}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The composer's pick handler is typed for upstream rows and reads only
 * `kind`, `content_text` and `interactive_payload`; the other fields are
 * filled with the item's own values where it has them.
 */
function asQuickReply(
  item: QuickReplyItem,
  content: Pick<QuickReply, 'kind' | 'content_text' | 'interactive_payload'>
): QuickReply {
  return {
    id: item.id,
    account_id: '',
    user_id: '',
    title: item.name,
    created_at: item.created_at,
    updated_at: item.updated_at,
    ...content,
  };
}
