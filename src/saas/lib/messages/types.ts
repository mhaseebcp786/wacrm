// ============================================================
// Shared "message object" (reference-app parity keystone).
//
// One `{ message_type, payload }` shape reused by Suggested Replies,
// Autoresponder, Chatbot and Flow nodes. `payload` is a Meta Cloud API
// send body stored verbatim, minus `messaging_product` / recipient.
// Spec: docs/saas/specs/reference-app/01-suggested-replies.md §3.
//
// Canonical choice for this fork: a carousel is `message_type: 'carousel'`
// (matches the existing `messages.content_type`). The reference app's own captures
// store it as `message_type: 'interactive'` with `interactive.type ===
// 'carousel'`; `normalizeMessageObject` accepts both and rewrites to the
// canonical form.
// ============================================================

export const MESSAGE_TYPES = [
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

export type MessageType = (typeof MESSAGE_TYPES)[number];

export function isMessageType(value: unknown): value is MessageType {
  return (
    typeof value === 'string' &&
    (MESSAGE_TYPES as readonly string[]).includes(value)
  );
}

/** `{{contact.name}}` / `{{contact.phone}}` substitution values. */
export interface ContactTokens {
  name?: string | null;
  phone?: string | null;
}

// ---- Payloads (Meta send bodies) -------------------------------------

export interface TextPayload {
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

export interface MediaLink {
  link: string;
}

export interface ImagePayload {
  type: 'image';
  image: MediaLink & { caption?: string };
}

export interface VideoPayload {
  type: 'video';
  video: MediaLink & { caption?: string };
}

export interface AudioPayload {
  type: 'audio';
  /** `voice: true` sends a push-to-talk voice note (OGG/OPUS only). */
  audio: MediaLink & { voice?: boolean };
}

export interface DocumentPayload {
  type: 'document';
  document: MediaLink & { filename?: string; caption?: string };
}

export interface LocationPayload {
  type: 'location';
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface ContactCard {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    prefix?: string;
    suffix?: string;
  };
  phones?: Array<{ phone: string; type?: string; wa_id?: string }>;
  emails?: Array<{ email: string; type?: string }>;
  org?: { company?: string; department?: string; title?: string };
  [extra: string]: unknown;
}

export interface ContactPayload {
  type: 'contacts';
  contacts: ContactCard[];
}

export type InteractiveHeader =
  | { type: 'text'; text: string }
  | { type: 'image'; image: MediaLink }
  | { type: 'video'; video: MediaLink }
  | { type: 'document'; document: MediaLink & { filename?: string } };

interface InteractiveBase {
  header?: InteractiveHeader;
  body: { text: string };
  footer?: { text: string };
}

export interface ReplyButtonInteractive extends InteractiveBase {
  type: 'button';
  action: {
    buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
  };
}

export interface CtaUrlInteractive extends InteractiveBase {
  type: 'cta_url';
  action: {
    name: 'cta_url';
    parameters: { display_text: string; url: string };
  };
}

export interface ListInteractive extends InteractiveBase {
  type: 'list';
  action: {
    button: string;
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
}

export interface FlowInteractive extends InteractiveBase {
  type: 'flow';
  action: {
    name: 'flow';
    parameters: {
      flow_message_version?: string;
      flow_id: string;
      flow_cta: string;
      flow_token?: string;
      flow_action?: 'navigate' | 'data_exchange';
      flow_action_payload?: { screen: string; data?: Record<string, unknown> };
    };
  };
}

export type InteractiveBody =
  | ReplyButtonInteractive
  | CtaUrlInteractive
  | ListInteractive
  | FlowInteractive;

export interface InteractivePayload {
  type: 'interactive';
  interactive: InteractiveBody;
}

/** Interactive media carousel (24h session). Shape per Meta's carousel doc. */
export interface CarouselCardMeta {
  card_index?: number;
  /** Meta wants `cta_url` on every card; the reference app emits `button` for quick-reply cards. */
  type?: 'cta_url' | 'button';
  header: {
    type: 'image' | 'video';
    image?: MediaLink;
    video?: MediaLink;
  };
  body?: { text: string };
  action:
    | { name: 'cta_url'; parameters: { display_text: string; url: string } }
    | {
        buttons: Array<{
          type: 'quick_reply';
          quick_reply: { id?: string; title: string };
        }>;
      };
}

export interface CarouselMessagePayload {
  type: 'interactive';
  interactive: {
    type: 'carousel';
    body: { text: string };
    action: { cards: CarouselCardMeta[] };
  };
}

export interface PayloadByType {
  text: TextPayload;
  interactive: InteractivePayload;
  image: ImagePayload;
  video: VideoPayload;
  audio: AudioPayload;
  document: DocumentPayload;
  carousel: CarouselMessagePayload;
  location: LocationPayload;
  contact: ContactPayload;
}

export type MessageObject = {
  [K in MessageType]: { message_type: K; payload: PayloadByType[K] };
}[MessageType];

// ---- Validation results ----------------------------------------------

/**
 * i18n-friendly failure code (never an English sentence): callers map
 * `code` (+ `params`) to a catalogue message, like `media-specs.ts`.
 */
export type MessageIssueCode =
  | 'notObject'
  | 'invalidType'
  | 'typeMismatch'
  | 'required'
  | 'invalidValue'
  | 'tooLong'
  | 'tooFew'
  | 'tooMany'
  | 'duplicate'
  | 'outOfRange'
  | 'invalidUrl'
  | 'invalidMedia'
  | 'carousel';

export interface MessageIssue {
  /** Dot path into the message object, e.g. `payload.interactive.body.text`. */
  path: string;
  code: MessageIssueCode;
  params?: Record<string, string | number>;
}

export type MessageValidationResult =
  { ok: true; message: MessageObject } | { ok: false; issues: MessageIssue[] };
