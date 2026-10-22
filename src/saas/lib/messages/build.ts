import { buildCarouselRequestBody } from '@/saas/lib/whatsapp/carousel-send';
import { recipientFields } from '@/saas/lib/whatsapp/meta-request';
import { carouselFromMeta } from './carousel-adapter';
import type {
  ContactCard,
  InteractiveBody,
  InteractiveHeader,
  MessageObject,
} from './types';

type Body = Record<string, unknown>;

/** Copy only the listed keys that hold a value (not undefined/null/""). */
function pick<T extends object>(
  src: T,
  keys: readonly (keyof T)[]
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    const v = src[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

function buildHeader(h: InteractiveHeader): Body {
  switch (h.type) {
    case 'text':
      return { type: 'text', text: h.text };
    case 'image':
      return { type: 'image', image: { link: h.image.link } };
    case 'video':
      return { type: 'video', video: { link: h.video.link } };
    case 'document':
      return {
        type: 'document',
        document: pick(h.document, ['link', 'filename']),
      };
  }
}

function buildInteractive(i: InteractiveBody): Body {
  const out: Body = { type: i.type };
  if (i.header) out.header = buildHeader(i.header);
  out.body = { text: i.body.text };
  if (i.footer?.text) out.footer = { text: i.footer.text };

  switch (i.type) {
    case 'button':
      out.action = {
        buttons: i.action.buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.reply.id, title: b.reply.title },
        })),
      };
      break;
    case 'cta_url':
      out.action = {
        name: 'cta_url',
        parameters: {
          display_text: i.action.parameters.display_text,
          url: i.action.parameters.url,
        },
      };
      break;
    case 'list':
      out.action = {
        button: i.action.button,
        sections: i.action.sections.map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => pick(r, ['id', 'title', 'description'])),
        })),
      };
      break;
    case 'flow': {
      const p = i.action.parameters;
      out.action = {
        name: 'flow',
        parameters: {
          // Meta requires a version; "3" is the current one.
          flow_message_version: p.flow_message_version ?? '3',
          flow_id: p.flow_id,
          flow_cta: p.flow_cta,
          ...pick(p, ['flow_token', 'flow_action', 'flow_action_payload']),
        },
      };
      break;
    }
  }
  return out;
}

/**
 * Meta requires `formatted_name` plus at least one other name part. Saved
 * contact cards only need the display name, so derive `first_name` from it.
 */
function buildContactCard(c: ContactCard): ContactCard {
  const n = pick(c.name, [
    'formatted_name',
    'first_name',
    'last_name',
    'middle_name',
    'prefix',
    'suffix',
  ]) as ContactCard['name'];
  const hasPart = Boolean(
    n.first_name || n.last_name || n.middle_name || n.prefix || n.suffix
  );
  return {
    // Whitelist Meta's contact fields so stray keys never reach the API.
    ...pick(c, ['phones', 'emails', 'org', 'urls', 'addresses', 'birthday']),
    name: hasPart ? n : { ...n, first_name: n.formatted_name },
  };
}

/**
 * Build the Cloud API request body for a validated message object. Pure
 * (no I/O). Call after `validateMessageObject` (and after
 * `personalizeMessage` when the message carries contact tokens); the
 * builder trusts the shape and only whitelists fields so stray keys in a
 * stored payload never reach Meta.
 *
 * Carousels go through `buildCarouselRequestBody`, so the fork's decision
 * to send `card.type: "cta_url"` on every card stays in one place.
 */
export function buildSendBody(
  message: MessageObject,
  to: string,
  options: { contextMessageId?: string } = {}
): Body {
  if (message.message_type === 'carousel') {
    const carousel = carouselFromMeta(message.payload);
    if (!carousel) throw new Error('Carousel payload is malformed.');
    return buildCarouselRequestBody(to, carousel, options.contextMessageId);
  }

  const body: Body = {
    messaging_product: 'whatsapp',
    ...recipientFields(to),
  };

  switch (message.message_type) {
    case 'text': {
      const { body: text, preview_url } = message.payload.text;
      body.type = 'text';
      body.text = {
        body: text,
        ...(typeof preview_url === 'boolean' ? { preview_url } : {}),
      };
      break;
    }
    case 'interactive':
      body.type = 'interactive';
      body.interactive = buildInteractive(message.payload.interactive);
      break;
    case 'image':
      body.type = 'image';
      body.image = pick(message.payload.image, ['link', 'caption']);
      break;
    case 'video':
      body.type = 'video';
      body.video = pick(message.payload.video, ['link', 'caption']);
      break;
    case 'audio':
      body.type = 'audio';
      // Upstream (sendMediaMessage) sends audio as { link } only: Meta renders
      // OGG/OPUS as a voice note by itself, and the stored `voice` flag is
      // validation metadata, not a Cloud API field.
      body.audio = { link: message.payload.audio.link };
      break;
    case 'document':
      body.type = 'document';
      body.document = pick(message.payload.document, [
        'link',
        'filename',
        'caption',
      ]);
      break;
    case 'location': {
      body.type = 'location';
      const { latitude, longitude, ...text } = pick(message.payload.location, [
        'latitude',
        'longitude',
        'name',
        'address',
      ]);
      // Meta documents both coordinates as strings (decimal degrees); we
      // store numbers, so convert at the wire.
      body.location = {
        latitude: String(latitude),
        longitude: String(longitude),
        ...text,
      };
      break;
    }
    case 'contact':
      body.type = 'contacts';
      body.contacts = message.payload.contacts.map(buildContactCard);
      break;
  }

  if (options.contextMessageId) {
    body.context = { message_id: options.contextMessageId };
  }
  return body;
}
