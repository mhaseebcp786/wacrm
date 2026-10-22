import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getT } from '@/lib/i18n/translate';
import { serviceErrorResponse } from '@/saas/lib/autoresponder/http';
import {
  createAutoresponder,
  listAutoresponders,
} from '@/saas/lib/autoresponder/service';

const t = getT('Api');

// Welcome & Away Messages: the account's automatic greetings. Reads go
// through the caller's RLS client (any member); writes need the agent role.

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const result = await listAutoresponders(supabase, accountId);
    if (!result.ok) return serviceErrorResponse(result, 'load');
    return NextResponse.json({ autoresponders: result.value });
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
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: t('common.invalidJson') },
      { status: 400 }
    );
  }

  const result = await createAutoresponder(supabaseAdmin(), ctx, {
    name: body.name,
    message: body.message,
    send_when: body.send_when,
    interval_days: body.interval_days,
    schedule: body.schedule,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
  });
  if (!result.ok) return serviceErrorResponse(result);
  return NextResponse.json({ autoresponder: result.value }, { status: 201 });
}
