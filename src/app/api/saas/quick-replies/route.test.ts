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

const listQuickReplyItems = vi.fn();
const createQuickReply = vi.fn();
vi.mock('@/saas/lib/quick-replies/service', () => ({
  listQuickReplyItems: (...a: unknown[]) => listQuickReplyItems(...a),
  createQuickReply: (...a: unknown[]) => createQuickReply(...a),
}));

import { GET, POST } from './route';

const ctx = { supabase: { rls: true }, accountId: 'acct-1', userId: 'user-1' };
const post = (body: unknown) =>
  POST(
    new Request('http://x/api/saas/quick-replies', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  getCurrentAccount.mockReset().mockResolvedValue(ctx);
  requireRole.mockReset().mockResolvedValue(ctx);
  listQuickReplyItems.mockReset();
  createQuickReply.mockReset();
});

describe('GET /api/saas/quick-replies', () => {
  it('lists for the caller’s account through the RLS client and forwards the filters', async () => {
    listQuickReplyItems.mockResolvedValue({ ok: true, value: [{ id: 'a' }] });
    const res = await GET(
      new Request(
        'http://x/api/saas/quick-replies?conversation_id=c1&active_only=1'
      )
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ quick_replies: [{ id: 'a' }] });
    expect(listQuickReplyItems).toHaveBeenCalledWith(ctx.supabase, 'acct-1', {
      conversationId: 'c1',
      activeOnly: true,
    });
  });

  it('defaults to every reply and no conversation', async () => {
    listQuickReplyItems.mockResolvedValue({ ok: true, value: [] });
    await GET(new Request('http://x/api/saas/quick-replies'));
    expect(listQuickReplyItems).toHaveBeenCalledWith(ctx.supabase, 'acct-1', {
      conversationId: null,
      activeOnly: false,
    });
  });

  it('401s without a session', async () => {
    getCurrentAccount.mockRejectedValue(new UnauthorizedError());
    const res = await GET(new Request('http://x/api/saas/quick-replies'));
    expect(res.status).toBe(401);
    expect(listQuickReplyItems).not.toHaveBeenCalled();
  });

  it('reports a failed load as a load problem, not a save problem', async () => {
    listQuickReplyItems.mockResolvedValue({
      ok: false,
      error: 'db',
      message: 'boom',
    });
    const res = await GET(new Request('http://x/api/saas/quick-replies'));
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toMatch(/load/i);
    expect(error).not.toMatch(/boom/);
  });
});

describe('POST /api/saas/quick-replies', () => {
  it('requires the agent role and writes nothing for a viewer', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    const res = await post({ name: 'x', message: {} });
    expect(res.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith('agent');
    expect(createQuickReply).not.toHaveBeenCalled();
  });

  it('400s a body that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400);
    expect(createQuickReply).not.toHaveBeenCalled();
  });

  it('creates with the service-role client, the caller’s identity and the given fields', async () => {
    createQuickReply.mockResolvedValue({ ok: true, value: { id: 'new' } });
    const res = await post({
      name: 'Welcome',
      message: { message_type: 'text' },
      is_active: false,
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ quick_reply: { id: 'new' } });
    expect(createQuickReply).toHaveBeenCalledWith({ admin: true }, ctx, {
      name: 'Welcome',
      message: { message_type: 'text' },
      is_active: false,
    });
  });

  it('returns the validator issues for an invalid message', async () => {
    const issues = [{ path: 'payload.text.body', code: 'required' }];
    createQuickReply.mockResolvedValue({
      ok: false,
      error: 'invalidMessage',
      issues,
    });
    const res = await post({ name: 'x', message: {} });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toEqual(issues);
    expect(typeof body.error).toBe('string');
  });
});
