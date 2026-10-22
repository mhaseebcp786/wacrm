import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import en from '../../../../messages/en.json';
import {
  ContactCards,
  RichInteractiveCard,
  SaasPayloadBubble,
  asContactCards,
  asInteractiveBody,
  safeHref,
} from '@/saas/components/payload-bubbles';
import {
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
  blankContact,
  emptyEditorState,
  type EditorState,
} from '@/saas/lib/quick-replies/editor-state';
import { validateQuickReplyMessage } from '@/saas/lib/quick-replies/validate';
import { MessagePreview } from './message-preview';
import { QuickReplyEditor } from './quick-reply-editor';

function render(ui: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

function stored(input: unknown): MessageObject {
  const r = validateQuickReplyMessage(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.message;
}

const ctaWith = (patch: Record<string, unknown>) => {
  const c = structuredClone(SAMPLE_CTA) as unknown as {
    payload: { interactive: Record<string, unknown> };
  };
  Object.assign(c.payload.interactive, patch);
  return c.payload;
};

describe('safeHref', () => {
  it('allows only http(s) links', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref(' http://example.com ')).toBe('http://example.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('//evil.test')).toBeNull();
    expect(safeHref('')).toBeNull();
  });
});

describe('payload guards', () => {
  it('accept real payloads and reject malformed ones', () => {
    expect(asInteractiveBody(SAMPLE_CTA.payload)).not.toBeNull();
    expect(asInteractiveBody({ type: 'interactive' })).toBeNull();
    expect(
      asInteractiveBody({ type: 'interactive', interactive: {} })
    ).toBeNull();
    expect(asInteractiveBody(null)).toBeNull();
    expect(asInteractiveBody('x')).toBeNull();
    expect(asContactCards({ type: 'contacts', contacts: [] })).toBeNull();
    expect(asContactCards({ type: 'contacts', contacts: [{}] })).toBeNull();
    expect(
      asContactCards({
        type: 'contacts',
        contacts: [{ name: { formatted_name: 'A' } }, 'junk'],
      })
    ).toHaveLength(1);
  });
});

describe('RichInteractiveCard', () => {
  it('draws a link button as a real, safe anchor', () => {
    const html = render(
      <RichInteractiveCard
        interactive={asInteractiveBody(SAMPLE_CTA.payload)!}
      />
    );
    expect(html).toContain('See our full product range.');
    expect(html).toContain('View range');
    expect(html).toContain(
      'href="https://www.invictoassociatesllp.in/products"'
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('never makes a non-web URL clickable', () => {
    const payload = ctaWith({
      action: {
        name: 'cta_url',
        parameters: { display_text: 'Go', url: 'javascript:alert(1)' },
      },
    });
    const html = render(
      <RichInteractiveCard interactive={asInteractiveBody(payload)!} />
    );
    expect(html).toContain('Go');
    expect(html).not.toContain('href=');
  });

  it('shows a text header, a media header and the footer', () => {
    const text = render(
      <RichInteractiveCard
        interactive={asInteractiveBody(
          ctaWith({
            header: { type: 'text', text: 'Big sale' },
            footer: { text: 'Ends Friday' },
          })
        )!}
      />
    );
    expect(text).toContain('Big sale');
    expect(text).toContain('Ends Friday');

    const image = render(
      <RichInteractiveCard
        interactive={asInteractiveBody(
          ctaWith({
            header: {
              type: 'image',
              image: { link: 'https://example.com/promo.jpg' },
            },
          })
        )!}
      />
    );
    expect(image).toContain('<img');
    expect(image).toContain('https://example.com/promo.jpg');

    // An http image is not loaded (CSP allows https only): a placeholder shows.
    const http = render(
      <RichInteractiveCard
        interactive={asInteractiveBody(
          ctaWith({
            header: {
              type: 'image',
              image: { link: 'http://example.com/promo.jpg' },
            },
          })
        )!}
      />
    );
    expect(http).not.toContain('<img');

    const doc = render(
      <RichInteractiveCard
        interactive={asInteractiveBody(
          ctaWith({
            header: {
              type: 'document',
              document: { link: 'https://example.com/files/brochure.pdf' },
            },
          })
        )!}
      />
    );
    expect(doc).toContain('brochure.pdf');
  });

  it('draws reply buttons with a media header', () => {
    const buttons = structuredClone(SAMPLE_REPLY_BUTTONS) as unknown as {
      payload: { interactive: Record<string, unknown> };
    };
    buttons.payload.interactive.header = {
      type: 'video',
      video: { link: 'https://example.com/v/clip.mp4' },
    };
    const html = render(
      <RichInteractiveCard interactive={asInteractiveBody(buttons.payload)!} />
    );
    expect(html).toContain('Laminates');
    expect(html).toContain('Wall panels');
    expect(html).toContain('clip.mp4');
  });
});

describe('ContactCards', () => {
  it('draws every card with its numbers, emails, links and company', () => {
    const contacts = asContactCards({
      type: 'contacts',
      contacts: [
        {
          name: { formatted_name: 'Jane Doe' },
          org: { company: 'Acme', title: 'Sales' },
          phones: [{ phone: '+15551234567' }],
          emails: [{ email: 'jane@acme.test' }],
          urls: [{ url: 'https://acme.test' }],
        },
        {
          name: { formatted_name: 'Bob' },
          phones: [{ phone: '+44 20 7946 0958' }],
        },
      ],
    })!;
    const html = render(<ContactCards contacts={contacts} />);
    for (const text of [
      'Jane Doe',
      'Sales · Acme',
      '+15551234567',
      'jane@acme.test',
      'https://acme.test',
      'Bob',
      '+44 20 7946 0958',
    ]) {
      expect(html).toContain(text);
    }
    // The avatar shows the first initial.
    expect(html).toContain('>J<');
  });
});

describe('SaasPayloadBubble (inbox)', () => {
  it('draws a stored link button and a stored contact', () => {
    expect(
      render(
        <SaasPayloadBubble
          contentType="rich_interactive"
          payload={SAMPLE_CTA.payload}
          fallbackText="x"
        />
      )
    ).toContain('View range');
    expect(
      render(
        <SaasPayloadBubble
          contentType="contact"
          payload={{
            type: 'contacts',
            contacts: [{ name: { formatted_name: 'Jane Doe' } }],
          }}
          fallbackText="x"
        />
      )
    ).toContain('Jane Doe');
  });

  it('falls back to the stored text when the payload is missing or malformed', () => {
    for (const payload of [
      null,
      undefined,
      {},
      { type: 'interactive' },
      'junk',
    ]) {
      const html = render(
        <SaasPayloadBubble
          contentType="rich_interactive"
          payload={payload}
          fallbackText="Plain text body"
        />
      );
      expect(html).toContain('Plain text body');
    }
    // No text either: the inbox's own "unsupported" wording, never a blank bubble.
    expect(
      render(
        <SaasPayloadBubble
          contentType="contact"
          payload={null}
          fallbackText=""
        />
      )
    ).toContain('[Unsupported message type]');
  });
});

describe('MessagePreview', () => {
  it.each([
    ['text', SAMPLE_TEXT, 'Hello {{contact.name}}'],
    ['reply buttons', SAMPLE_REPLY_BUTTONS, 'Laminates'],
    ['list', SAMPLE_LIST, 'Choose a category'],
    ['link button', SAMPLE_CTA, 'View range'],
    ['image', SAMPLE_IMAGE, 'Welmica Syncrow Woodgrain laminates'],
    ['carousel', SAMPLE_CAROUSEL_URL, 'Our latest laminate collections'],
  ])('renders a %s', (_name, fixture, expected) => {
    const html = render(<MessagePreview message={stored(fixture)} />);
    expect(html).toContain(expected);
  });

  it('renders audio, document, video, location and contact', () => {
    const cases: Array<[unknown, string]> = [
      [
        {
          message_type: 'audio',
          payload: { type: 'audio', audio: { link: 'https://x.test/a.mp3' } },
        },
        'Audio message',
      ],
      [
        {
          message_type: 'document',
          payload: {
            type: 'document',
            document: {
              link: 'https://x.test/d.pdf',
              filename: 'Brochure.pdf',
            },
          },
        },
        'Brochure.pdf',
      ],
      [
        {
          message_type: 'location',
          payload: {
            type: 'location',
            location: { latitude: 12.97, longitude: 77.59, name: 'HQ' },
          },
        },
        'HQ',
      ],
      [
        {
          message_type: 'contact',
          payload: {
            type: 'contacts',
            contacts: [
              {
                name: { formatted_name: 'Jane Doe' },
                phones: [{ phone: '+15551234567' }],
              },
            ],
          },
        },
        'Jane Doe',
      ],
    ];
    for (const [fixture, expected] of cases) {
      expect(render(<MessagePreview message={stored(fixture)} />)).toContain(
        expected
      );
    }
  });

  it('survives a half-filled draft and a malformed message without throwing', () => {
    const blank = {
      message_type: 'location',
      payload: { type: 'location', location: {} },
    } as unknown as MessageObject;
    expect(() => render(<MessagePreview message={blank} />)).not.toThrow();
    const broken = {
      message_type: 'contact',
      payload: { type: 'contacts' },
    } as unknown as MessageObject;
    expect(() => render(<MessagePreview message={broken} />)).not.toThrow();
  });
});

describe('QuickReplyEditor', () => {
  const noop = () => {};

  it.each(EDITOR_TYPES)('renders the %s form', (type) => {
    const html = render(
      <QuickReplyEditor value={emptyEditorState(type)} onChange={noop} />
    );
    expect(html).toContain('Message type');
  });

  it('offers Insert Name / Phone on every type except audio', () => {
    for (const type of EDITOR_TYPES) {
      const html = render(
        <QuickReplyEditor value={emptyEditorState(type)} onChange={noop} />
      );
      expect(html.includes('Insert into the field you are editing')).toBe(
        type !== 'audio'
      );
    }
  });

  it('shows the media-header control for reply buttons but not for lists', () => {
    const buttons = emptyEditorState('interactive');
    expect(
      render(<QuickReplyEditor value={buttons} onChange={noop} />)
    ).toContain('Media header (optional)');
    const list: EditorState = {
      ...buttons,
      reply: {
        kind: 'list',
        body: '',
        button_label: 'Menu',
        sections: [{ rows: [{ id: 'r', title: '' }] }],
      },
    };
    expect(
      render(<QuickReplyEditor value={list} onChange={noop} />)
    ).not.toContain('Media header (optional)');
  });

  it('shows the header choices on the link-button form', () => {
    const s = emptyEditorState('interactive');
    s.interactiveKind = 'cta';
    const html = render(<QuickReplyEditor value={s} onChange={noop} />);
    for (const label of ['None', 'Text', 'Image', 'Video', 'Document']) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it('warns when a number marked as on WhatsApp has no country code, and not when it has', () => {
    const local = emptyEditorState('contact');
    local.contacts = [blankContact()];
    local.contacts[0].phones[0].phone = '0300 1234567';
    expect(
      render(<QuickReplyEditor value={local} onChange={noop} />)
    ).toContain('Start the number with + and the country code');

    const intl = emptyEditorState('contact');
    intl.contacts = [blankContact()];
    intl.contacts[0].phones[0].phone = '+92 300 1234567';
    expect(
      render(<QuickReplyEditor value={intl} onChange={noop} />)
    ).not.toContain('Start the number with + and the country code');

    // Switched off: nothing to warn about.
    local.contacts[0].phones[0].onWhatsApp = false;
    expect(
      render(<QuickReplyEditor value={local} onChange={noop} />)
    ).not.toContain('Start the number with + and the country code');
  });

  it('keeps a stored label outside the offered list selectable', () => {
    const s = emptyEditorState('contact');
    s.contacts = [blankContact()];
    s.contacts[0].phones[0].type = 'IPHONE';
    const html = render(<QuickReplyEditor value={s} onChange={noop} />);
    expect(html).toContain('<option value="IPHONE"');
  });

  it('tells the agent that a media header overrides the builder text header', () => {
    const s = emptyEditorState('interactive');
    s.reply = {
      kind: 'buttons',
      body: 'Pick',
      header: 'Text header',
      buttons: [{ id: 'a', title: 'Yes' }],
    };
    s.replyMedia = { kind: 'image', link: '' };
    expect(render(<QuickReplyEditor value={s} onChange={noop} />)).toContain(
      'The text header above is ignored'
    );
    s.replyMedia = { kind: 'none', link: '' };
    expect(
      render(<QuickReplyEditor value={s} onChange={noop} />)
    ).not.toContain('The text header above is ignored');
  });

  it('renders each contact card with phone, WhatsApp toggle and add buttons', () => {
    const s = emptyEditorState('contact');
    s.contacts = [blankContact(), blankContact()];
    const html = render(<QuickReplyEditor value={s} onChange={noop} />);
    expect(html).toContain('Contact 1');
    expect(html).toContain('Contact 2');
    expect(html).toContain('On WhatsApp');
    expect(html).toContain('Add another contact');
    expect(html).toContain('Add from contacts');
    expect(html).toContain('Each contact needs a phone number or an email.');
  });
});
