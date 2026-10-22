import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, UnauthorizedError } from '@/lib/auth/account';

const getCurrentAccount = vi.fn();
const requireRole = vi.fn();
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  getCurrentAccount: (...a: unknown[]) => getCurrentAccount(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({ admin: true }),
}));

const listAutoresponders = vi.fn();
const createAutoresponder = vi.fn();
vi.mock('@/saas/lib/autoresponder/service', () => ({
  listAutoresponders: (...a: unknown[]) => listAutoresponders(...a),
  createAutoresponder: (...a: unknown[]) => createAutoresponder(...a),
}));

import { GET, POST } from './route';

const ctx = { supabase: { rls: true }, accountId: 'acct-1', userId: 'user-1' };
const post = (body: unknown) =>
  POST(
    new Request('http://x/api/saas/autoresponders', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  getCurrentAccount.mockReset().mockResolvedValue(ctx);
  requireRole.mockReset().mockResolvedValue(ctx);
  listAutoresponders.mockReset();
  createAutoresponder.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/saas/autoresponders', () => {
  it('lists the caller’s account through the RLS client', async () => {
    listAutoresponders.mockResolvedValue({ ok: true, value: [{ id: 'a' }] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ autoresponders: [{ id: 'a' }] });
    expect(listAutoresponders).toHaveBeenCalledWith(ctx.supabase, 'acct-1');
  });

  it('401s without a session', async () => {
    getCurrentAccount.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listAutoresponders).not.toHaveBeenCalled();
  });

  it('500s with a friendly message when the database fails', async () => {
    listAutoresponders.mockResolvedValue({
      ok: false,
      error: 'db',
      message: 'secret detail',
    });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
  });
});

describe('POST /api/saas/autoresponders', () => {
  const body = {
    name: 'Welcome',
    message: { message_type: 'text', payload: {} },
    send_when: 'after_inactivity',
    interval_days: 30,
    schedule: { days: [1], from: '09:00', to: '18:00', timezone: 'UTC' },
    is_active: false,
    ignored: 'x',
  };

  it('creates with the service-role client and requires the agent role', async () => {
    createAutoresponder.mockResolvedValue({ ok: true, value: { id: 'new' } });
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ autoresponder: { id: 'new' } });
    expect(requireRole).toHaveBeenCalledWith('agent');
    expect(createAutoresponder).toHaveBeenCalledWith({ admin: true }, ctx, {
      name: 'Welcome',
      message: body.message,
      send_when: 'after_inactivity',
      interval_days: 30,
      schedule: body.schedule,
      is_active: false,
    });
  });

  it('403s for a viewer, without writing', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    const res = await post(body);
    expect(res.status).toBe(403);
    expect(createAutoresponder).not.toHaveBeenCalled();
  });

  it('400s on a body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
    expect(createAutoresponder).not.toHaveBeenCalled();
  });

  it('400s with the machine-readable errors when the rule is invalid', async () => {
    createAutoresponder.mockResolvedValue({
      ok: false,
      error: 'invalid',
      errors: [{ code: 'nameRequired' }, { code: 'daysRequired' }],
    });
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors).toEqual([
      { code: 'nameRequired' },
      { code: 'daysRequired' },
    ]);
    expect(typeof json.error).toBe('string');
  });

  it('defaults is_active to “not given” so the service decides', async () => {
    createAutoresponder.mockResolvedValue({ ok: true, value: { id: 'new' } });
    await post({ name: 'x', message: {}, send_when: 'first_message' });
    expect(createAutoresponder.mock.calls[0][2].is_active).toBeUndefined();
  });
});
