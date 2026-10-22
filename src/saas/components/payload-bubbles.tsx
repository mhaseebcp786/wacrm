'use client';

import {
  Building2,
  ExternalLink,
  FileText,
  Globe,
  List as ListIcon,
  Mail,
  Phone,
  Play,
  Reply,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type {
  ContactCard,
  InteractiveBody,
  InteractiveHeader,
} from '@/saas/lib/messages/types';

// ============================================================
// Drawing of the structured messages the fork stores in
// `messages.interactive_payload`: a URL button / reply buttons with a media
// header (`rich_interactive`) and contact cards (`contact`). Used by the
// inbox bubble and by the suggested-reply preview, so what an agent designs
// is what the thread shows.
//
// Every piece reads defensively: a stored payload is JSON that nothing
// re-validates on read, and a thrown error here would blank the thread.
// ============================================================

const CARD =
  'w-full max-w-[280px] overflow-hidden rounded-lg bg-card text-foreground shadow-sm ring-1 ring-border';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Only web links are made clickable; anything else renders as plain text. */
export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** The Meta interactive body of a stored payload, or null if it is not one. */
export function asInteractiveBody(payload: unknown): InteractiveBody | null {
  if (!isRec(payload) || payload.type !== 'interactive') return null;
  const i = payload.interactive;
  if (!isRec(i) || !isRec(i.body) || typeof i.body.text !== 'string') {
    return null;
  }
  return i as unknown as InteractiveBody;
}

/** The contact cards of a stored payload, or null if it holds none. */
export function asContactCards(payload: unknown): ContactCard[] | null {
  if (!isRec(payload) || payload.type !== 'contacts') return null;
  if (!Array.isArray(payload.contacts) || payload.contacts.length === 0) {
    return null;
  }
  const cards = payload.contacts.filter(
    (c): c is ContactCard =>
      isRec(c) && isRec(c.name) && typeof c.name.formatted_name === 'string'
  );
  return cards.length > 0 ? cards : null;
}

function mediaLink(h: Exclude<InteractiveHeader, { type: 'text' }>): string {
  const media = (h as unknown as Rec)[h.type];
  return isRec(media) ? str(media.link) : '';
}

function fileName(link: string): string {
  try {
    const last = new URL(link).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : '';
  } catch {
    return '';
  }
}

function Header({ header }: { header: InteractiveHeader | undefined }) {
  const t = useTranslations('SaasQuickReplies.preview');
  if (!header || !isRec(header)) return null;
  if (header.type === 'text') {
    const text = str(header.text);
    return text ? (
      <p className="mb-1 text-sm font-semibold break-words">{text}</p>
    ) : null;
  }
  if (
    header.type !== 'image' &&
    header.type !== 'video' &&
    header.type !== 'document'
  ) {
    return null;
  }
  const link = mediaLink(header);
  if (
    header.type === 'image' &&
    safeHref(link)?.toLowerCase().startsWith('https:')
  ) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote, user-supplied URL; preview only
      <img
        src={link}
        alt=""
        className="-mx-3 -mt-2 mb-2 max-h-44 w-[calc(100%+1.5rem)] max-w-none object-cover"
      />
    );
  }
  return (
    <div className="bg-muted text-muted-foreground mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs">
      {header.type === 'document' ? (
        <FileText className="h-4 w-4 shrink-0" />
      ) : header.type === 'video' ? (
        <Play className="h-4 w-4 shrink-0" />
      ) : (
        <span>{t('noMedia')}</span>
      )}
      {header.type !== 'image' && (
        <span className="min-w-0 truncate">
          {fileName(link) || t(header.type === 'video' ? 'video' : 'document')}
        </span>
      )}
    </div>
  );
}

/**
 * URL button or reply buttons (with any header). Buttons are drawn as the
 * customer sees them; the URL one is a real link so an agent can check where
 * it goes.
 */
export function RichInteractiveCard({
  interactive,
  className,
}: {
  interactive: InteractiveBody;
  className?: string;
}) {
  const t = useTranslations('SaasQuickReplies.preview');
  const footer = isRec(interactive.footer) ? str(interactive.footer.text) : '';
  const buttonStyle =
    'text-primary border-border flex items-center justify-center gap-1.5 border-t py-2 text-sm font-medium';

  let action: React.ReactNode = null;
  if (interactive.type === 'cta_url') {
    const label =
      str(interactive.action?.parameters?.display_text) || t('button');
    const href = safeHref(str(interactive.action?.parameters?.url));
    action = href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonStyle, 'hover:bg-muted/60')}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {label}
      </a>
    ) : (
      <div className={buttonStyle}>
        <ExternalLink className="h-3.5 w-3.5" />
        {label}
      </div>
    );
  } else if (interactive.type === 'button') {
    const buttons = Array.isArray(interactive.action?.buttons)
      ? interactive.action.buttons
      : [];
    action = buttons.map((b, n) => (
      <div key={n} className={buttonStyle}>
        <Reply className="h-3.5 w-3.5" />
        {str(b?.reply?.title) || t('button')}
      </div>
    ));
  } else if (interactive.type === 'list') {
    action = (
      <div className={buttonStyle}>
        <ListIcon className="h-3.5 w-3.5" />
        {str(interactive.action?.button) || t('button')}
      </div>
    );
  }

  return (
    <div className={cn(CARD, className)}>
      <div className="px-3 pt-2 pb-2">
        <Header header={interactive.header} />
        <p className="text-sm break-words whitespace-pre-wrap">
          {interactive.body.text}
        </p>
        {footer && (
          <p className="text-muted-foreground mt-1 text-[11px] break-words">
            {footer}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** One card per contact: avatar initial, name, role/company and the ways to reach them. */
export function ContactCards({
  contacts,
  className,
}: {
  contacts: ContactCard[];
  className?: string;
}) {
  const t = useTranslations('SaasQuickReplies.preview');
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {contacts.map((c, n) => {
        const name = c.name.formatted_name;
        const role = [c.org?.title, c.org?.company].filter(Boolean).join(' · ');
        const urls = (c as unknown as { urls?: Array<{ url?: string }> }).urls;
        return (
          <div key={n} className={cn(CARD, 'px-3 py-2')}>
            <div className="flex items-start gap-2.5">
              <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                {name.trim().charAt(0).toUpperCase() || (
                  <User className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                <p className="text-sm font-medium break-words">
                  {name || t('contact')}
                </p>
                {role && (
                  <p className="text-muted-foreground flex items-center gap-1 break-words">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {role}
                  </p>
                )}
                {(c.phones ?? []).map((p, j) => (
                  <p key={`p${j}`} className="flex items-center gap-1">
                    <Phone className="text-muted-foreground h-3 w-3 shrink-0" />
                    <span className="break-all">{str(p?.phone)}</span>
                  </p>
                ))}
                {(c.emails ?? []).map((e, j) => (
                  <p key={`e${j}`} className="flex items-center gap-1">
                    <Mail className="text-muted-foreground h-3 w-3 shrink-0" />
                    <span className="break-all">{str(e?.email)}</span>
                  </p>
                ))}
                {(Array.isArray(urls) ? urls : []).map((u, j) => (
                  <p key={`u${j}`} className="flex items-center gap-1">
                    <Globe className="text-muted-foreground h-3 w-3 shrink-0" />
                    <span className="break-all">{str(u?.url)}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The inbox bubble for `content_type` `rich_interactive` and `contact`.
 * Falls back to the stored text when the payload is missing or malformed
 * (e.g. a message sent through the public API without one).
 */
export function SaasPayloadBubble({
  contentType,
  payload,
  fallbackText,
}: {
  contentType: string;
  payload: unknown;
  fallbackText?: string | null;
}) {
  // Same wording as the inbox's own fallback for a message it cannot draw.
  const tBubble = useTranslations('Inbox.bubble');
  if (contentType === 'contact') {
    const contacts = asContactCards(payload);
    if (contacts) return <ContactCards contacts={contacts} />;
  } else {
    const interactive = asInteractiveBody(payload);
    if (interactive) return <RichInteractiveCard interactive={interactive} />;
  }
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {fallbackText || tBubble('unsupported')}
    </p>
  );
}
