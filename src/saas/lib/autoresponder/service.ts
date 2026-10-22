// ============================================================
// Welcome & Away rule persistence (server only).
//
// Reads go through the caller's RLS client; writes use the service-role
// client after the route's role check, and every query is also filtered by
// `account_id` (the service role bypasses RLS) — the same split the
// suggested-replies service uses.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { rowToItem } from './items';
import {
  type AutoresponderError,
  type AutoresponderInput,
  type AutoresponderItem,
  type SaasAutoresponderRow,
} from './types';
import { validateAutoresponder } from './validate';

export type ServiceError =
  | { error: 'invalid'; errors: AutoresponderError[] }
  | { error: 'notFound' }
  | { error: 'db'; message: string };

export type ServiceResult<T> =
  { ok: true; value: T } | ({ ok: false } & ServiceError);

export const TABLE = 'saas_autoresponders';

function fail<T>(e: ServiceError): ServiceResult<T> {
  return { ok: false, ...e };
}

/** Columns written for the validated fields of a rule. */
function toColumns(input: AutoresponderInput) {
  return {
    name: input.name,
    message_type: input.message.message_type,
    payload: input.message.payload,
    send_when: input.send_when,
    interval_days: input.interval_days,
    schedule_days: input.schedule?.days ?? null,
    schedule_from: input.schedule?.from ?? null,
    schedule_to: input.schedule?.to ?? null,
    timezone: input.schedule?.timezone ?? null,
  };
}

/** Newest first, like the suggested-replies list. */
export async function listAutoresponders(
  db: SupabaseClient,
  accountId: string
): Promise<ServiceResult<AutoresponderItem[]>> {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId);
  if (error) return fail({ error: 'db', message: error.message });
  const items = ((data ?? []) as SaasAutoresponderRow[]).map(rowToItem);
  return {
    ok: true,
    value: items.sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export async function getAutoresponder(
  db: SupabaseClient,
  accountId: string,
  id: string
): Promise<ServiceResult<AutoresponderItem>> {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) return fail({ error: 'db', message: error.message });
  if (!data) return fail({ error: 'notFound' });
  return { ok: true, value: rowToItem(data as SaasAutoresponderRow) };
}

export interface WriteContext {
  accountId: string;
  userId: string;
}

export interface AutoresponderBody {
  name?: unknown;
  message?: unknown;
  send_when?: unknown;
  interval_days?: unknown;
  schedule?: unknown;
  is_active?: boolean;
}

export async function createAutoresponder(
  admin: SupabaseClient,
  ctx: WriteContext,
  body: AutoresponderBody
): Promise<ServiceResult<AutoresponderItem>> {
  const checked = validateAutoresponder(body);
  if (!checked.ok) return fail({ error: 'invalid', errors: checked.errors });

  const { data, error } = await admin
    .from(TABLE)
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      ...toColumns(checked.value),
      is_active: body.is_active ?? true,
    })
    .select()
    .single();
  if (error || !data) {
    return fail({ error: 'db', message: error?.message ?? 'insert failed' });
  }
  return { ok: true, value: rowToItem(data as SaasAutoresponderRow) };
}

const CONTENT_FIELDS = [
  'name',
  'message',
  'send_when',
  'interval_days',
  'schedule',
] as const;

/**
 * Update a rule. Any content field present means "re-save the rule": the
 * stored rule is overlaid with what was sent and the WHOLE result is
 * validated again, so a half-edit can never leave a rule that fails the
 * checks. Sending only `is_active` is a plain switch and skips validation, so
 * a rule can always be switched off.
 */
export async function updateAutoresponder(
  admin: SupabaseClient,
  ctx: WriteContext,
  id: string,
  body: AutoresponderBody
): Promise<ServiceResult<AutoresponderItem>> {
  const existing = await getAutoresponder(admin, ctx.accountId, id);
  if (!existing.ok) return existing;

  const update: Record<string, unknown> = {};
  if (CONTENT_FIELDS.some((f) => body[f] !== undefined)) {
    const current = existing.value;
    const checked = validateAutoresponder({
      name: body.name ?? current.name,
      message: body.message ?? current.message,
      send_when: body.send_when ?? current.send_when,
      interval_days:
        body.interval_days !== undefined
          ? body.interval_days
          : current.interval_days,
      // `null` is a real value here: "no longer limited to hours".
      schedule: body.schedule !== undefined ? body.schedule : current.schedule,
    });
    if (!checked.ok) return fail({ error: 'invalid', errors: checked.errors });
    Object.assign(update, toColumns(checked.value));
  }
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active;

  if (Object.keys(update).length === 0) return existing;

  const { error } = await admin
    .from(TABLE)
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId);
  if (error) return fail({ error: 'db', message: error.message });
  return getAutoresponder(admin, ctx.accountId, id);
}

export async function deleteAutoresponder(
  admin: SupabaseClient,
  accountId: string,
  id: string
): Promise<ServiceResult<true>> {
  const { data, error } = await admin
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)
    .select('id');
  if (error) return fail({ error: 'db', message: error.message });
  if (!data || data.length === 0) return fail({ error: 'notFound' });
  return { ok: true, value: true };
}
