import { describe, expect, it } from 'vitest';
import { validateMessageObject, normalizeMessageObject } from './validate';
import type { MessageIssue } from './types';
import {
  SAMPLE_CAROUSEL_QR,
  SAMPLE_CAROUSEL_URL,
  SAMPLE_CTA,
  SAMPLE_IMAGE,
  SAMPLE_LIST,
  SAMPLE_REPLY_BUTTONS,
  SAMPLE_TEXT,
} from './fixtures';

function issues(input: unknown): MessageIssue[] {
  const r = validateMessageObject(input);
  if (r.ok) throw new Error('expected validation to fail');
  return r.issues;
}

function codes(input: unknown): string[] {
  return issues(input).map((i) => `${i.path}:${i.code}`);
}

const interactive = (body: Record<string, unknown>) => ({
  message_type: 'interactive',
  payload: { type: 'interactive', interactive: body },
});

describe('validateMessageObject — verbatim reference-app captures', () => {
  it.each([
    ['text', SAMPLE_TEXT],
    ['reply buttons', SAMPLE_REPLY_BUTTONS],
    ['cta url', SAMPLE_CTA],
    ['list', SAMPLE_LIST],
    ['image', SAMPLE_IMAGE],
    ['url carousel', SAMPLE_CAROUSEL_URL],
    ['quick-reply carousel (card.type "button")', SAMPLE_CAROUSEL_QR],
  ])('accepts the %s payload', (_name, fixture) => {
    expect(validateMessageObject(fixture).ok).toBe(true);
  });

  it('rewrites a reference-app interactive+carousel capture to message_type "carousel"', () => {
    const r = validateMessageObject(SAMPLE_CAROUSEL_URL);
    expect(r.ok && r.message.message_type).toBe('carousel');
    expect(normalizeMessageObject(SAMPLE_REPLY_BUTTONS)).toBe(
      SAMPLE_REPLY_BUTTONS
    );
  });
});

describe('validateMessageObject — structure', () => {
  it('rejects non-objects, unknown types and a payload.type mismatch', () => {
    expect(codes(null)).toEqual([':notObject']);
    expect(codes({ message_type: 'sticker', payload: {} })).toEqual([
      'message_type:invalidType',
    ]);
    expect(codes({ message_type: 'text' })).toEqual(['payload:required']);
    expect(codes({ message_type: 'text', payload: { type: 'image' } })).toEqual(
      ['payload.type:typeMismatch']
    );
  });
});

describe('validateMessageObject — text', () => {
  const text = (body: unknown) => ({
    message_type: 'text',
    payload: { type: 'text', text: { body } },
  });
  it('enforces required and the 4096 limit exactly at the boundary', () => {
    expect(validateMessageObject(text('a'.repeat(4096))).ok).toBe(true);
    expect(codes(text('a'.repeat(4097)))).toEqual([
      'payload.text.body:tooLong',
    ]);
    expect(codes(text('   '))).toEqual(['payload.text.body:required']);
  });
});

describe('validateMessageObject — reply buttons', () => {
  const buttons = (list: Array<[string, string]>) =>
    interactive({
      type: 'button',
      body: { text: 'Pick' },
      action: {
        buttons: list.map(([id, title]) => ({
          type: 'reply',
          reply: { id, title },
        })),
      },
    });

  it('allows 3 buttons, rejects 4, 0, duplicates and long titles', () => {
    expect(
      validateMessageObject(
        buttons([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C'],
        ])
      ).ok
    ).toBe(true);
    expect(
      codes(
        buttons([
          ['a', 'A'],
          ['b', 'B'],
          ['c', 'C'],
          ['d', 'D'],
        ])
      )
    ).toContain('payload.interactive.action.buttons:tooMany');
    expect(codes(buttons([]))).toEqual([
      'payload.interactive.action.buttons:tooFew',
    ]);
    expect(
      codes(
        buttons([
          ['a', 'Same'],
          ['a', 'Same'],
        ])
      )
    ).toEqual(['payload.interactive.action.buttons.1.reply.id:duplicate']);
    // Upstream enforces unique ids only; identical titles with distinct ids are accepted.
    expect(
      validateMessageObject(
        buttons([
          ['a', 'Same'],
          ['b', 'Same'],
        ])
      ).ok
    ).toBe(true);
    expect(validateMessageObject(buttons([['a', 'x'.repeat(20)]])).ok).toBe(
      true
    );
    expect(codes(buttons([['a', 'x'.repeat(21)]]))).toEqual([
      'payload.interactive.action.buttons.0.reply.title:tooLong',
    ]);
  });

  it('enforces body ≤1024 and footer ≤60', () => {
    const base = (body: string, footer?: string) =>
      interactive({
        type: 'button',
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          buttons: [{ type: 'reply', reply: { id: 'a', title: 'A' } }],
        },
      });
    expect(
      validateMessageObject(base('b'.repeat(1024), 'f'.repeat(60))).ok
    ).toBe(true);
    expect(codes(base('b'.repeat(1025)))).toEqual([
      'payload.interactive.body.text:tooLong',
    ]);
    expect(codes(base('ok', 'f'.repeat(61)))).toEqual([
      'payload.interactive.footer.text:tooLong',
    ]);
  });

  it('validates a media header link', () => {
    const withHeader = (link: string) =>
      interactive({
        type: 'button',
        header: { type: 'image', image: { link } },
        body: { text: 'Pick' },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'a', title: 'A' } }],
        },
      });
    expect(validateMessageObject(withHeader('https://x.test/a.png')).ok).toBe(
      true
    );
    // Same rule as template media (validateMediaUrl): http is allowed.
    expect(validateMessageObject(withHeader('http://x.test/a.png')).ok).toBe(
      true
    );
    expect(codes(withHeader('not a url'))).toEqual([
      'payload.interactive.header.image.link:invalidUrl',
    ]);
    expect(codes(withHeader('https://x.test/a.pdf'))).toEqual([
      'payload.interactive.header.image.link:invalidMedia',
    ]);
  });
});

describe('validateMessageObject — cta_url', () => {
  const cta = (label: string, url: string) =>
    interactive({
      type: 'cta_url',
      body: { text: 'Go' },
      action: { name: 'cta_url', parameters: { display_text: label, url } },
    });
  it('requires an http(s) url and a ≤20 char label', () => {
    expect(
      validateMessageObject(cta('x'.repeat(20), 'https://a.test')).ok
    ).toBe(true);
    expect(codes(cta('x'.repeat(21), 'https://a.test'))).toEqual([
      'payload.interactive.action.parameters.display_text:tooLong',
    ]);
    expect(validateMessageObject(cta('Go', 'http://a.test')).ok).toBe(true);
    expect(codes(cta('Go', 'ftp://a.test'))).toEqual([
      'payload.interactive.action.parameters.url:invalidUrl',
    ]);
    expect(codes(cta('Go', 'not a url'))).toEqual([
      'payload.interactive.action.parameters.url:invalidUrl',
    ]);
  });
});

describe('validateMessageObject — list', () => {
  const rows = (n: number, start = 0) =>
    Array.from({ length: n }, (_, k) => ({
      id: `r${start + k}`,
      title: `Row ${start + k}`,
    }));
  const list = (sections: unknown, extra: Record<string, unknown> = {}) =>
    interactive({
      type: 'list',
      body: { text: 'Choose' },
      action: { button: 'Open', sections },
      ...extra,
    });

  it('allows 10 rows total, rejects 11', () => {
    expect(validateMessageObject(list([{ rows: rows(10) }])).ok).toBe(true);
    expect(
      codes(
        list([
          { title: 'A', rows: rows(6) },
          { title: 'B', rows: rows(5, 6) },
        ])
      )
    ).toEqual(['payload.interactive.action.sections:tooMany']);
  });

  it('requires section titles only when there are several sections', () => {
    expect(validateMessageObject(list([{ rows: rows(1) }])).ok).toBe(true);
    expect(
      codes(list([{ rows: rows(1) }, { title: 'B', rows: rows(1, 1) }]))
    ).toEqual(['payload.interactive.action.sections.0.title:required']);
  });

  it('enforces row title 24 / description 72 and duplicate row ids', () => {
    const row = (title: string, description?: string) => [
      { rows: [{ id: 'a', title, ...(description ? { description } : {}) }] },
    ];
    expect(
      validateMessageObject(list(row('t'.repeat(24), 'd'.repeat(72)))).ok
    ).toBe(true);
    expect(codes(list(row('t'.repeat(25))))).toEqual([
      'payload.interactive.action.sections.0.rows.0.title:tooLong',
    ]);
    expect(codes(list(row('ok', 'd'.repeat(73))))).toEqual([
      'payload.interactive.action.sections.0.rows.0.description:tooLong',
    ]);
    expect(
      codes(
        list([
          {
            rows: [
              { id: 'a', title: 'A' },
              { id: 'a', title: 'B' },
            ],
          },
        ])
      )
    ).toEqual(['payload.interactive.action.sections.0.rows.1.id:duplicate']);
  });

  it('rejects a media header (Meta: text header only for lists)', () => {
    const h = {
      header: { type: 'image', image: { link: 'https://x.test/a.png' } },
    };
    expect(codes(list([{ rows: rows(1) }], h))).toEqual([
      'payload.interactive.header.type:invalidValue',
    ]);
  });
});

describe('validateMessageObject — flow', () => {
  const flow = (params: Record<string, unknown>) =>
    interactive({
      type: 'flow',
      body: { text: 'Fill the form' },
      action: { name: 'flow', parameters: params },
    });
  it('requires flow_id and a ≤30 char flow_cta', () => {
    expect(
      validateMessageObject(flow({ flow_id: '123', flow_cta: 'Open form' })).ok
    ).toBe(true);
    expect(codes(flow({ flow_cta: 'Open' }))).toEqual([
      'payload.interactive.action.parameters.flow_id:required',
    ]);
    expect(codes(flow({ flow_id: '1', flow_cta: 'x'.repeat(31) }))).toEqual([
      'payload.interactive.action.parameters.flow_cta:tooLong',
    ]);
  });
});

describe('validateMessageObject — media', () => {
  const media = (type: string, body: Record<string, unknown>) => ({
    message_type: type,
    payload: { type, [type]: body },
  });
  it('validates image/video/document links, formats and caption length', () => {
    expect(
      validateMessageObject(media('video', { link: 'https://x.test/a.mp4' })).ok
    ).toBe(true);
    expect(codes(media('video', { link: 'https://x.test/a.png' }))).toEqual([
      'payload.video.link:invalidMedia',
    ]);
    expect(
      validateMessageObject(
        media('document', {
          link: 'https://x.test/a.pdf',
          filename: 'a.pdf',
          caption: 'c',
        })
      ).ok
    ).toBe(true);
    expect(
      codes(
        media('image', {
          link: 'https://x.test/a.png',
          caption: 'c'.repeat(1025),
        })
      )
    ).toEqual(['payload.image.caption:tooLong']);
    expect(codes(media('image', {}))).toEqual(['payload.image.link:required']);
  });

  it('accepts audio and requires OGG/OPUS for voice notes', () => {
    expect(
      validateMessageObject(media('audio', { link: 'https://x.test/a.mp3' })).ok
    ).toBe(true);
    expect(
      codes(media('audio', { link: 'https://x.test/a.mp3', voice: true }))
    ).toEqual(['payload.audio.link:invalidMedia']);
    expect(
      validateMessageObject(
        media('audio', { link: 'https://x.test/a.ogg', voice: true })
      ).ok
    ).toBe(true);
    expect(codes(media('audio', { link: 'https://x.test/a.png' }))).toEqual([
      'payload.audio.link:invalidMedia',
    ]);
  });
});

describe('validateMessageObject — location & contact', () => {
  const loc = (latitude: unknown, longitude: unknown) => ({
    message_type: 'location',
    payload: { type: 'location', location: { latitude, longitude } },
  });
  it('range-checks coordinates', () => {
    expect(validateMessageObject(loc(28.6, 77.2)).ok).toBe(true);
    expect(validateMessageObject(loc(-90, 180)).ok).toBe(true);
    expect(codes(loc(91, 0))).toEqual(['payload.location.latitude:outOfRange']);
    expect(codes(loc(0, -181))).toEqual([
      'payload.location.longitude:outOfRange',
    ]);
    // Meta documents coordinates as strings: a decimal string is fine.
    expect(validateMessageObject(loc('28.6', '77.2')).ok).toBe(true);
    expect(codes(loc('abc', 0))).toEqual([
      'payload.location.latitude:invalidValue',
    ]);
    expect(codes(loc(undefined, 0))).toEqual([
      'payload.location.latitude:required',
    ]);
  });

  const contact = (c: unknown) => ({
    message_type: 'contact',
    payload: { type: 'contacts', contacts: [c] },
  });
  it('needs a formatted name and at least one phone or email', () => {
    expect(
      validateMessageObject(
        contact({
          name: { formatted_name: 'Asha' },
          phones: [{ phone: '+919876543210' }],
        })
      ).ok
    ).toBe(true);
    expect(codes(contact({ name: {}, phones: [{ phone: '1' }] }))).toEqual([
      'payload.contacts.0.name.formatted_name:required',
    ]);
    expect(codes(contact({ name: { formatted_name: 'A' } }))).toEqual([
      'payload.contacts.0.phones:tooFew',
    ]);
  });
});

describe('validateMessageObject — carousel (delegates to the existing validator)', () => {
  it('reports the carousel module failure as a single carousel issue', () => {
    const one = {
      message_type: 'carousel',
      payload: {
        type: 'interactive',
        interactive: {
          type: 'carousel',
          body: { text: 'x' },
          action: {
            cards: [
              {
                header: {
                  type: 'image',
                  image: { link: 'https://x.test/a.jpg' },
                },
                action: {
                  name: 'cta_url',
                  parameters: { display_text: 'Go', url: 'https://x.test' },
                },
              },
            ],
          },
        },
      },
    };
    const [issue] = issues(one);
    expect(issue.code).toBe('carousel');
    expect(issue.params?.reason).toBe('minCards');
  });

  it('rejects message_type "carousel" whose interactive.type is not carousel', () => {
    expect(
      codes({
        message_type: 'carousel',
        payload: {
          type: 'interactive',
          interactive: { type: 'button', body: { text: 'x' } },
        },
      })
    ).toEqual(['payload.interactive.type:invalidValue']);
  });
});
