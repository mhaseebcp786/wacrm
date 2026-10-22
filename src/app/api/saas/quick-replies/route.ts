import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getT } from '@/lib/i18n/translate';
import { serviceErrorResponse } from '@/saas/lib/quick-replies/http';
import {
  createQuickReply,
  listQuickReplyItems,
} from '@/saas/lib/quick-replies/service';

const t = getT('Api');

// Suggested replies — the new, all-message-types successor of
// /api/quick-replies. GET merges this table with upstream's rows; with
// `?conversation_id=` each item also carries `resolved`, the message with
// that contact's {{contact.*}} tokens filled in. `?active_only=1` hides
// switched-off replies (the inbox picker).

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const params = new URL(request.url).searchParams;
    const result = await listQuickReplyItems(supabase, accountId, {
      conversationId: params.get('conversation_id'),
      activeOnly: params.get('active_only') === '1',
    });
    if (!result.ok) return serviceErrorResponse(result, 'load');
    return NextResponse.json({ quick_replies: result.value });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: t('common.invalidJson') },
      { status: 400 }
    );
  }

  const result = await createQuickReply(supabaseAdmin(), ctx, {
    name: body.name,
    message: body.message,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
  });
  if (!result.ok) return serviceErrorResponse(result);
  return NextResponse.json({ quick_reply: result.value }, { status: 201 });
}
