import { describe, expect, it } from 'vitest';

import { SAMPLE_CTA, SAMPLE_TEXT } from '@/saas/lib/messages/fixtures';
import { createFakeDb } from './fake-db';
import {
  createQuickReply,
  deleteQuickReply,
  getQuickReplyItem,
  listQuickReplyItems,
  updateQuickReply,
} from './service';

const ctx = { accountId: 'acct-1', userId: 'user-1' };

function db(tables: Record<string, Record<string, unknown>[]> = {}, opts = {}) {
  return createFakeDb(
    { saas_quick_replies: [], quick_replies: [], conversations: [], ...tables },
    opts
  );
}

const legacy = (over: Record<string, unknown> = {}) => ({
  id: 'legacy-1',
  account_id: 'acct-1',
  user_id: 'user-9',
  title: 'Thanks',
  kind: 'text',
  content_text: 'Thanks for reaching out',
  interactive_payload: null,
  created_at: '2025-12-01T00:00:00.000Z',
  updated_at: '2025-12-01T00:00:00.000Z',
  ...over,
});

describe('createQuickReply', () => {
  it('stores a validated message with the account and author', async () => {
    const tables = { saas_quick_replies: [] as Record<string, unknown>[] };
    const r = await createQuickReply(db(tables), ctx, {
      name: '  Welcome ',
      message: SAMPLE_TEXT,
    });
    expect(r.ok).toBe(true);
    expect(tables.saas_quick_replies).toHaveLength(1);
    expect(tables.saas_quick_replies[0]).toMatchObject({
      account_id: 'acct-1',
      user_id: 'user-1',
      name: 'Welcome',
      message_type: 'text',
      is_active: true,
    });
  });

  it('rejects a blank or oversized name before touching the database', async () => {
    const tables = { saas_quick_replies: [] as Record<string, unknown>[] };
    expect(
      await createQuickReply(db(tables), ctx, {
        name: ' ',
        message: SAMPLE_TEXT,
      })
    ).toMatchObject({ ok: false, error: 'nameRequired' });
    expect(
      await createQuickReply(db(tables), ctx, {
        name: 'x'.repeat(101),
        message: SAMPLE_TEXT,
      })
    ).toMatchObject({ ok: false, error: 'nameTooLong', max: 100 });
    expect(tables.saas_quick_replies).toHaveLength(0);
  });

  it('returns the validator issues for an invalid message', async () => {
    const r = await createQuickReply(db(), ctx, {
      name: 'x',
      message: {
        message_type: 'text',
        payload: { type: 'text', text: { body: '' } },
      },
    });
    expect(r).toMatchObject({ ok: false, error: 'invalidMessage' });
    if (!r.ok && r.error === 'invalidMessage') {
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it('surfaces a database failure', async () => {
    const r = await createQuickReply(
      db(
        {},
        { failOn: (t: string, op: string) => (op === 'insert' ? 'boom' : null) }
      ),
      ctx,
      { name: 'x', message: SAMPLE_TEXT }
    );
    expect(r).toMatchObject({ ok: false, error: 'db', message: 'boom' });
  });
});

describe('listQuickReplyItems', () => {
  it('merges both tables, scoped to the account, and can hide inactive replies', async () => {
    const tables = {
      saas_quick_replies: [
        {
          id: 's1',
          account_id: 'acct-1',
          name: 'A',
          message_type: 'text',
          payload: SAMPLE_TEXT.payload,
          is_active: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'other',
          account_id: 'acct-2',
          name: 'Not mine',
          message_type: 'text',
          payload: SAMPLE_TEXT.payload,
          is_active: true,
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
      quick_replies: [legacy()],
    };
    const all = await listQuickReplyItems(db(tables), 'acct-1');
    expect(all.ok && all.value.map((i) => i.id)).toEqual(['s1', 'legacy-1']);
    const active = await listQuickReplyItems(db(tables), 'acct-1', {
      activeOnly: true,
    });
    expect(active.ok && active.value.map((i) => i.id)).toEqual(['legacy-1']);
  });

  it('resolves tokens to empty text when the conversation has no readable contact', async () => {
    const tables = {
      saas_quick_replies: [
        {
          id: 's1',
          account_id: 'acct-1',
          name: 'A',
          message_type: 'text',
          payload: SAMPLE_TEXT.payload,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const r = await listQuickReplyItems(db(tables), 'acct-1', {
      conversationId: 'does-not-exist',
    });
    const resolved = r.ok ? r.value[0].resolved : null;
    // Never null with a conversation, and never a literal token.
    expect(resolved).not.toBeNull();
    expect(
      resolved?.message_type === 'text' && resolved.payload.text.body
    ).not.toContain('{{');
  });

  it('resolves tokens for the requested conversation', async () => {
    const tables = {
      saas_quick_replies: [
        {
          id: 's1',
          account_id: 'acct-1',
          name: 'A',
          message_type: 'text',
          payload: SAMPLE_TEXT.payload,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      conversations: [
        {
          id: 'conv-1',
          account_id: 'acct-1',
          contact: { name: 'Asha', phone: '+15550001' },
        },
      ],
    };
    const r = await listQuickReplyItems(db(tables), 'acct-1', {
      conversationId: 'conv-1',
    });
    const resolved = r.ok ? r.value[0].resolved : null;
    expect(
      resolved?.message_type === 'text' && resolved.payload.text.body
    ).toContain('Hello Asha,');
  });
});

describe('updateQuickReply', () => {
  const saasRow = () => ({
    id: 's1',
    account_id: 'acct-1',
    user_id: 'user-1',
    name: 'Old',
    message_type: 'text',
    payload: SAMPLE_TEXT.payload,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });

  it('updates name, message and the active flag of a SaaS row', async () => {
    const tables = { saas_quick_replies: [saasRow()] };
    const r = await updateQuickReply(db(tables), ctx, 's1', {
      name: 'New',
      message: SAMPLE_CTA,
      is_active: false,
    });
    expect(r.ok).toBe(true);
    expect(tables.saas_quick_replies[0]).toMatchObject({
      name: 'New',
      message_type: 'interactive',
      is_active: false,
    });
  });

  it('does not touch a row of another account', async () => {
    const tables = {
      saas_quick_replies: [{ ...saasRow(), account_id: 'acct-2' }],
    };
    const r = await updateQuickReply(db(tables), ctx, 's1', { name: 'Hacked' });
    expect(r).toMatchObject({ ok: false, error: 'notFound' });
    expect(tables.saas_quick_replies[0].name).toBe('Old');
  });

  it('moves an upstream row to the SaaS table on edit, keeping its place in the list', async () => {
    const tables = {
      saas_quick_replies: [] as Record<string, unknown>[],
      quick_replies: [legacy()],
    };
    const r = await updateQuickReply(db(tables), ctx, 'legacy-1', {
      message: SAMPLE_TEXT,
    });
    expect(r.ok).toBe(true);
    expect(tables.quick_replies).toHaveLength(0);
    expect(tables.saas_quick_replies).toHaveLength(1);
    expect(tables.saas_quick_replies[0]).toMatchObject({
      name: 'Thanks',
      user_id: 'user-9',
      created_at: '2025-12-01T00:00:00.000Z',
    });
  });

  it('carries the upstream content over on a name-only edit', async () => {
    const tables = {
      saas_quick_replies: [] as Record<string, unknown>[],
      quick_replies: [legacy()],
    };
    const r = await updateQuickReply(db(tables), ctx, 'legacy-1', {
      name: 'Renamed',
      is_active: false,
    });
    expect(r.ok).toBe(true);
    expect(tables.saas_quick_replies[0]).toMatchObject({
      name: 'Renamed',
      message_type: 'text',
      is_active: false,
    });
  });

  it('rolls the new row back if the upstream row cannot be removed', async () => {
    const tables = {
      saas_quick_replies: [] as Record<string, unknown>[],
      quick_replies: [legacy()],
    };
    const r = await updateQuickReply(
      db(tables, {
        failOn: (t: string, op: string) =>
          t === 'quick_replies' && op === 'delete' ? 'locked' : null,
      }),
      ctx,
      'legacy-1',
      { message: SAMPLE_TEXT }
    );
    expect(r).toMatchObject({ ok: false, error: 'db' });
    expect(tables.saas_quick_replies).toHaveLength(0);
    expect(tables.quick_replies).toHaveLength(1);
  });

  it('does not leave a duplicate when a concurrent request already moved the row', async () => {
    const tables = {
      saas_quick_replies: [] as Record<string, unknown>[],
      quick_replies: [legacy()],
    };
    const r = await updateQuickReply(
      db(tables, {
        deleteMatchesNothing: (t: string) => t === 'quick_replies',
      }),
      ctx,
      'legacy-1',
      { message: SAMPLE_TEXT }
    );
    expect(r).toMatchObject({ ok: false, error: 'notFound' });
    expect(tables.saas_quick_replies).toHaveLength(0);
  });

  it('switches off an upstream row whose content fails the stricter checks, and caps its title', async () => {
    const tables = {
      saas_quick_replies: [] as Record<string, unknown>[],
      quick_replies: [
        legacy({
          title: 'T'.repeat(150),
          kind: 'interactive',
          content_text: null,
          interactive_payload: {
            kind: 'list',
            body: 'Menu',
            button_label: 'Open',
            // Two untitled sections: valid upstream, invalid for Meta.
            sections: [
              { rows: [{ id: 'a', title: 'A' }] },
              { rows: [{ id: 'b', title: 'B' }] },
            ],
          },
        }),
      ],
    };
    const r = await updateQuickReply(db(tables), ctx, 'legacy-1', {
      is_active: false,
    });
    expect(r.ok).toBe(true);
    expect(tables.saas_quick_replies[0]).toMatchObject({
      is_active: false,
      message_type: 'interactive',
    });
    expect((tables.saas_quick_replies[0].name as string).length).toBe(100);
  });

  it('is notFound for an unknown id', async () => {
    expect(
      await updateQuickReply(db(), ctx, 'nope', { name: 'x' })
    ).toMatchObject({ ok: false, error: 'notFound' });
  });
});

describe('deleteQuickReply / getQuickReplyItem', () => {
  it('deletes from whichever table holds the row, only in the caller’s account', async () => {
    const tables = {
      saas_quick_replies: [] as Record<string, unknown>[],
      quick_replies: [
        legacy(),
        legacy({ id: 'legacy-2', account_id: 'acct-2' }),
      ],
    };
    expect((await deleteQuickReply(db(tables), 'acct-1', 'legacy-1')).ok).toBe(
      true
    );
    expect(tables.quick_replies.map((r) => r.id)).toEqual(['legacy-2']);
    expect(
      await deleteQuickReply(db(tables), 'acct-1', 'legacy-2')
    ).toMatchObject({
      ok: false,
      error: 'notFound',
    });
  });

  it('finds an upstream row as an item', async () => {
    const r = await getQuickReplyItem(
      db({ quick_replies: [legacy()] }),
      'acct-1',
      'legacy-1'
    );
    expect(r.ok && r.value.source).toBe('legacy');
  });
});
