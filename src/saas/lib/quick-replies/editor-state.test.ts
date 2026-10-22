import { describe, expect, it } from 'vitest';

import {
  SAMPLE_CAROUSEL_QR,
  SAMPLE_CAROUSEL_URL,
  SAMPLE_CTA,
  SAMPLE_IMAGE,
  SAMPLE_LIST,
  SAMPLE_REPLY_BUTTONS,
  SAMPLE_TEXT,
} from '@/saas/lib/messages/fixtures';
import type { MessageObject } from '@/saas/lib/messages/types';
import {
  EDITOR_TYPES,
  editorToMessage,
  emptyEditorState,
  messageToEditor,
  blankContact,
  blankPhone,
  contactDraftFromCrm,
  phoneWaId,
  type ContactDraft,
  type PhoneDraft,
  type EditorState,
} from './editor-state';
import { validateQuickReplyMessage } from './validate';

function stored(input: unknown): MessageObject {
  const r = validateQuickReplyMessage(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.message;
}

/** Strip the editor-only card ids so two carousel states compare equal. */
function stable(state: EditorState): unknown {
  return JSON.parse(
    JSON.stringify(editorToMessage(state)).replace(/"cid":"[^"]*",?/g, '')
  );
}

describe('editor state', () => {
  it('starts every type empty and invalid, never throwing', () => {
    for (const type of EDITOR_TYPES) {
      const candidate = editorToMessage(emptyEditorState(type));
      expect(validateQuickReplyMessage(candidate).ok).toBe(false);
    }
  });

  it('accepts a decimal comma in coordinates', () => {
    const s = emptyEditorState('location');
    s.location = {
      latitude: '12,9716',
      longitude: '77,5946',
      name: '',
      address: '',
    };
    expect(validateQuickReplyMessage(editorToMessage(s)).ok).toBe(true);
  });

  it.each([
    ['text', SAMPLE_TEXT],
    ['reply buttons', SAMPLE_REPLY_BUTTONS],
    ['list', SAMPLE_LIST],
    ['cta', SAMPLE_CTA],
    ['image', SAMPLE_IMAGE],
    ['carousel (cta cards)', SAMPLE_CAROUSEL_URL],
    ['carousel (quick-reply cards)', SAMPLE_CAROUSEL_QR],
  ])(
    'loads a stored %s and writes back an equivalent valid message',
    (_n, fx) => {
      const message = stored(fx);
      const state = messageToEditor(message);
      const back = editorToMessage(state);
      const again = validateQuickReplyMessage(back);
      expect(again.ok).toBe(true);
      // Idempotent: loading what we wrote changes nothing further.
      if (again.ok) {
        expect(stable(messageToEditor(again.message))).toEqual(stable(state));
      }
    }
  );

  it('builds location, contact, video, audio and document messages', () => {
    const s = emptyEditorState('location');
    s.location = {
      latitude: '12.9716',
      longitude: '77.5946',
      name: 'Head office',
      address: '',
    };
    expect(validateQuickReplyMessage(editorToMessage(s)).ok).toBe(true);

    const bad = emptyEditorState('location');
    bad.location = { ...s.location, latitude: 'abc' };
    expect(validateQuickReplyMessage(editorToMessage(bad)).ok).toBe(false);
    const out = emptyEditorState('location');
    out.location = { ...s.location, latitude: '123' };
    expect(validateQuickReplyMessage(editorToMessage(out))).toMatchObject({
      ok: false,
      issues: [{ code: 'outOfRange' }],
    });

    const v = emptyEditorState('video');
    v.video.link = 'https://example.com/clip.mp4';
    expect(validateQuickReplyMessage(editorToMessage(v)).ok).toBe(true);
    const a = emptyEditorState('audio');
    a.audio.link = 'https://example.com/note.mp3';
    expect(validateQuickReplyMessage(editorToMessage(a)).ok).toBe(true);
    const d = emptyEditorState('document');
    d.document = {
      link: 'https://example.com/brochure.pdf',
      caption: '',
      filename: 'Brochure.pdf',
    };
    expect(validateQuickReplyMessage(editorToMessage(d)).ok).toBe(true);
  });

  it('writes the CTA message with an optional text header and footer', () => {
    const s = emptyEditorState('interactive');
    s.interactiveKind = 'cta';
    s.cta = {
      headerKind: 'text',
      headerText: 'Offer',
      headerLink: '',
      body: 'See our catalogue',
      footer: '',
      displayText: 'Open',
      url: 'https://example.com',
    };
    const r = validateQuickReplyMessage(editorToMessage(s));
    expect(r.ok).toBe(true);
    if (r.ok && r.message.message_type === 'interactive') {
      const i = r.message.payload.interactive;
      expect(i.type).toBe('cta_url');
      expect(i.header).toEqual({ type: 'text', text: 'Offer' });
      expect(i.footer).toBeUndefined();
    }
  });

  it('keeps each type’s input when switching tabs', () => {
    const s = emptyEditorState('text');
    s.text.body = 'kept';
    const switched: EditorState = { ...s, type: 'image' };
    expect(switched.text.body).toBe('kept');
    expect(editorToMessage({ ...switched, type: 'text' })).toMatchObject({
      payload: { text: { body: 'kept' } },
    });
  });
  describe('headers', () => {
    it('writes an image header on a link button and loads it back', () => {
      const s = emptyEditorState('interactive');
      s.interactiveKind = 'cta';
      s.cta = {
        headerKind: 'image',
        headerText: 'ignored',
        headerLink: 'https://example.com/promo.jpg',
        body: 'Spring offers',
        footer: '',
        displayText: 'Shop',
        url: 'https://example.com/shop',
      };
      const message = stored(editorToMessage(s));
      if (message.message_type !== 'interactive') throw new Error('type');
      expect(message.payload.interactive.header).toEqual({
        type: 'image',
        image: { link: 'https://example.com/promo.jpg' },
      });
      const back = messageToEditor(message);
      expect(back.cta.headerKind).toBe('image');
      expect(back.cta.headerLink).toBe('https://example.com/promo.jpg');
    });

    it('puts a media header on reply buttons and keeps the builder text header out of the way', () => {
      const s = emptyEditorState('interactive');
      s.reply = {
        kind: 'buttons',
        body: 'Pick one',
        header: 'Text header',
        buttons: [{ id: 'a', title: 'Yes' }],
      };
      s.replyMedia = { kind: 'video', link: 'https://example.com/clip.mp4' };
      const message = stored(editorToMessage(s));
      if (message.message_type !== 'interactive') throw new Error('type');
      expect(message.payload.interactive.header?.type).toBe('video');

      // Loading restores the media header into its own control and the
      // builder gets the message without it.
      const back = messageToEditor(message);
      expect(back.replyMedia).toEqual({
        kind: 'video',
        link: 'https://example.com/clip.mp4',
      });
      expect(back.reply).toMatchObject({ kind: 'buttons', body: 'Pick one' });
      expect(back.reply.header).toBeUndefined();
    });

    it('never applies a media header to a list (Meta: text header only)', () => {
      const s = emptyEditorState('interactive');
      s.reply = {
        kind: 'list',
        body: 'Menu',
        button_label: 'Open',
        sections: [{ rows: [{ id: 'r', title: 'Row' }] }],
      };
      s.replyMedia = { kind: 'image', link: 'https://example.com/a.jpg' };
      const message = stored(editorToMessage(s));
      if (message.message_type !== 'interactive') throw new Error('type');
      expect(message.payload.interactive.header).toBeUndefined();
    });

    it('leaves out a blank text header', () => {
      const s = emptyEditorState('interactive');
      s.interactiveKind = 'cta';
      s.cta = {
        headerKind: 'text',
        headerText: '   ',
        headerLink: '',
        body: 'Hi',
        footer: '',
        displayText: 'Open',
        url: 'https://example.com',
      };
      const message = stored(editorToMessage(s));
      if (message.message_type !== 'interactive') throw new Error('type');
      expect(message.payload.interactive.header).toBeUndefined();
    });
  });

  describe('contacts', () => {
    const phone = (over: Partial<PhoneDraft>): PhoneDraft => ({
      ...blankPhone(),
      ...over,
    });
    const jane = (): ContactDraft => ({
      ...blankContact(),
      firstName: 'Jane',
      lastName: 'Doe',
      company: 'Acme',
      title: 'Sales',
      phones: [
        phone({ phone: '+1 (555) 123-4567', type: 'WORK', onWhatsApp: true }),
        phone({ phone: '+44 20 7946 0958', type: 'HOME', onWhatsApp: false }),
      ],
      emails: [{ uid: 'e1', email: 'jane@acme.test', type: 'WORK' }],
      urls: [{ uid: 'u1', url: 'https://acme.test', type: 'WORK' }],
      birthday: '1990-04-02',
    });
    const message = (drafts: ContactDraft[]) => {
      const s = emptyEditorState('contact');
      s.contacts = drafts;
      return stored(editorToMessage(s));
    };
    const cards = (m: MessageObject) => {
      if (m.message_type !== 'contact') throw new Error('type');
      return m.payload.contacts;
    };

    it('builds a full card: derived display name, digits-only wa_id only when on WhatsApp', () => {
      const [card] = cards(message([jane()]));
      expect(card.name).toMatchObject({
        formatted_name: 'Jane Doe',
        first_name: 'Jane',
        last_name: 'Doe',
      });
      expect(card.phones).toEqual([
        { phone: '+1 (555) 123-4567', type: 'WORK', wa_id: '15551234567' },
        { phone: '+44 20 7946 0958', type: 'HOME' },
      ]);
      expect(card.org).toEqual({ company: 'Acme', title: 'Sales' });
      expect(card.emails).toEqual([{ email: 'jane@acme.test', type: 'WORK' }]);
    });

    it('sends several cards in one message and ignores blank rows', () => {
      const second: ContactDraft = {
        ...blankContact(),
        formattedName: 'Bob',
        emails: [{ uid: 'e2', email: 'bob@acme.test', type: '' }],
        phones: [phone({ phone: '  ' })],
      };
      const result = cards(message([jane(), second]));
      expect(result).toHaveLength(2);
      expect(result[1].phones).toBeUndefined();
    });

    it('needs a phone or an email on every card', () => {
      const s = emptyEditorState('contact');
      s.contacts = [{ ...blankContact(), formattedName: 'No contact info' }];
      expect(validateQuickReplyMessage(editorToMessage(s)).ok).toBe(false);
    });

    describe('WhatsApp id', () => {
      it('is only written for a number with an international prefix', () => {
        // A local number would yield an ID without a country code: wrong.
        const [card] = cards(
          message([
            {
              ...blankContact(),
              formattedName: 'Local',
              phones: [
                phone({ phone: '0300 1234567', onWhatsApp: true }),
                phone({ phone: '(555) 123-4567', onWhatsApp: true }),
                phone({ phone: '+92 300 1234567', onWhatsApp: true }),
              ],
            },
          ])
        );
        expect(card.phones?.map((p) => p.wa_id)).toEqual([
          undefined,
          undefined,
          '923001234567',
        ]);
      });

      it('exposes the same rule to the UI so it can warn', () => {
        expect(phoneWaId(phone({ phone: '0300 1234567' }))).toBeUndefined();
        expect(phoneWaId(phone({ phone: '+92 300 1234567' }))).toBe(
          '923001234567'
        );
        expect(
          phoneWaId(phone({ phone: '+1', onWhatsApp: true }))
        ).toBeUndefined();
        expect(
          phoneWaId(phone({ phone: '+92 300 1234567', onWhatsApp: false }))
        ).toBeUndefined();
      });

      it('keeps a stored id exactly while the number is not edited, and re-derives once it is', () => {
        const original = {
          message_type: 'contact',
          payload: {
            type: 'contacts',
            contacts: [
              {
                name: { formatted_name: 'Ali' },
                // A local-format number whose stored id carries the country code.
                phones: [{ phone: '0300 1234567', wa_id: '923001234567' }],
              },
            ],
          },
        };
        const state = messageToEditor(stored(original));
        // Editing something else (the name) must not corrupt the id.
        state.contacts[0].formattedName = 'Ali Khan';
        expect(cards(stored(editorToMessage(state)))[0].phones?.[0].wa_id).toBe(
          '923001234567'
        );
        // Editing the number drops the stored id: it is derived from the new
        // text (here a number with a prefix) instead of being left stale.
        state.contacts[0].phones[0].phone = '+971 50 123 4567';
        expect(cards(stored(editorToMessage(state)))[0].phones?.[0].wa_id).toBe(
          '971501234567'
        );
        state.contacts[0].phones[0].phone = '050 123 4567';
        expect(
          cards(stored(editorToMessage(state)))[0].phones?.[0].wa_id
        ).toBeUndefined();
      });
    });

    it('keeps the display name following the name parts after a reload', () => {
      const state = messageToEditor(message([jane()]));
      expect(state.contacts[0].formattedName).toBe('');
      state.contacts[0].lastName = 'Smith';
      expect(cards(stored(editorToMessage(state)))[0].name.formatted_name).toBe(
        'Jane Smith'
      );
    });

    it('keeps a display name that was written by hand', () => {
      const original = {
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: [
            {
              name: {
                formatted_name: 'Acme Support Desk',
                first_name: 'Support',
                last_name: 'Desk',
              },
              emails: [{ email: 'help@acme.test' }],
            },
          ],
        },
      };
      const state = messageToEditor(stored(original));
      expect(state.contacts[0].formattedName).toBe('Acme Support Desk');
      state.contacts[0].lastName = 'Team';
      expect(cards(stored(editorToMessage(state)))[0].name.formatted_name).toBe(
        'Acme Support Desk'
      );
    });

    it('round-trips a stored card without losing fields the editor has no input for', () => {
      const original = {
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: [
            {
              name: {
                formatted_name: 'Dr. Jane Q. Doe',
                first_name: 'Jane',
                last_name: 'Doe',
                middle_name: 'Q.',
                prefix: 'Dr.',
              },
              phones: [
                { phone: '+15551234567', type: 'IPHONE', wa_id: '15551234567' },
              ],
              addresses: [
                {
                  street: '1 Main St',
                  city: 'Springfield',
                  country_code: 'US',
                  type: 'HOME',
                },
              ],
            },
          ],
        },
      };
      const state = messageToEditor(stored(original));
      const [card] = cards(stored(editorToMessage(state)));
      expect(card).toMatchObject({
        name: {
          middle_name: 'Q.',
          prefix: 'Dr.',
          formatted_name: 'Dr. Jane Q. Doe',
        },
        addresses: [{ street: '1 Main St', city: 'Springfield' }],
      });
      // A label outside the editor's list survives too.
      expect(card.phones?.[0]).toMatchObject({
        type: 'IPHONE',
        wa_id: '15551234567',
      });
    });

    it('turns a CRM contact into a card marked as on WhatsApp', () => {
      const d = contactDraftFromCrm({
        name: 'Asha Rao',
        phone: '+919876543210',
        email: 'asha@example.test',
        company: 'Rao & Co',
      });
      const [card] = cards(message([d]));
      expect(card.phones?.[0]).toMatchObject({
        phone: '+919876543210',
        wa_id: '919876543210',
      });
      expect(card.org?.company).toBe('Rao & Co');
      // A contact known only by phone still gets a display name.
      expect(contactDraftFromCrm({ phone: '+15550001' }).formattedName).toBe(
        '+15550001'
      );
    });

    it('rejects a malformed birthday, link and WhatsApp id (Meta formats)', () => {
      const s = emptyEditorState('contact');
      s.contacts = [{ ...jane(), birthday: '02/04/1990' }];
      expect(validateQuickReplyMessage(editorToMessage(s)).ok).toBe(false);
      s.contacts = [{ ...jane(), birthday: '1990-02-31' }];
      expect(validateQuickReplyMessage(editorToMessage(s)).ok).toBe(false);
      s.contacts = [
        { ...jane(), urls: [{ uid: 'u9', url: 'not a link', type: '' }] },
      ];
      expect(validateQuickReplyMessage(editorToMessage(s)).ok).toBe(false);
      // A hand-written card with a non-digit wa_id (API users) is refused.
      const bad = {
        message_type: 'contact',
        payload: {
          type: 'contacts',
          contacts: [
            {
              name: { formatted_name: 'X' },
              phones: [{ phone: '+1555', wa_id: '+1-555' }],
            },
          ],
        },
      };
      expect(validateQuickReplyMessage(bad).ok).toBe(false);
    });
  });

  describe('coordinates', () => {
    const at = (latitude: string, longitude: string) => {
      const s = emptyEditorState('location');
      s.location = { latitude, longitude, name: '', address: '' };
      return validateQuickReplyMessage(editorToMessage(s));
    };

    it('accepts plain decimals, with a point or a comma', () => {
      expect(at('12.9716', '77.5946').ok).toBe(true);
      expect(at('-33,8688', '151,2093').ok).toBe(true);
      expect(at('0', '0').ok).toBe(true);
    });

    it('rejects anything that only looks numeric to JavaScript', () => {
      for (const bad of ['0x10', '1e3', '12.', '.5', 'Infinity', '12 .5']) {
        expect(at(bad, '10').ok, bad).toBe(false);
      }
    });
  });
});
