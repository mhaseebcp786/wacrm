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

const updateQuickReply = vi.fn();
const deleteQuickReply = vi.fn();
vi.mock('@/saas/lib/quick-replies/service', () => ({
  updateQuickReply: (...a: unknown[]) => updateQuickReply(...a),
  deleteQuickReply: (...a: unknown[]) => deleteQuickReply(...a),
}));

import { DELETE, PATCH } from './route';

const ID = '3f2b8c1e-0a4d-4e0b-9c55-1f6a7d8e9b20';
const ctx = { supabase: {}, accountId: 'acct-1', userId: 'user-1' };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = ID) =>
  PATCH(
    new Request(`http://x/api/saas/quick-replies/${id}`, {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params(id)
  );
const del = (id = ID) =>
  DELETE(
    new Request(`http://x/api/saas/quick-replies/${id}`, { method: 'DELETE' }),
    params(id)
  );

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(ctx);
  updateQuickReply.mockReset();
  deleteQuickReply.mockReset();
});

describe('PATCH /api/saas/quick-replies/[id]', () => {
  it('requires the agent role', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    expect((await patch({ name: 'x' })).status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith('agent');
    expect(updateQuickReply).not.toHaveBeenCalled();
  });

  it('404s a malformed id without touching the database', async () => {
    expect((await patch({ name: 'x' }, 'not-a-uuid')).status).toBe(404);
    expect(updateQuickReply).not.toHaveBeenCalled();
  });

  it('400s a body that is not JSON', async () => {
    expect((await patch('nope')).status).toBe(400);
  });

  it('updates and returns the (possibly moved) reply, passing only the booleans it understands', async () => {
    updateQuickReply.mockResolvedValue({ ok: true, value: { id: 'moved' } });
    const res = await patch({ name: 'New', is_active: 'yes' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ quick_reply: { id: 'moved' } });
    expect(updateQuickReply).toHaveBeenCalledWith({ admin: true }, ctx, ID, {
      name: 'New',
      message: undefined,
      is_active: undefined,
    });
  });

  it('maps a missing reply to 404', async () => {
    updateQuickReply.mockResolvedValue({ ok: false, error: 'notFound' });
    expect((await patch({ name: 'x' })).status).toBe(404);
  });
});

describe('DELETE /api/saas/quick-replies/[id]', () => {
  it('requires the agent role', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    expect((await del()).status).toBe(403);
    expect(deleteQuickReply).not.toHaveBeenCalled();
  });

  it('404s a malformed id', async () => {
    expect((await del('nope')).status).toBe(404);
    expect(deleteQuickReply).not.toHaveBeenCalled();
  });

  it('deletes within the caller’s account', async () => {
    deleteQuickReply.mockResolvedValue({ ok: true, value: true });
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteQuickReply).toHaveBeenCalledWith(
      { admin: true },
      'acct-1',
      ID
    );
  });

  it('maps a missing reply to 404', async () => {
    deleteQuickReply.mockResolvedValue({ ok: false, error: 'notFound' });
    expect((await del()).status).toBe(404);
  });
});
