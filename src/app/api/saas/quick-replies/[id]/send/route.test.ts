import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@/lib/auth/account';
import { SendMessageError } from '@/lib/whatsapp/send-message';

const requireRole = vi.fn();
vi.mock('@/lib/auth/account', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/account')>()),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

const sendReply = vi.fn();
vi.mock('@/saas/lib/quick-replies/send', () => ({
  sendQuickReplyToConversation: (...a: unknown[]) => sendReply(...a),
}));

import { POST } from './route';

const ID = '3f2b8c1e-0a4d-4e0b-9c55-1f6a7d8e9b20';
const ctx = { supabase: {}, accountId: 'acct-1', userId: 'user-1' };
const call = (body: unknown, id = ID) =>
  POST(
    new Request('http://x/api/saas/quick-replies/s1/send', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(ctx);
  sendReply.mockReset();
});

describe('POST /api/saas/quick-replies/[id]/send', () => {
  it('requires the agent role and sends nothing for a viewer', async () => {
    requireRole.mockRejectedValue(new ForbiddenError());
    const res = await call({ conversation_id: 'c1' });
    expect(res.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith('agent');
    expect(sendReply).not.toHaveBeenCalled();
  });

  it('404s a malformed id without touching the database', async () => {
    expect((await call({ conversation_id: 'c1' }, 'nope')).status).toBe(404);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it('400s without a conversation id', async () => {
    expect((await call({})).status).toBe(400);
    expect((await call('not json')).status).toBe(400);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it('returns the message ids on success and forwards the quoted message', async () => {
    sendReply.mockResolvedValue({
      ok: true,
      value: { messageId: 'm1', whatsappMessageId: 'wamid.1' },
    });
    const res = await call({
      conversation_id: 'c1',
      reply_to_message_id: 'q1',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message_id: 'm1',
      whatsapp_message_id: 'wamid.1',
    });
    expect(sendReply).toHaveBeenCalledWith(ctx.supabase, 'acct-1', {
      id: ID,
      conversationId: 'c1',
      replyToMessageId: 'q1',
    });
  });

  it.each([
    [{ ok: false, error: 'notFound' }, 404],
    [{ ok: false, error: 'conversationNotFound' }, 404],
    [{ ok: false, error: 'inactive' }, 409],
    [{ ok: false, error: 'unsupported' }, 422],
    [
      {
        ok: false,
        error: 'invalidMessage',
        issues: [{ path: 'p', code: 'required' }],
      },
      422,
    ],
  ])('maps %j to HTTP %i', async (result, status) => {
    sendReply.mockResolvedValue(result);
    const res = await call({ conversation_id: 'c1' });
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    if ('issues' in result) expect(body.issues).toEqual(result.issues);
  });

  it('maps a Meta failure from the send core like /api/whatsapp/send does', async () => {
    sendReply.mockRejectedValue(
      new SendMessageError('meta_error', 'Meta API error: nope', 502)
    );
    const res = await call({ conversation_id: 'c1' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Meta API error: nope' });
  });
});
