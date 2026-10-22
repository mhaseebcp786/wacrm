import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SAMPLE_CTA, SAMPLE_TEXT } from '@/saas/lib/messages/fixtures';
import { createFakeDb } from './fake-db';

const sendCore = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: (...args: unknown[]) => sendCore(...args),
}));

import { sendQuickReplyToConversation } from './send';

const row = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  account_id: 'acct-1',
  name: 'Welcome',
  message_type: 'text',
  payload: SAMPLE_TEXT.payload,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

function setup(saas = [row()]) {
  return createFakeDb({
    saas_quick_replies: saas,
    quick_replies: [],
    conversations: [
      {
        id: 'conv-1',
        account_id: 'acct-1',
        contact: { name: 'Asha', phone: '+15550001' },
      },
    ],
  });
}

beforeEach(() => {
  sendCore.mockReset();
  sendCore.mockResolvedValue({ messageId: 'm1', whatsappMessageId: 'wamid.1' });
});

describe('sendQuickReplyToConversation', () => {
  it('fills the contact tokens before handing the message to the send core', async () => {
    const r = await sendQuickReplyToConversation(setup(), 'acct-1', {
      id: 's1',
      conversationId: 'conv-1',
      replyToMessageId: 'msg-9',
    });
    expect(r.ok).toBe(true);
    const [, accountId, params] = sendCore.mock.calls[0] as [
      unknown,
      string,
      Record<string, unknown>,
    ];
    expect(accountId).toBe('acct-1');
    expect(params).toMatchObject({
      conversationId: 'conv-1',
      messageType: 'text',
      replyToMessageId: 'msg-9',
    });
    expect(params.contentText).toContain('Hello Asha,');
    expect(params.contentText).not.toContain('{{');
  });

  it('sends a link button as the rich_interactive extension type', async () => {
    const r = await sendQuickReplyToConversation(
      setup([
        row({ message_type: 'interactive', payload: SAMPLE_CTA.payload }),
      ]),
      'acct-1',
      { id: 's1', conversationId: 'conv-1' }
    );
    expect(r.ok).toBe(true);
    expect(sendCore.mock.calls[0][2]).toMatchObject({
      messageType: 'rich_interactive',
    });
  });

  it('does not send an unknown, switched-off or cross-account reply', async () => {
    expect(
      await sendQuickReplyToConversation(setup(), 'acct-1', {
        id: 'missing',
        conversationId: 'conv-1',
      })
    ).toEqual({ ok: false, error: 'notFound' });
    expect(
      await sendQuickReplyToConversation(
        setup([row({ is_active: false })]),
        'acct-1',
        {
          id: 's1',
          conversationId: 'conv-1',
        }
      )
    ).toEqual({ ok: false, error: 'inactive' });
    expect(
      await sendQuickReplyToConversation(setup(), 'acct-2', {
        id: 's1',
        conversationId: 'conv-1',
      })
    ).toEqual({ ok: false, error: 'notFound' });
    expect(sendCore).not.toHaveBeenCalled();
  });

  it('does not send into a conversation of another account', async () => {
    const r = await sendQuickReplyToConversation(setup(), 'acct-1', {
      id: 's1',
      conversationId: 'conv-other',
    });
    expect(r).toEqual({ ok: false, error: 'conversationNotFound' });
    expect(sendCore).not.toHaveBeenCalled();
  });

  it('reports an invalid stored message instead of sending it', async () => {
    const r = await sendQuickReplyToConversation(
      setup([row({ payload: { type: 'text', text: { body: '' } } })]),
      'acct-1',
      { id: 's1', conversationId: 'conv-1' }
    );
    expect(r).toMatchObject({ ok: false, error: 'invalidMessage' });
    expect(sendCore).not.toHaveBeenCalled();
  });

  it('reports a message the core cannot deliver as unsupported', async () => {
    const flow = {
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: 'x' },
        action: {
          name: 'flow',
          parameters: { flow_id: '1', flow_cta: 'Open' },
        },
      },
    };
    const r = await sendQuickReplyToConversation(
      setup([row({ message_type: 'interactive', payload: flow })]),
      'acct-1',
      { id: 's1', conversationId: 'conv-1' }
    );
    expect(r).toEqual({ ok: false, error: 'unsupported' });
    expect(sendCore).not.toHaveBeenCalled();
  });
});
