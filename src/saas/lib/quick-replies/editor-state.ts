// ============================================================
// Editor state ⇄ message object (client-safe, pure).
//
// The editor keeps one sub-state per message type so switching the type
// tab never discards what was typed; `editorToMessage` reads only the
// active one. The result is an unvalidated candidate — the caller runs
// `validateQuickReplyMessage` on it.
//
// Loading a stored message and saving it again must not lose data the
// editor has no input for (a contact's addresses, name parts such as a
// prefix): those ride along untouched in `keep`.
// ============================================================

import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import {
  carouselFromMeta,
  carouselToMeta,
} from '@/saas/lib/messages/carousel-adapter';
import type {
  ContactCard,
  InteractiveHeader,
  MessageObject,
} from '@/saas/lib/messages/types';
import {
  blankCarouselPayload,
  newCarouselCardId,
  stripCarouselCardIds,
  type CarouselInteractivePayload,
} from '@/saas/lib/whatsapp/carousel-interactive';
import {
  legacyInteractiveToMessage,
  messageToLegacyInteractive,
} from './legacy';

export const EDITOR_TYPES = [
  'text',
  'interactive',
  'image',
  'video',
  'audio',
  'document',
  'carousel',
  'location',
  'contact',
] as const;
export type EditorType = (typeof EDITOR_TYPES)[number];

export type InteractiveKind = 'reply' | 'cta';

/** What kind of header an interactive message carries. */
export type HeaderKind = 'none' | 'text' | 'image' | 'video' | 'document';
export type MediaHeaderKind = Exclude<HeaderKind, 'none' | 'text'>;

export interface MediaFields {
  link: string;
  caption: string;
  filename: string;
}

let uidCounter = 0;
/** Client-only stable id for a card/row (React keys; never stored or sent). */
export const newDraftId = (): string => `d${++uidCounter}`;

export interface PhoneDraft {
  uid: string;
  phone: string;
  type: string;
  /**
   * The number is on WhatsApp: the recipient gets Message / Save contact
   * buttons (Meta shows only "Invite to WhatsApp" without a `wa_id`).
   */
  onWhatsApp: boolean;
  /**
   * The `wa_id` the stored message carried, and the number text it belonged
   * to. While the number is not edited the stored id is written back as it
   * was; re-deriving it from the digits would turn `0300…` into a wrong id
   * for a card whose stored id has the country code.
   */
  waId: string;
  loadedPhone: string;
}
export interface EmailDraft {
  uid: string;
  email: string;
  type: string;
}
export interface UrlDraft {
  uid: string;
  url: string;
  type: string;
}

export interface ContactDraft {
  uid: string;
  formattedName: string;
  firstName: string;
  lastName: string;
  company: string;
  department: string;
  title: string;
  /** `YYYY-MM-DD` or empty. */
  birthday: string;
  phones: PhoneDraft[];
  emails: EmailDraft[];
  urls: UrlDraft[];
  /** Card fields with no editor input, written back as they were. */
  keep: Record<string, unknown>;
  /** Name parts with no editor input (middle name, prefix, suffix). */
  keepName: Record<string, unknown>;
}

export interface EditorState {
  type: EditorType;
  text: { body: string };
  interactiveKind: InteractiveKind;
  /** Reply buttons / list, in the shape the shared interactive builder edits. */
  reply: InteractiveMessagePayload;
  /**
   * Image/video/document header for reply buttons. The shared builder only
   * edits a text header; a media header here replaces it. Lists take a text
   * header only (Meta).
   */
  replyMedia: { kind: 'none' | MediaHeaderKind; link: string };
  cta: {
    headerKind: HeaderKind;
    headerText: string;
    headerLink: string;
    body: string;
    footer: string;
    displayText: string;
    url: string;
  };
  image: MediaFields;
  video: MediaFields;
  audio: MediaFields;
  document: MediaFields;
  carousel: CarouselInteractivePayload;
  location: {
    latitude: string;
    longitude: string;
    name: string;
    address: string;
  };
  contacts: ContactDraft[];
}

const emptyMedia = (): MediaFields => ({ link: '', caption: '', filename: '' });

function blankReply(): InteractiveMessagePayload {
  return {
    kind: 'buttons',
    body: '',
    buttons: [{ id: 'btn_1', title: '' }],
  };
}

/** Phone/email types Meta documents for a contact card. */
export const PHONE_TYPES = ['CELL', 'WORK', 'HOME', 'MAIN'] as const;
export const EMAIL_TYPES = ['WORK', 'HOME'] as const;

/** Most contact cards one reply offers in the editor (Meta allows more but advises fewer). */
export const MAX_CONTACT_CARDS = 10;

export function blankPhone(): PhoneDraft {
  return {
    uid: newDraftId(),
    phone: '',
    type: 'CELL',
    onWhatsApp: true,
    waId: '',
    loadedPhone: '',
  };
}

export function blankContact(): ContactDraft {
  return {
    uid: newDraftId(),
    formattedName: '',
    firstName: '',
    lastName: '',
    company: '',
    department: '',
    title: '',
    birthday: '',
    phones: [blankPhone()],
    emails: [],
    urls: [],
    keep: {},
    keepName: {},
  };
}

const digits = (s: string): string => s.replace(/\D/g, '');

/**
 * A card for a CRM contact ("From Contacts"): name, number (marked as on
 * WhatsApp, since the CRM only holds WhatsApp contacts), email and company.
 */
export function contactDraftFromCrm(c: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
}): ContactDraft {
  const draft = blankContact();
  const phone = (c.phone ?? '').trim();
  const name = (c.name ?? '').trim();
  draft.formattedName = name || phone;
  draft.company = (c.company ?? '').trim();
  // A CRM number is one the CRM sends WhatsApp messages to, so it already
  // carries a country code: its digits are the WhatsApp ID.
  draft.phones = phone
    ? [
        {
          ...blankPhone(),
          phone,
          onWhatsApp: digits(phone).length >= 7,
          waId: digits(phone),
          loadedPhone: phone,
        },
      ]
    : [];
  const email = (c.email ?? '').trim();
  draft.emails = email ? [{ uid: newDraftId(), email, type: 'WORK' }] : [];
  return draft;
}

export function emptyEditorState(type: EditorType = 'text'): EditorState {
  return {
    type,
    text: { body: '' },
    interactiveKind: 'reply',
    reply: blankReply(),
    replyMedia: { kind: 'none', link: '' },
    cta: {
      headerKind: 'none',
      headerText: '',
      headerLink: '',
      body: '',
      footer: '',
      displayText: '',
      url: '',
    },
    image: emptyMedia(),
    video: emptyMedia(),
    audio: emptyMedia(),
    document: emptyMedia(),
    carousel: blankCarouselPayload(),
    location: { latitude: '', longitude: '', name: '', address: '' },
    contacts: [blankContact()],
  };
}

const opt = (s: string): string | undefined => {
  const v = s.trim();
  return v === '' ? undefined : v;
};

/**
 * Number from a text field; undefined (→ "required") when blank, NaN when
 * junk. A decimal comma ("12,97") is accepted, as typed in es/pt locales.
 */
function coordinate(s: string): number | undefined {
  const v = s.trim().replace(',', '.');
  if (v === '') return undefined;
  // `Number()` alone would accept "0x10" or "1e3"; only plain decimals are
  // coordinates.
  return /^[+-]?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
}

function mediaPayload(
  type: 'image' | 'video' | 'document',
  m: MediaFields
): Record<string, unknown> {
  return {
    type,
    [type]: {
      link: m.link.trim(),
      ...(opt(m.caption) ? { caption: opt(m.caption) } : {}),
      ...(type === 'document' && opt(m.filename)
        ? { filename: opt(m.filename) }
        : {}),
    },
  };
}

function mediaHeader(kind: MediaHeaderKind, link: string): InteractiveHeader {
  const media = { link: link.trim() };
  return kind === 'image'
    ? { type: 'image', image: media }
    : kind === 'video'
      ? { type: 'video', video: media }
      : { type: 'document', document: media };
}

/**
 * The `wa_id` a phone row will be saved with, or undefined (the recipient
 * then sees "Invite to WhatsApp" instead of Message / Save contact).
 *  - an untouched stored number keeps the stored id;
 *  - a typed number needs an international prefix ("+"): Meta's ID is the
 *    number WITH its country code, and a local "0300…" would be a wrong ID.
 */
export function phoneWaId(p: PhoneDraft): string | undefined {
  if (!p.onWhatsApp) return undefined;
  const text = p.phone.trim();
  if (p.waId && text === p.loadedPhone) return p.waId;
  const d = digits(text);
  return text.startsWith('+') && d.length >= 7 ? d : undefined;
}

function contactToCard(d: ContactDraft): Record<string, unknown> {
  const derived = `${d.firstName.trim()} ${d.lastName.trim()}`.trim();
  // Blank rows are ignored rather than reported: an empty extra row the
  // user added and never filled should not block saving.
  const phones = d.phones
    .filter((p) => p.phone.trim() !== '')
    .map((p) => ({
      phone: p.phone.trim(),
      ...(p.type ? { type: p.type } : {}),
      ...(phoneWaId(p) ? { wa_id: phoneWaId(p) } : {}),
    }));
  const emails = d.emails
    .filter((e) => e.email.trim() !== '')
    .map((e) => ({
      email: e.email.trim(),
      ...(e.type ? { type: e.type } : {}),
    }));
  const urls = d.urls
    .filter((u) => u.url.trim() !== '')
    .map((u) => ({ url: u.url.trim(), ...(u.type ? { type: u.type } : {}) }));
  const org = {
    ...(opt(d.company) ? { company: opt(d.company) } : {}),
    ...(opt(d.department) ? { department: opt(d.department) } : {}),
    ...(opt(d.title) ? { title: opt(d.title) } : {}),
  };
  return {
    ...d.keep,
    name: {
      ...d.keepName,
      // Meta requires a display name; build it from the parts when blank.
      formatted_name: d.formattedName.trim() || derived,
      ...(opt(d.firstName) ? { first_name: opt(d.firstName) } : {}),
      ...(opt(d.lastName) ? { last_name: opt(d.lastName) } : {}),
    },
    ...(phones.length ? { phones } : {}),
    ...(emails.length ? { emails } : {}),
    ...(urls.length ? { urls } : {}),
    ...(Object.keys(org).length ? { org } : {}),
    ...(opt(d.birthday) ? { birthday: opt(d.birthday) } : {}),
  };
}

function cardToContact(card: ContactCard): ContactDraft {
  const draft = blankContact();
  const { name, phones, emails, org, ...rest } = card;
  const { urls, birthday, ...keep } = rest as {
    urls?: Array<{ url: string; type?: string }>;
    birthday?: unknown;
    [extra: string]: unknown;
  };
  const { formatted_name, first_name, last_name, ...keepName } = name;
  // A display name that is just "First Last" is left blank (shown as the
  // placeholder) so it keeps following the name parts when they are edited.
  draft.formattedName =
    formatted_name === `${first_name ?? ''} ${last_name ?? ''}`.trim()
      ? ''
      : formatted_name;
  draft.firstName = first_name ?? '';
  draft.lastName = last_name ?? '';
  draft.keepName = keepName;
  draft.company = org?.company ?? '';
  draft.department = org?.department ?? '';
  draft.title = org?.title ?? '';
  draft.birthday = typeof birthday === 'string' ? birthday : '';
  draft.phones = (phones ?? []).map((p) => ({
    uid: newDraftId(),
    phone: p.phone,
    type: p.type ?? '',
    onWhatsApp: Boolean(p.wa_id),
    waId: p.wa_id ?? '',
    loadedPhone: p.phone.trim(),
  }));
  draft.emails = (emails ?? []).map((e) => ({
    uid: newDraftId(),
    email: e.email,
    type: e.type ?? '',
  }));
  draft.urls = (urls ?? []).map((u) => ({
    uid: newDraftId(),
    url: u.url,
    type: u.type ?? '',
  }));
  draft.keep = keep;
  return draft;
}

/** The active sub-state as a message-object candidate (not yet validated). */
export function editorToMessage(state: EditorState): unknown {
  switch (state.type) {
    case 'text':
      return {
        message_type: 'text',
        payload: { type: 'text', text: { body: state.text.body } },
      };
    case 'interactive': {
      if (state.interactiveKind === 'reply') {
        const message = legacyInteractiveToMessage(state.reply);
        const media = state.replyMedia;
        if (
          media.kind !== 'none' &&
          state.reply.kind === 'buttons' &&
          message.message_type === 'interactive'
        ) {
          message.payload.interactive.header = mediaHeader(
            media.kind,
            media.link
          );
        }
        return message;
      }
      const c = state.cta;
      const header: InteractiveHeader | undefined =
        c.headerKind === 'text'
          ? opt(c.headerText)
            ? { type: 'text', text: c.headerText }
            : undefined
          : c.headerKind === 'none'
            ? undefined
            : mediaHeader(c.headerKind, c.headerLink);
      return {
        message_type: 'interactive',
        payload: {
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            ...(header ? { header } : {}),
            body: { text: c.body },
            ...(opt(c.footer) ? { footer: { text: c.footer } } : {}),
            action: {
              name: 'cta_url',
              parameters: { display_text: c.displayText, url: c.url.trim() },
            },
          },
        },
      };
    }
    case 'image':
    case 'video':
    case 'document':
      return {
        message_type: state.type,
        payload: mediaPayload(state.type, state[state.type]),
      };
    case 'audio':
      return {
        message_type: 'audio',
        payload: { type: 'audio', audio: { link: state.audio.link.trim() } },
      };
    case 'carousel':
      return {
        message_type: 'carousel',
        payload: carouselToMeta(stripCarouselCardIds(state.carousel)),
      };
    case 'location': {
      const l = state.location;
      return {
        message_type: 'location',
        payload: {
          type: 'location',
          location: {
            latitude: coordinate(l.latitude),
            longitude: coordinate(l.longitude),
            ...(opt(l.name) ? { name: opt(l.name) } : {}),
            ...(opt(l.address) ? { address: opt(l.address) } : {}),
          },
        },
      };
    }
    case 'contact':
      return {
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: state.contacts.map(contactToCard),
        },
      };
  }
}

function mediaFrom(raw: {
  link: string;
  caption?: string;
  filename?: string;
}): MediaFields {
  return {
    link: raw.link,
    caption: raw.caption ?? '',
    filename: raw.filename ?? '',
  };
}

function headerLink(h: InteractiveHeader | undefined): string {
  if (!h || h.type === 'text') return '';
  return h.type === 'image'
    ? h.image.link
    : h.type === 'video'
      ? h.video.link
      : h.document.link;
}

/** A stored message loaded into the editor. */
export function messageToEditor(message: MessageObject): EditorState {
  const state = emptyEditorState(message.message_type);
  switch (message.message_type) {
    case 'text': {
      state.text = { body: message.payload.text.body };
      break;
    }
    case 'interactive': {
      const i = message.payload.interactive;
      if (i.type === 'cta_url') {
        state.interactiveKind = 'cta';
        const h = i.header;
        state.cta = {
          headerKind: h ? h.type : 'none',
          headerText: h?.type === 'text' ? h.text : '',
          headerLink: headerLink(h),
          body: i.body.text,
          footer: i.footer?.text ?? '',
          displayText: i.action.parameters.display_text,
          url: i.action.parameters.url,
        };
      } else if (i.type === 'button' || i.type === 'list') {
        const mediaKind =
          i.type === 'button' && i.header && i.header.type !== 'text'
            ? i.header.type
            : null;
        let loadable: MessageObject = message;
        if (mediaKind) {
          // The builder edits only a text header: load the message without
          // its media header, which lives in `replyMedia`.
          state.replyMedia = { kind: mediaKind, link: headerLink(i.header) };
          const rest = { ...i };
          delete rest.header;
          loadable = {
            ...message,
            payload: { ...message.payload, interactive: rest },
          } as MessageObject;
        }
        const legacy = messageToLegacyInteractive(loadable);
        if (legacy) state.reply = legacy;
      }
      break;
    }
    case 'image':
      state.image = mediaFrom(message.payload.image);
      break;
    case 'video':
      state.video = mediaFrom(message.payload.video);
      break;
    case 'audio':
      state.audio = mediaFrom(message.payload.audio);
      break;
    case 'document':
      state.document = mediaFrom(message.payload.document);
      break;
    case 'carousel': {
      const carousel = carouselFromMeta(message.payload);
      if (carousel) {
        state.carousel = {
          ...carousel,
          cards: carousel.cards.map((c) => ({
            ...c,
            cid: newCarouselCardId(),
          })),
        };
      }
      break;
    }
    case 'location': {
      const l = message.payload.location;
      state.location = {
        latitude: String(l.latitude),
        longitude: String(l.longitude),
        name: l.name ?? '',
        address: l.address ?? '',
      };
      break;
    }
    case 'contact': {
      const cards = message.payload.contacts;
      if (cards.length > 0) state.contacts = cards.map(cardToContact);
      break;
    }
  }
  return state;
}
