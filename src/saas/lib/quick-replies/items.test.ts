import { describe, expect, it } from 'vitest';

import type { QuickReply } from '@/types';
import { SAMPLE_TEXT } from '@/saas/lib/messages/fixtures';
import { legacyRowToItem, mergeQuickReplyItems, saasRowToItem } from './items';
import type { SaasQuickReplyRow } from './types';

const saasRow = (over: Partial<SaasQuickReplyRow> = {}): SaasQuickReplyRow => ({
  id: 's1',
  account_id: 'a',
  user_id: 'u',
  name: 'Welcome',
  message_type: 'text',
  payload: SAMPLE_TEXT.payload,
  is_active: true,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  ...over,
});

const legacyRow = (over: Partial<QuickReply> = {}): QuickReply => ({
  id: 'l1',
  account_id: 'a',
  user_id: 'u',
  title: 'Thanks',
  kind: 'text',
  content_text: 'Thanks for reaching out',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('quick reply items', () => {
  it('maps a SaaS row, with the stored form untouched and no resolved copy by default', () => {
    const item = saasRowToItem(saasRow());
    expect(item).toMatchObject({
      id: 's1',
      source: 'saas',
      name: 'Welcome',
      message_type: 'text',
      is_active: true,
      resolved: null,
    });
    expect(item.preview).toContain('{{contact.name}}');
  });

  it('resolves {{contact.*}} tokens when a contact is given', () => {
    const item = saasRowToItem(saasRow(), { name: 'Asha', phone: '+1555' });
    if (item.resolved?.message_type !== 'text') throw new Error('type');
    expect(item.resolved.payload.text.body).toContain('Hello Asha,');
    // The stored form keeps its tokens.
    if (item.message.message_type !== 'text') throw new Error('type');
    expect(item.message.payload.text.body).toContain('{{contact.name}}');
  });

  it('maps an upstream row, always active', () => {
    const item = legacyRowToItem(legacyRow());
    expect(item).toMatchObject({
      source: 'legacy',
      name: 'Thanks',
      message_type: 'text',
      is_active: true,
      preview: 'Thanks for reaching out',
    });
  });

  it('skips unusable upstream rows', () => {
    expect(legacyRowToItem(legacyRow({ content_text: null }))).toBeNull();
  });

  it('falls back to a type placeholder when a stored payload is malformed', () => {
    const item = saasRowToItem(saasRow({ payload: { type: 'text' } }));
    expect(item.preview).toBe('[text]');
  });

  it('merges both tables newest first', () => {
    const items = mergeQuickReplyItems(
      [saasRow({ id: 's-old', created_at: '2026-01-15T00:00:00Z' }), saasRow()],
      [legacyRow(), legacyRow({ id: 'l-bad', content_text: null })]
    );
    expect(items.map((i) => i.id)).toEqual(['s1', 's-old', 'l1']);
  });
});
