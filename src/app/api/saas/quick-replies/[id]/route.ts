import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getT } from '@/lib/i18n/translate';
import { serviceErrorResponse } from '@/saas/lib/quick-replies/http';
import { isUuid } from '@/saas/lib/quick-replies/ids';
import {
  deleteQuickReply,
  updateQuickReply,
} from '@/saas/lib/quick-replies/service';

const t = getT('Api');

// Edit / delete one suggested reply. `id` may belong to either table; an
// upstream row edited here is moved to saas_quick_replies (the response
// carries the new id, so the client reloads its list).

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
      { error: t('saasQuickReplies.notFound') },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: t('common.invalidJson') },
      { status: 400 }
    );
  }

  const result = await updateQuickReply(supabaseAdmin(), ctx, id, {
    name: body.name,
    message: body.message,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
  });
  if (!result.ok) return serviceErrorResponse(result);
  return NextResponse.json({ quick_reply: result.value });
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
      { error: t('saasQuickReplies.notFound') },
      { status: 404 }
    );
  }

  const result = await deleteQuickReply(supabaseAdmin(), ctx.accountId, id);
  if (!result.ok) return serviceErrorResponse(result);
  return NextResponse.json({ ok: true });
}
