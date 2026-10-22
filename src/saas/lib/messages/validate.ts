import { validateCarouselInteractivePayload } from '@/saas/lib/whatsapp/carousel-interactive';
import {
  getExtension,
  validateMediaUrl,
  type SaasMediaKind,
} from '@/saas/lib/whatsapp/media-specs';
import { carouselFromMeta } from './carousel-adapter';
import { personalizeMessage } from './tokens';
import {
  AUDIO_EXTENSIONS,
  MESSAGE_LIMITS as L,
  VOICE_EXTENSIONS,
} from './limits';
import {
  isMessageType,
  type MessageIssue,
  type MessageIssueCode,
  type MessageObject,
  type MessageType,
  type MessageValidationResult,
} from './types';

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonBlank(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Payload `type` expected for each message type. */
const PAYLOAD_TYPE: Record<MessageType, string> = {
  text: 'text',
  interactive: 'interactive',
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
  carousel: 'interactive',
  location: 'location',
  contact: 'contacts',
};

/**
 * Accept the reference app's capture form (`message_type: 'interactive'` wrapping an
 * `interactive.type === 'carousel'` body) and rewrite it to the canonical
 * `message_type: 'carousel'`. Anything else is returned untouched.
 */
export function normalizeMessageObject(input: unknown): unknown {
  if (
    isRec(input) &&
    input.message_type === 'interactive' &&
    isRec(input.payload) &&
    isRec(input.payload.interactive) &&
    input.payload.interactive.type === 'carousel'
  ) {
    return { ...input, message_type: 'carousel' };
  }
  return input;
}

class Issues {
  readonly list: MessageIssue[] = [];

  add(
    path: string,
    code: MessageIssueCode,
    params?: Record<string, string | number>
  ): void {
    this.list.push(params ? { path, code, params } : { path, code });
  }

  /** Required non-blank string within `max`. Returns whether it is usable. */
  text(path: string, v: unknown, max: number): v is string {
    if (!nonBlank(v)) {
      this.add(path, 'required');
      return false;
    }
    if (v.length > max) {
      this.add(path, 'tooLong', { max });
      return false;
    }
    return true;
  }

  /** Optional string within `max`; `undefined`/`null` are fine. */
  optionalText(path: string, v: unknown, max: number): void {
    if (v === undefined || v === null) return;
    if (typeof v !== 'string') {
      this.add(path, 'invalidValue');
    } else if (v.length > max) {
      this.add(path, 'tooLong', { max });
    }
  }

  /**
   * Media link, checked with the shared `validateMediaUrl` (same rules as
   * template media). Like that module, http links are allowed (Meta accepts
   * http and https links); only unparseable URLs and wrong formats fail.
   */
  media(path: string, kind: SaasMediaKind, v: unknown): void {
    if (!nonBlank(v)) {
      this.add(path, 'required');
      return;
    }
    const result = validateMediaUrl(kind, v);
    if (!result.ok) {
      this.add(
        path,
        result.error?.code === 'invalidFormat' ? 'invalidMedia' : 'invalidUrl',
        result.error?.params
      );
    }
  }

  url(path: string, v: unknown): void {
    if (!nonBlank(v)) {
      this.add(path, 'required');
    } else if (!isHttpUrl(v)) {
      this.add(path, 'invalidUrl');
    }
  }
}

function isHttpUrl(v: string): boolean {
  try {
    const { protocol } = new URL(v.trim());
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// ---- Per-type validators ---------------------------------------------

function validateText(p: Rec, out: Issues): void {
  if (!isRec(p.text)) return out.add('payload.text', 'required');
  out.text('payload.text.body', p.text.body, L.textBodyMaxLength);
  if (
    p.text.preview_url !== undefined &&
    typeof p.text.preview_url !== 'boolean'
  ) {
    out.add('payload.text.preview_url', 'invalidValue');
  }
}

function validateMediaPayload(
  kind: 'image' | 'video' | 'document',
  p: Rec,
  out: Issues
): void {
  const body = p[kind];
  if (!isRec(body)) return out.add(`payload.${kind}`, 'required');
  out.media(`payload.${kind}.link`, kind, body.link);
  out.optionalText(`payload.${kind}.caption`, body.caption, L.captionMaxLength);
  if (kind === 'document') {
    out.optionalText(
      'payload.document.filename',
      body.filename,
      L.documentFilenameMaxLength
    );
  }
}

function validateAudio(p: Rec, out: Issues): void {
  const audio = p.audio;
  if (!isRec(audio)) return out.add('payload.audio', 'required');
  const path = 'payload.audio.link';
  if (!nonBlank(audio.link)) return out.add(path, 'required');
  if (!isHttpUrl(audio.link)) return out.add(path, 'invalidUrl');
  if (audio.voice !== undefined && typeof audio.voice !== 'boolean') {
    out.add('payload.audio.voice', 'invalidValue');
  }
  const ext = getExtension(new URL(audio.link.trim()).pathname);
  const allowed: readonly string[] =
    audio.voice === true ? VOICE_EXTENSIONS : AUDIO_EXTENSIONS;
  // A recognisable extension outside the allowed list is rejected; an
  // unknown/absent one cannot be judged from the URL, so Meta decides.
  if (ext && !allowed.includes(ext) && KNOWN_FILE_EXTENSIONS.has(ext)) {
    out.add(path, 'invalidMedia', {
      formats: allowed.join(', ').toUpperCase(),
    });
  }
}

/** Extensions common enough that a mismatch is almost certainly a wrong file. */
const KNOWN_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...AUDIO_EXTENSIONS,
  'wav',
  'flac',
  'svg',
  'exe',
  'mpeg',
  'mkv',
  'rar',
  'json',
  'html',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'mp4',
  '3gp',
  'mov',
  'avi',
  'webm',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'zip',
]);

function validateLocation(p: Rec, out: Issues): void {
  const loc = p.location;
  if (!isRec(loc)) return out.add('payload.location', 'required');
  const range = (key: 'latitude' | 'longitude', max: number): void => {
    const v = loc[key];
    const path = `payload.location.${key}`;
    if (v === undefined || v === null || v === '') {
      out.add(path, 'required');
    } else {
      // Meta documents both as strings; we store numbers. Accept either,
      // as plain decimals only ("0x10" and "1e3" are not coordinates).
      const n =
        typeof v === 'number'
          ? v
          : typeof v === 'string' && DECIMAL_RE.test(v.trim())
            ? Number(v)
            : NaN;
      if (!Number.isFinite(n)) {
        out.add(path, 'invalidValue');
      } else if (n < -max || n > max) {
        out.add(path, 'outOfRange', { min: -max, max });
      }
    }
  };
  range('latitude', 90);
  range('longitude', 180);
  out.optionalText('payload.location.name', loc.name, L.locationTextMaxLength);
  out.optionalText(
    'payload.location.address',
    loc.address,
    L.locationTextMaxLength
  );
}

const WA_ID_RE = /^\d{5,20}$/;
const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

/** `YYYY-MM-DD` and a real calendar date (Meta's `birthday` format). */
function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

function validateContact(p: Rec, out: Issues): void {
  const contacts = p.contacts;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return out.add('payload.contacts', 'tooFew', { min: 1 });
  }
  contacts.forEach((c: unknown, i: number) => {
    const base = `payload.contacts.${i}`;
    if (!isRec(c)) return out.add(base, 'invalidValue');
    if (!isRec(c.name) || !nonBlank(c.name.formatted_name)) {
      out.add(`${base}.name.formatted_name`, 'required');
    }
    const phones = c.phones;
    const emails = c.emails;
    if (phones !== undefined && !Array.isArray(phones)) {
      out.add(`${base}.phones`, 'invalidValue');
    }
    if (emails !== undefined && !Array.isArray(emails)) {
      out.add(`${base}.emails`, 'invalidValue');
    }
    if (Array.isArray(phones)) {
      phones.forEach((ph: unknown, j: number) => {
        if (!isRec(ph) || !nonBlank(ph.phone)) {
          out.add(`${base}.phones.${j}.phone`, 'required');
        } else if (ph.wa_id !== undefined && !WA_ID_RE.test(String(ph.wa_id))) {
          // Meta: `wa_id` is the number's WhatsApp ID, digits only; with it
          // the recipient gets Message / Save contact buttons.
          out.add(`${base}.phones.${j}.wa_id`, 'invalidValue');
        }
      });
    }
    if (c.birthday !== undefined && !isIsoDate(c.birthday)) {
      out.add(`${base}.birthday`, 'invalidValue');
    }
    if (c.urls !== undefined) {
      if (!Array.isArray(c.urls)) {
        out.add(`${base}.urls`, 'invalidValue');
      } else {
        c.urls.forEach((u: unknown, j: number) => {
          out.url(`${base}.urls.${j}.url`, isRec(u) ? u.url : undefined);
        });
      }
    }
    if (Array.isArray(emails)) {
      emails.forEach((em: unknown, j: number) => {
        if (!isRec(em) || !nonBlank(em.email)) {
          out.add(`${base}.emails.${j}.email`, 'required');
        }
      });
    }
    const hasPhone = Array.isArray(phones) && phones.length > 0;
    const hasEmail = Array.isArray(emails) && emails.length > 0;
    if (!hasPhone && !hasEmail) {
      out.add(`${base}.phones`, 'tooFew', { min: 1 });
    }
  });
}

const HEADER_MEDIA_KINDS = ['image', 'video', 'document'] as const;

function validateInteractiveHeader(
  header: unknown,
  textOnly: boolean,
  out: Issues
): void {
  // null/undefined both mean "Header: None" in a composer.
  if (header === undefined || header === null) return;
  const base = 'payload.interactive.header';
  if (!isRec(header)) return out.add(base, 'invalidValue');
  if (header.type === 'text') {
    out.text(`${base}.text`, header.text, L.interactiveHeaderTextMaxLength);
    return;
  }
  const kind = HEADER_MEDIA_KINDS.find((k) => k === header.type);
  if (!kind || textOnly) return out.add(`${base}.type`, 'invalidValue');
  const media = header[kind];
  if (!isRec(media)) return out.add(`${base}.${kind}`, 'required');
  out.media(`${base}.${kind}.link`, kind, media.link);
}

function validateInteractive(p: Rec, out: Issues): void {
  const i = p.interactive;
  if (!isRec(i)) return out.add('payload.interactive', 'required');
  const base = 'payload.interactive';

  if (!isRec(i.body)) {
    out.add(`${base}.body.text`, 'required');
  } else {
    out.text(`${base}.body.text`, i.body.text, L.interactiveBodyMaxLength);
  }
  const footerBlank =
    i.footer === undefined ||
    i.footer === null ||
    (isRec(i.footer) &&
      (i.footer.text === undefined ||
        (typeof i.footer.text === 'string' && i.footer.text.trim() === '')));
  if (!footerBlank) {
    if (!isRec(i.footer)) {
      out.add(`${base}.footer.text`, 'invalidValue');
    } else {
      out.text(
        `${base}.footer.text`,
        i.footer.text,
        L.interactiveFooterMaxLength
      );
    }
  }
  const action = isRec(i.action) ? i.action : null;

  switch (i.type) {
    case 'button': {
      validateInteractiveHeader(i.header, false, out);
      const buttons = action?.buttons;
      if (!Array.isArray(buttons) || buttons.length === 0) {
        return out.add(`${base}.action.buttons`, 'tooFew', { min: 1 });
      }
      if (buttons.length > L.maxReplyButtons) {
        out.add(`${base}.action.buttons`, 'tooMany', {
          max: L.maxReplyButtons,
        });
      }
      // Upstream (interactive.ts / meta-api.ts) enforces unique button ids
      // but not unique titles, so this does the same.
      const ids = new Set<string>();
      buttons.forEach((b: unknown, n: number) => {
        const bp = `${base}.action.buttons.${n}`;
        const reply =
          isRec(b) && b.type === 'reply' && isRec(b.reply) ? b.reply : null;
        if (!reply) return out.add(bp, 'invalidValue');
        if (out.text(`${bp}.reply.id`, reply.id, L.buttonIdMaxLength)) {
          if (ids.has(reply.id)) out.add(`${bp}.reply.id`, 'duplicate');
          ids.add(reply.id);
        }
        out.text(`${bp}.reply.title`, reply.title, L.buttonTitleMaxLength);
      });
      return;
    }
    case 'cta_url': {
      validateInteractiveHeader(i.header, false, out);
      const params =
        action?.name === 'cta_url' && isRec(action.parameters)
          ? action.parameters
          : null;
      if (!params) return out.add(`${base}.action.parameters`, 'required');
      out.text(
        `${base}.action.parameters.display_text`,
        params.display_text,
        L.ctaLabelMaxLength
      );
      out.url(`${base}.action.parameters.url`, params.url);
      return;
    }
    case 'list': {
      // Meta: list messages only support a text header.
      validateInteractiveHeader(i.header, true, out);
      if (!action) return out.add(`${base}.action`, 'required');
      out.text(`${base}.action.button`, action.button, L.listButtonMaxLength);
      const sections = action.sections;
      if (!Array.isArray(sections) || sections.length === 0) {
        return out.add(`${base}.action.sections`, 'tooFew', { min: 1 });
      }
      if (sections.length > L.maxListSections) {
        out.add(`${base}.action.sections`, 'tooMany', {
          max: L.maxListSections,
        });
      }
      let total = 0;
      const rowIds = new Set<string>();
      sections.forEach((s: unknown, n: number) => {
        const sp = `${base}.action.sections.${n}`;
        if (!isRec(s)) return out.add(sp, 'invalidValue');
        if (sections.length > 1) {
          out.text(`${sp}.title`, s.title, L.listSectionTitleMaxLength);
        } else {
          out.optionalText(`${sp}.title`, s.title, L.listSectionTitleMaxLength);
        }
        if (!Array.isArray(s.rows) || s.rows.length === 0) {
          return out.add(`${sp}.rows`, 'tooFew', { min: 1 });
        }
        total += s.rows.length;
        s.rows.forEach((r: unknown, m: number) => {
          const rp = `${sp}.rows.${m}`;
          if (!isRec(r)) return out.add(rp, 'invalidValue');
          if (out.text(`${rp}.id`, r.id, L.listRowIdMaxLength)) {
            if (rowIds.has(r.id)) out.add(`${rp}.id`, 'duplicate');
            rowIds.add(r.id);
          }
          out.text(`${rp}.title`, r.title, L.listRowTitleMaxLength);
          out.optionalText(
            `${rp}.description`,
            r.description,
            L.listRowDescriptionMaxLength
          );
        });
      });
      if (total > L.maxListRows) {
        out.add(`${base}.action.sections`, 'tooMany', { max: L.maxListRows });
      }
      return;
    }
    case 'flow': {
      validateInteractiveHeader(i.header, false, out);
      const params =
        action?.name === 'flow' && isRec(action.parameters)
          ? action.parameters
          : null;
      if (!params) return out.add(`${base}.action.parameters`, 'required');
      const pp = `${base}.action.parameters`;
      if (!nonBlank(params.flow_id)) out.add(`${pp}.flow_id`, 'required');
      if (out.text(`${pp}.flow_cta`, params.flow_cta, L.flowCtaMaxLength)) {
        // Spec 01 §3.2: the Flow button label may not contain emoji.
        if (/\p{Extended_Pictographic}/u.test(params.flow_cta)) {
          out.add(`${pp}.flow_cta`, 'invalidValue');
        }
      }
      if (
        params.flow_action !== undefined &&
        params.flow_action !== 'navigate' &&
        params.flow_action !== 'data_exchange'
      ) {
        out.add(`${pp}.flow_action`, 'invalidValue');
      }
      if (params.flow_action_payload !== undefined) {
        const fp = params.flow_action_payload;
        if (!isRec(fp) || !nonBlank(fp.screen)) {
          out.add(`${pp}.flow_action_payload.screen`, 'required');
        }
      }
      return;
    }
    default:
      return out.add(`${base}.type`, 'invalidValue');
  }
}

function validateCarousel(p: Rec, out: Issues): void {
  const i = isRec(p.interactive) ? p.interactive : null;
  if (!i || i.type !== 'carousel') {
    return out.add('payload.interactive.type', 'invalidValue');
  }
  const converted = carouselFromMeta(p);
  if (!converted)
    return out.add('payload.interactive.action.cards', 'required');
  // Meta carousels have no top-level header/footer; the sender drops them,
  // so accepting them would silently lose copy.
  for (const key of ['header', 'footer'] as const) {
    if (i[key] !== undefined && i[key] !== null) {
      out.add(`payload.interactive.${key}`, 'invalidValue');
    }
  }
  // The adapter flattens each card to one button / one header type, so
  // check the raw shape for what it would silently drop or coerce.
  const rawCards = (i.action as Rec).cards as unknown[];
  rawCards.forEach((raw, n) => {
    if (!isRec(raw)) return;
    const base = `payload.interactive.action.cards.${n}`;
    const headerType = isRec(raw.header) ? raw.header.type : undefined;
    if (headerType !== 'image' && headerType !== 'video') {
      out.add(`${base}.header.type`, 'invalidValue');
    }
    const buttons = isRec(raw.action) ? raw.action.buttons : undefined;
    if (Array.isArray(buttons) && buttons.length > 1) {
      out.add(`${base}.action.buttons`, 'tooMany', { max: 1 });
    }
  });
  const result = validateCarouselInteractivePayload(converted);
  if (!result.ok) {
    // The delegated validator stops at its first failure, so a carousel
    // contributes at most one issue of its own. `card` is 1-based (as in
    // that module); other paths are 0-based.
    out.add('payload.interactive', 'carousel', {
      reason: result.code,
      ...(result.card ? { card: result.card } : {}),
    });
  }
}

// ---- Entry point -------------------------------------------------------

/**
 * Validate (and normalize) a `{ message_type, payload }` object. Never
 * throws; returns every issue found so a form can highlight all of them.
 * The returned `message` is the normalized input, NOT a sanitized copy:
 * unknown extra fields are left for `buildSendBody` to drop.
 */
export function validateMessageObject(input: unknown): MessageValidationResult {
  const normalized = normalizeMessageObject(input);
  if (!isRec(normalized)) {
    return { ok: false, issues: [{ path: '', code: 'notObject' }] };
  }
  const type = normalized.message_type;
  if (!isMessageType(type)) {
    return {
      ok: false,
      issues: [{ path: 'message_type', code: 'invalidType' }],
    };
  }
  const payload = normalized.payload;
  if (!isRec(payload)) {
    return { ok: false, issues: [{ path: 'payload', code: 'required' }] };
  }
  if (payload.type !== PAYLOAD_TYPE[type]) {
    return {
      ok: false,
      issues: [{ path: 'payload.type', code: 'typeMismatch' }],
    };
  }

  const out = new Issues();
  switch (type) {
    case 'text':
      validateText(payload, out);
      break;
    case 'interactive':
      validateInteractive(payload, out);
      break;
    case 'image':
    case 'video':
    case 'document':
      validateMediaPayload(type, payload, out);
      break;
    case 'audio':
      validateAudio(payload, out);
      break;
    case 'carousel':
      validateCarousel(payload, out);
      break;
    case 'location':
      validateLocation(payload, out);
      break;
    case 'contact':
      validateContact(payload, out);
      break;
  }

  if (out.list.length > 0) return { ok: false, issues: out.list };
  return { ok: true, message: normalized as unknown as MessageObject };
}

/**
 * Save-time validation for stored replies (quick replies, autoresponders,
 * chatbots). A message that is valid with its tokens intact can still fail
 * at send time once `{{contact.name}}` is substituted, e.g. a button whose
 * title is only a token and the contact has no name. This validates the
 * stored form AND the worst case where every token resolves to an empty
 * string, so such a message is rejected when saved rather than silently
 * never sending. Collisions that depend on the real name (a substituted
 * name equal to another button title) can only be caught at send time.
 */
export function validateMessageObjectForSave(
  input: unknown
): MessageValidationResult {
  const stored = validateMessageObject(input);
  if (!stored.ok) return stored;
  const worstCase = validateMessageObject(
    personalizeMessage(stored.message, {})
  );
  return worstCase.ok ? stored : worstCase;
}
