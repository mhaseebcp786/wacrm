// ============================================================
// Quick-reply persistence (server only).
//
// Reads go through the caller's RLS client; writes use the service-role
// client after the route's role check, and every query is also filtered by
// `account_id` (the service role bypasses RLS) — the same split upstream's
// /api/quick-replies uses.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ContactTokens, MessageObject } from '@/saas/lib/messages/types';
import type { QuickReply } from '@/types';
import { legacyQuickReplyToMessage } from './legacy';
import { legacyRowToItem, mergeQuickReplyItems, saasRowToItem } from './items';
import {
  QUICK_REPLY_NAME_MAX,
  type QuickReplyIssue,
  type QuickReplyItem,
  type SaasQuickReplyRow,
} from './types';
import { validateQuickReplyMessage } from './validate';

export type ServiceError =
  | { error: 'nameRequired' }
  | { error: 'nameTooLong'; max: number }
  | { error: 'invalidMessage'; issues: QuickReplyIssue[] }
  | { error: 'notFound' }
  | { error: 'db'; message: string };

export type ServiceResult<T> =
  { ok: true; value: T } | ({ ok: false } & ServiceError);

const TABLE = 'saas_quick_replies';
const LEGACY_TABLE = 'quick_replies';

function fail<T>(e: ServiceError): ServiceResult<T> {
  return { ok: false, ...e };
}

function checkName(raw: unknown): ServiceResult<string> {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return fail({ error: 'nameRequired' });
  if (name.length > QUICK_REPLY_NAME_MAX) {
    return fail({ error: 'nameTooLong', max: QUICK_REPLY_NAME_MAX });
  }
  return { ok: true, value: name };
}

function checkMessage(input: unknown): ServiceResult<MessageObject> {
  const v = validateQuickReplyMessage(input);
  return v.ok
    ? { ok: true, value: v.message }
    : fail({ error: 'invalidMessage', issues: v.issues });
}

/** The conversation's contact, for `{{contact.*}}` resolution. */
async function contactTokens(
  db: SupabaseClient,
  accountId: string,
  conversationId: string
): Promise<ContactTokens | null> {
  const { data } = await db
    .from('conversations')
    .select('contact:contacts(name, phone)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle();
  const raw = (data as { contact?: unknown } | null)?.contact;
  const contact = (Array.isArray(raw) ? raw[0] : raw) as
    { name?: string | null; phone?: string | null } | null | undefined;
  return contact ? { name: contact.name, phone: contact.phone } : null;
}

export async function listQuickReplyItems(
  db: SupabaseClient,
  accountId: string,
  options: { conversationId?: string | null; activeOnly?: boolean } = {}
): Promise<ServiceResult<QuickReplyItem[]>> {
  const [saas, legacy] = await Promise.all([
    db.from(TABLE).select('*').eq('account_id', accountId),
    db.from(LEGACY_TABLE).select('*').eq('account_id', accountId),
  ]);
  if (saas.error) return fail({ error: 'db', message: saas.error.message });
  if (legacy.error) return fail({ error: 'db', message: legacy.error.message });

  // With a conversation, tokens are ALWAYS resolved (a missing contact
  // resolves them to empty text) so `resolved` is never null there and no
  // caller has to fall back to the raw stored form.
  const contact = options.conversationId
    ? ((await contactTokens(db, accountId, options.conversationId)) ?? {})
    : null;
  const items = mergeQuickReplyItems(
    (saas.data ?? []) as SaasQuickReplyRow[],
    (legacy.data ?? []) as QuickReply[],
    contact
  );
  return {
    ok: true,
    value: options.activeOnly ? items.filter((i) => i.is_active) : items,
  };
}

/** One reply from either table, or null. */
export async function getQuickReplyItem(
  db: SupabaseClient,
  accountId: string,
  id: string
): Promise<ServiceResult<QuickReplyItem>> {
  const saas = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (saas.error) return fail({ error: 'db', message: saas.error.message });
  if (saas.data) {
    return { ok: true, value: saasRowToItem(saas.data as SaasQuickReplyRow) };
  }
  const legacy = await db
    .from(LEGACY_TABLE)
    .select('*')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (legacy.error) return fail({ error: 'db', message: legacy.error.message });
  const item = legacy.data ? legacyRowToItem(legacy.data as QuickReply) : null;
  return item ? { ok: true, value: item } : fail({ error: 'notFound' });
}

export interface WriteContext {
  accountId: string;
  userId: string;
}

export async function createQuickReply(
  admin: SupabaseClient,
  ctx: WriteContext,
  input: { name: unknown; message: unknown; is_active?: boolean }
): Promise<ServiceResult<QuickReplyItem>> {
  const name = checkName(input.name);
  if (!name.ok) return name;
  const message = checkMessage(input.message);
  if (!message.ok) return message;

  const { data, error } = await admin
    .from(TABLE)
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      name: name.value,
      message_type: message.value.message_type,
      payload: message.value.payload,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error || !data) {
    return fail({ error: 'db', message: error?.message ?? 'insert failed' });
  }
  return { ok: true, value: saasRowToItem(data as SaasQuickReplyRow) };
}

export interface QuickReplyPatch {
  name?: unknown;
  message?: unknown;
  is_active?: boolean;
}

/**
 * Update a reply. An upstream (`quick_replies`) row is moved to
 * `saas_quick_replies` on its first edit through the new editor: the new row
 * is inserted first, then the old one removed, and the insert is rolled back
 * if the removal fails so a failed edit never leaves a duplicate.
 */
export async function updateQuickReply(
  admin: SupabaseClient,
  ctx: WriteContext,
  id: string,
  patch: QuickReplyPatch
): Promise<ServiceResult<QuickReplyItem>> {
  const update: Record<string, unknown> = {};
  let name: string | undefined;
  let message: MessageObject | undefined;

  if (patch.name !== undefined) {
    const n = checkName(patch.name);
    if (!n.ok) return n;
    name = n.value;
    update.name = name;
  }
  if (patch.message !== undefined) {
    const m = checkMessage(patch.message);
    if (!m.ok) return m;
    message = m.value;
    update.message_type = message.message_type;
    update.payload = message.payload;
  }
  if (typeof patch.is_active === 'boolean') update.is_active = patch.is_active;

  const existing = await admin
    .from(TABLE)
    .select('id')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (existing.error) {
    return fail({ error: 'db', message: existing.error.message });
  }

  if (existing.data) {
    if (Object.keys(update).length > 0) {
      const { error } = await admin
        .from(TABLE)
        .update(update)
        .eq('id', id)
        .eq('account_id', ctx.accountId);
      if (error) return fail({ error: 'db', message: error.message });
    }
    return getQuickReplyItem(admin, ctx.accountId, id);
  }

  // Not a SaaS row: try the upstream table.
  const legacy = await admin
    .from(LEGACY_TABLE)
    .select('*')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (legacy.error) return fail({ error: 'db', message: legacy.error.message });
  if (!legacy.data) return fail({ error: 'notFound' });

  const row = legacy.data as QuickReply;
  if (!message) {
    // Name/active-only edit of an upstream row: carry its content over
    // as it is. It is deliberately NOT re-validated: the row predates this
    // fork's stricter checks, and a switch-off or rename must not fail on
    // content the user did not touch (it is validated when sent).
    const carried = legacyQuickReplyToMessage(row);
    if (!carried) return fail({ error: 'notFound' });
    message = carried;
  }

  const created = await admin
    .from(TABLE)
    .insert({
      account_id: ctx.accountId,
      user_id: row.user_id ?? ctx.userId,
      // Upstream titles are unbounded; ours are capped at 100.
      name: name ?? row.title.trim().slice(0, QUICK_REPLY_NAME_MAX),
      message_type: message.message_type,
      payload: message.payload,
      is_active: typeof patch.is_active === 'boolean' ? patch.is_active : true,
      // Keep its place in the list.
      created_at: row.created_at,
    })
    .select()
    .single();
  if (created.error || !created.data) {
    return fail({
      error: 'db',
      message: created.error?.message ?? 'insert failed',
    });
  }

  const removed = await admin
    .from(LEGACY_TABLE)
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('id');
  // Zero rows deleted means a concurrent request already moved this row;
  // keeping our insert would leave two copies, so undo it.
  if (removed.error || !removed.data || removed.data.length === 0) {
    await admin
      .from(TABLE)
      .delete()
      .eq('id', (created.data as SaasQuickReplyRow).id)
      .eq('account_id', ctx.accountId);
    return removed.error
      ? fail({ error: 'db', message: removed.error.message })
      : fail({ error: 'notFound' });
  }
  return { ok: true, value: saasRowToItem(created.data as SaasQuickReplyRow) };
}

export async function deleteQuickReply(
  admin: SupabaseClient,
  accountId: string,
  id: string
): Promise<ServiceResult<true>> {
  for (const table of [TABLE, LEGACY_TABLE]) {
    const { data, error } = await admin
      .from(table)
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id');
    if (error) return fail({ error: 'db', message: error.message });
    if (data && data.length > 0) return { ok: true, value: true };
  }
  return fail({ error: 'notFound' });
}
