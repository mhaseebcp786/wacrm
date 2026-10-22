import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAMPLE_CTA, SAMPLE_TEXT } from '@/saas/lib/messages/fixtures';
import { createFakeDb } from './fake-db';

// The real send core runs here; only the token decryption and the Flow-run
// pause (a separate table) are stubbed, and `fetch` stands in for Meta.
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: () => 'plaintext-token',
  encrypt: () => 'enc',
  isLegacyFormat: () => false,
}));
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => {
    const b: Record<string, unknown> = {};
    for (const m of ['update', 'eq', 'select']) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: null, error: null });
    return b;
  },
}));

import { sendQuickReplyToConversation } from './send';

type Row = Record<string, unknown>;

function setup(reply: { message_type: string; payload: unknown }) {
  const tables: Record<string, Row[]> = {
    saas_quick_replies: [
      {
        id: 'qr-1',
        account_id: 'acct-1',
        name: 'Reply',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        ...reply,
      },
    ],
    quick_replies: [],
    conversations: [
      {
        id: 'conv-1',
        account_id: 'acct-1',
        contact: {
          id: 'contact-1',
          name: 'Asha',
          phone: '15551234567',
        },
      },
    ],
    whatsapp_config: [
      {
        id: 'cfg-1',
        account_id: 'acct-1',
        phone_number_id: 'PNID-1',
        access_token: 'enc-token',
      },
    ],
    messages: [],
  };
  return { tables, db: createFakeDb(tables) };
}

const fetchMock =
  vi.fn<(url: string, init: { body: string }) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ messages: [{ id: 'wamid.SENT' }] }), {
      status: 200,
    })
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

async function send(db: ReturnType<typeof setup>['db']) {
  return sendQuickReplyToConversation(db, 'acct-1', {
    id: 'qr-1',
    conversationId: 'conv-1',
  });
}

describe('suggested replies through the real send core', () => {
  it('location: sends a Cloud API location and stores a readable row', async () => {
    const { db, tables } = setup({
      message_type: 'location',
      payload: {
        type: 'location',
        location: { latitude: 12.97, longitude: 77.59, name: 'Head office' },
      },
    });
    const r = await send(db);
    expect(r.ok).toBe(true);
    expect(sentBody()).toMatchObject({
      type: 'location',
      to: '15551234567',
      location: { latitude: '12.97', longitude: '77.59', name: 'Head office' },
    });
    expect(tables.messages[0]).toMatchObject({
      conversation_id: 'conv-1',
      content_type: 'location',
      content_text: 'Head office',
      message_id: 'wamid.SENT',
      // The structured payload is stored so the inbox can draw the message.
      interactive_payload: {
        type: 'location',
        location: { latitude: 12.97, longitude: 77.59, name: 'Head office' },
      },
    });
    expect(tables.conversations[0].last_message_text).toBe('Head office');
  });

  it('contact: sends a contacts message and stores the name', async () => {
    const { db, tables } = setup({
      message_type: 'contact',
      payload: {
        type: 'contacts',
        contacts: [
          {
            name: { formatted_name: 'Jane Doe', first_name: 'Jane' },
            phones: [{ phone: '+15557654321' }],
          },
        ],
      },
    });
    expect((await send(db)).ok).toBe(true);
    expect(sentBody()).toMatchObject({
      type: 'contacts',
      contacts: [{ name: { formatted_name: 'Jane Doe' } }],
    });
    expect(tables.messages[0]).toMatchObject({
      content_type: 'contact',
      content_text: 'Jane Doe',
    });
  });

  it('link button: sends an interactive cta_url and stores the payload under rich_interactive', async () => {
    const { db, tables } = setup({
      message_type: 'interactive',
      payload: SAMPLE_CTA.payload,
    });
    expect((await send(db)).ok).toBe(true);
    const body = sentBody();
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('cta_url');
    expect(tables.messages[0].content_type).toBe('rich_interactive');
    expect(tables.messages[0].content_text).toBe('See our full product range.');
    expect(tables.messages[0].interactive_payload).toEqual(SAMPLE_CTA.payload);
  });

  it('text: fills the contact name before it reaches Meta and the inbox', async () => {
    const { db, tables } = setup({
      message_type: 'text',
      payload: SAMPLE_TEXT.payload,
    });
    expect((await send(db)).ok).toBe(true);
    expect(sentBody().text.body).toContain('Hello Asha,');
    expect(tables.messages[0].content_text).toContain('Hello Asha,');
    expect(JSON.stringify(sentBody())).not.toContain('{{');
  });

  it('reports a Meta rejection without storing a message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad recipient' } }), {
        status: 400,
      })
    );
    const { db, tables } = setup({
      message_type: 'location',
      payload: {
        type: 'location',
        location: { latitude: 1, longitude: 2 },
      },
    });
    await expect(send(db)).rejects.toThrow(/Meta API error/);
    expect(tables.messages).toHaveLength(0);
  });
});
