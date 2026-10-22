import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getT } from '@/lib/i18n/translate';
import { serviceErrorResponse } from '@/saas/lib/autoresponder/http';
import {
  deleteAutoresponder,
  updateAutoresponder,
} from '@/saas/lib/autoresponder/service';
import { isUuid } from '@/saas/lib/quick-replies/ids';

const t = getT('Api');

// Edit / switch on-off / delete one Welcome & Away message. Sending only
// `is_active` is a plain switch; any other field re-saves the whole rule.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: t('saasAutoresponder.notFound') },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: t('common.invalidJson') },
      { status: 400 }
    );
  }

  const result = await updateAutoresponder(supabaseAdmin(), ctx, id, {
    name: body.name,
    message: body.message,
    send_when: body.send_when,
    interval_days: body.interval_days,
    schedule: body.schedule,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
  });
  if (!result.ok) return serviceErrorResponse(result);
  return NextResponse.json({ autoresponder: result.value });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: t('saasAutoresponder.notFound') },
      { status: 404 }
    );
  }

  const result = await deleteAutoresponder(supabaseAdmin(), ctx.accountId, id);
  if (!result.ok) return serviceErrorResponse(result);
  return NextResponse.json({ ok: true });
}
