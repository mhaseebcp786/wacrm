'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import {
  blankContact,
  blankPhone,
  contactDraftFromCrm,
  EMAIL_TYPES,
  MAX_CONTACT_CARDS,
  newDraftId,
  PHONE_TYPES,
  phoneWaId,
  type ContactDraft,
} from '@/saas/lib/quick-replies/editor-state';

type Update = (change: (prev: ContactDraft[]) => ContactDraft[]) => void;
type Change =
  Partial<ContactDraft> | ((c: ContactDraft) => Partial<ContactDraft>);

interface ContactEditorProps {
  contacts: ContactDraft[];
  /** Functional, like a state setter, so rapid edits never overwrite each other. */
  onUpdate: Update;
}

const SELECT =
  'border-border bg-muted text-foreground h-9 rounded-md border px-2 text-sm';

/** Edit the contact cards a reply sends (name, numbers, emails, links, company, birthday). */
export function ContactEditor({ contacts, onUpdate }: ContactEditorProps) {
  const t = useTranslations('SaasQuickReplies.contact');
  const [pickerOpen, setPickerOpen] = useState(false);
  const full = contacts.length >= MAX_CONTACT_CARDS;

  // Cards are addressed by their stable id, not their position, so a removal
  // never hands one card's field state to its neighbour.
  const patch = (uid: string, change: Change) =>
    onUpdate((prev) =>
      prev.map((c) =>
        c.uid === uid
          ? { ...c, ...(typeof change === 'function' ? change(c) : change) }
          : c
      )
    );

  return (
    <div className="space-y-4">
      {contacts.map((contact, index) => (
        <ContactCardForm
          key={contact.uid}
          index={index}
          contact={contact}
          removable={contacts.length > 1}
          onPatch={(change) => patch(contact.uid, change)}
          onRemove={() =>
            onUpdate((prev) => prev.filter((c) => c.uid !== contact.uid))
          }
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => onUpdate((prev) => [...prev, blankContact()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('addCard')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => setPickerOpen(true)}
        >
          <UserPlus className="mr-1 h-3.5 w-3.5" />
          {t('fromContacts')}
        </Button>
        {full && (
          <span className="text-muted-foreground text-xs">
            {t('maxCards', { max: MAX_CONTACT_CARDS })}
          </span>
        )}
      </div>

      <CrmContactPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(draft) => {
          // Replace a single untouched blank card instead of leaving it behind.
          onUpdate((prev) => {
            const onlyBlank =
              prev.length === 1 &&
              !prev[0].formattedName.trim() &&
              !prev[0].firstName.trim() &&
              !prev[0].phones.some((p) => p.phone.trim());
            return onlyBlank ? [draft] : [...prev, draft];
          });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function ContactCardForm({
  index,
  contact,
  removable,
  onPatch,
  onRemove,
}: {
  index: number;
  contact: ContactDraft;
  removable: boolean;
  onPatch: (change: Change) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('SaasQuickReplies.contact');
  const derived = `${contact.firstName} ${contact.lastName}`.trim();

  // Row edits read the LATEST card (functional), never the render-time copy.
  const setPhone = (uid: string, change: Partial<ContactDraft['phones'][0]>) =>
    onPatch((c) => ({
      phones: c.phones.map((p) => (p.uid === uid ? { ...p, ...change } : p)),
    }));
  const setEmail = (uid: string, change: Partial<ContactDraft['emails'][0]>) =>
    onPatch((c) => ({
      emails: c.emails.map((e) => (e.uid === uid ? { ...e, ...change } : e)),
    }));
  const setUrl = (uid: string, change: Partial<ContactDraft['urls'][0]>) =>
    onPatch((c) => ({
      urls: c.urls.map((u) => (u.uid === uid ? { ...u, ...change } : u)),
    }));

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-foreground text-sm font-medium">
          {t('cardTitle', { n: index + 1 })}
        </p>
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={t('removeCard')}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Labelled label={t('formattedName')}>
        <Input
          value={contact.formattedName}
          placeholder={derived}
          onChange={(e) => onPatch({ formattedName: e.target.value })}
          className="bg-muted text-foreground"
        />
      </Labelled>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label={t('firstName')}>
          <Input
            value={contact.firstName}
            onChange={(e) => onPatch({ firstName: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Labelled>
        <Labelled label={t('lastName')}>
          <Input
            value={contact.lastName}
            onChange={(e) => onPatch({ lastName: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Labelled>
        <Labelled label={t('company')}>
          <Input
            value={contact.company}
            onChange={(e) => onPatch({ company: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Labelled>
        <Labelled label={t('department')}>
          <Input
            value={contact.department}
            onChange={(e) => onPatch({ department: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Labelled>
        <Labelled label={t('title')}>
          <Input
            value={contact.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Labelled>
        <Labelled label={t('birthday')}>
          <Input
            type="date"
            value={contact.birthday}
            onChange={(e) => onPatch({ birthday: e.target.value })}
            className="bg-muted text-foreground"
          />
        </Labelled>
      </div>

      <Rows
        heading={t('phones')}
        hint={t('contactHint')}
        addLabel={t('addPhone')}
        removeLabel={t('removeRow')}
        onAdd={() => onPatch((c) => ({ phones: [...c.phones, blankPhone()] }))}
        rows={contact.phones.map((p) => ({
          key: p.uid,
          onRemove: () =>
            onPatch((c) => ({
              phones: c.phones.filter((x) => x.uid !== p.uid),
            })),
          content: (
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="tel"
                  value={p.phone}
                  placeholder="+15551234567"
                  onChange={(e) => setPhone(p.uid, { phone: e.target.value })}
                  className="bg-muted text-foreground min-w-40 flex-1"
                />
                <TypeSelect
                  value={p.type}
                  options={PHONE_TYPES}
                  label={t('phoneType')}
                  noneLabel={t('typeNone')}
                  optionLabel={(type) => t(`phoneTypes.${type}`)}
                  onChange={(type) => setPhone(p.uid, { type })}
                />
                <label
                  className="text-muted-foreground flex items-center gap-1.5 text-xs"
                  title={t('onWhatsAppHint')}
                >
                  <input
                    type="checkbox"
                    checked={p.onWhatsApp}
                    onChange={(e) =>
                      setPhone(p.uid, { onWhatsApp: e.target.checked })
                    }
                  />
                  {t('onWhatsApp')}
                </label>
              </div>
              {p.onWhatsApp && p.phone.trim() && !phoneWaId(p) && (
                <p className="text-[11px] text-amber-500">
                  {t('waNeedsCountryCode')}
                </p>
              )}
            </div>
          ),
        }))}
      />

      <Rows
        heading={t('emails')}
        addLabel={t('addEmail')}
        removeLabel={t('removeRow')}
        onAdd={() =>
          onPatch((c) => ({
            emails: [
              ...c.emails,
              { uid: newDraftId(), email: '', type: 'WORK' },
            ],
          }))
        }
        rows={contact.emails.map((e) => ({
          key: e.uid,
          onRemove: () =>
            onPatch((c) => ({
              emails: c.emails.filter((x) => x.uid !== e.uid),
            })),
          content: (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                type="email"
                value={e.email}
                onChange={(ev) => setEmail(e.uid, { email: ev.target.value })}
                className="bg-muted text-foreground min-w-40 flex-1"
              />
              <TypeSelect
                value={e.type}
                options={EMAIL_TYPES}
                label={t('emailType')}
                noneLabel={t('typeNone')}
                optionLabel={(type) => t(`emailTypes.${type}`)}
                onChange={(type) => setEmail(e.uid, { type })}
              />
            </div>
          ),
        }))}
      />

      <Rows
        heading={t('urls')}
        addLabel={t('addUrl')}
        removeLabel={t('removeRow')}
        onAdd={() =>
          onPatch((c) => ({
            urls: [...c.urls, { uid: newDraftId(), url: '', type: '' }],
          }))
        }
        rows={contact.urls.map((u) => ({
          key: u.uid,
          onRemove: () =>
            onPatch((c) => ({ urls: c.urls.filter((x) => x.uid !== u.uid) })),
          content: (
            <Input
              type="url"
              value={u.url}
              placeholder="https://example.com"
              onChange={(ev) => setUrl(u.uid, { url: ev.target.value })}
              className="bg-muted text-foreground flex-1"
            />
          ),
        }))}
      />
    </div>
  );
}

/**
 * A type dropdown that also offers a stored value outside the list (Meta
 * allows more labels than we offer, e.g. IPHONE), so loading such a card
 * shows its real label instead of silently looking like "No label".
 */
function TypeSelect({
  value,
  options,
  label,
  noneLabel,
  optionLabel,
  onChange,
}: {
  value: string;
  options: readonly string[];
  label: string;
  noneLabel: string;
  optionLabel: (type: string) => string;
  onChange: (type: string) => void;
}) {
  const extra = value && !options.includes(value);
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT}
    >
      <option value="">{noneLabel}</option>
      {options.map((type) => (
        <option key={type} value={type}>
          {optionLabel(type)}
        </option>
      ))}
      {extra && <option value={value}>{value}</option>}
    </select>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Rows({
  heading,
  hint,
  addLabel,
  removeLabel,
  onAdd,
  rows,
}: {
  heading: string;
  hint?: string;
  addLabel: string;
  removeLabel: string;
  onAdd: () => void;
  rows: Array<{ key: string; content: React.ReactNode; onRemove: () => void }>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground text-xs">{heading}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2">
          {row.content}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={row.onRemove}
            aria-label={removeLabel}
            className="text-muted-foreground shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}

// ---- "From Contacts" ---------------------------------------------------

interface CrmContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}

/**
 * Same character allow-list the public contacts API uses before putting a
 * term into a PostgREST `or()` filter: anything else could break the filter
 * grammar (commas, parentheses).
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim();
}

/**
 * The `or()` filter for a search term. A number is stored without spaces or
 * punctuation, so a term typed the way people write numbers ("+92 300 1234")
 * is also tried as its bare digits.
 */
function searchFilter(term: string): string {
  const parts = [
    `name.ilike.*${term}*`,
    `phone.ilike.*${term}*`,
    `email.ilike.*${term}*`,
  ];
  const digits = term.replace(/\D/g, '');
  if (digits.length >= 3 && digits !== term) {
    parts.push(`phone.ilike.*${digits}*`);
  }
  return parts.join(',');
}

function CrmContactPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (draft: ContactDraft) => void;
}) {
  const t = useTranslations('SaasQuickReplies.contactPicker');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CrmContactRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Debounce typing; the first load (empty query) fires at once.
    const timer = setTimeout(
      () => {
        setLoading(true);
        void (async () => {
          try {
            const term = sanitizeSearch(query);
            // RLS scopes the read to the caller's account.
            let q = createClient()
              .from('contacts')
              .select('id, name, phone, email, company')
              .order('created_at', { ascending: false })
              .limit(20);
            if (term) q = q.or(searchFilter(term));
            const { data, error } = await q;
            if (cancelled) return;
            if (error) throw error;
            setRows((data ?? []) as CrmContactRow[]);
          } catch {
            if (!cancelled) {
              setRows([]);
              toast.error(t('loadError'));
            }
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();
      },
      query ? 250 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, t]);

  // A contact with neither a number nor an email cannot make a valid card.
  const usable = rows.filter(
    (r) => (r.phone ?? '').trim() || (r.email ?? '').trim()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="bg-muted text-foreground pl-9"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : usable.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t('empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {usable.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPick(contactDraftFromCrm(r))}
                    className="border-border bg-muted/40 hover:border-primary/50 hover:bg-muted flex w-full flex-col rounded-md border p-2.5 text-left"
                  >
                    <span className="text-foreground truncate text-sm font-medium">
                      {r.name || r.phone || r.email}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {[r.phone, r.email].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
