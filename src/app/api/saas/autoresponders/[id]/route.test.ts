import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@/lib/auth/account';

const requireRole = vi.fn();
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({ admin: true }),
}));

const updateAutoresponder = vi.fn();
const deleteAutoresponder = vi.fn();
vi.mock('@/saas/lib/autoresponder/service', () => ({
  updateAutoresponder: (...a: unknown[]) => updateAutoresponder(...a),
  deleteAutoresponder: (...a: unknown[]) => deleteAutoresponder(...a),
}));

import { DELETE, PATCH } from './route';

const ctx = { accountId: 'acct-1', userId: 'user-1' };
const ID = '0b3f5a52-6f5c-4c1a-9a53-6f2d8a8b9c10';
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = ID) =>
  PATCH(
    new Request(`http://x/api/saas/autoresponders/${id}`, {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params(id)
  );
const del = (id = ID) =>
  DELETE(
    new Request(`http://x/api/saas/autoresponders/${id}`, { method: 'DELETE' }),
    params(id)
  );

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(ctx);
  updateAutoresponder.mockReset();
  deleteAutoresponder.mockReset();
});

describe('PATCH /api/saas/autoresponders/[id]', () => {
  it('passes only the fields it knows to the service', async () => {
    updateAutoresponder.mockResolvedValue({ ok: true, value: { id: ID } });
    const res = await patch({ is_active: false, name: 'N', evil: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ autoresponder: { id: ID } });
    expect(requireRole).toHaveBeenCalledWith('agent');
    expect(updateAutoresponder).toHaveBeenCalledWith({ admin: true }, ctx, ID, {
      name: 'N',
      message: undefined,
      send_when: undefined,
      interval_days: undefined,
      schedule: undefined,
      is_active: false,
    });
  });

  it('keeps an explicit null schedule (“no longer limited to hours”)', async () => {
    updateAutoresponder.mockResolvedValue({ ok: true, value: { id: ID } });
    await patch({ schedule: null });
    expect(updateAutoresponder.mock.calls[0][3].schedule).toBeNull();
  });

  it('403s for a viewer', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    expect((await patch({ is_active: true })).status).toBe(403);
    expect(updateAutoresponder).not.toHaveBeenCalled();
  });

  it('404s for an id that is not a UUID, without touching the service', async () => {
    expect((await patch({ is_active: true }, 'abc')).status).toBe(404);
    expect(updateAutoresponder).not.toHaveBeenCalled();
  });

  it('400s on a body that is not JSON', async () => {
    expect((await patch('nope')).status).toBe(400);
  });

  it('404s when the rule is not in the caller’s account', async () => {
    updateAutoresponder.mockResolvedValue({ ok: false, error: 'notFound' });
    expect((await patch({ is_active: true })).status).toBe(404);
  });

  it('400s with the errors when the edit is invalid', async () => {
    updateAutoresponder.mockResolvedValue({
      ok: false,
      error: 'invalid',
      errors: [{ code: 'timesEqual' }],
    });
    const res = await patch({ schedule: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ code: 'timesEqual' }]);
  });
});

describe('DELETE /api/saas/autoresponders/[id]', () => {
  it('deletes within the caller’s account', async () => {
    deleteAutoresponder.mockResolvedValue({ ok: true, value: true });
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteAutoresponder).toHaveBeenCalledWith(
      { admin: true },
      'acct-1',
      ID
    );
  });

  it('403s for a viewer', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    expect((await del()).status).toBe(403);
    expect(deleteAutoresponder).not.toHaveBeenCalled();
  });

  it('404s for a bad id and for a rule that is not there', async () => {
    expect((await del('abc')).status).toBe(404);
    deleteAutoresponder.mockResolvedValue({ ok: false, error: 'notFound' });
    expect((await del()).status).toBe(404);
  });
});
