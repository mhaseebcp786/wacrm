import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageToConversation = vi.fn();
vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: (...a: unknown[]) =>
    sendMessageToConversation(...a),
}));

import { MessageValidationError } from '@/saas/lib/messages/send';
import type { MessageObject } from '@/saas/lib/messages/types';
import { createFakeDb } from './fake-db';
import { UnsupportedMessageError, sendAutoresponderMessage } from './send';

const db = (contact: unknown = { name: 'Ada', phone: '+15551230000' }) =>
  createFakeDb({
    conversations: [{ id: 'conv-1', account_id: 'acct-1', contact }],
  });

const text = (body: string): MessageObject => ({
  message_type: 'text',
  payload: { type: 'text', text: { body } },
});

beforeEach(() => {
  sendMessageToConversation.mockReset().mockResolvedValue({
    messageId: 'm1',
    whatsappMessageId: 'w1',
  });
});

describe('sendAutoresponderMessage', () => {
  it('sends as a bot, with the contact’s name filled in', async () => {
    const client = db();
    const result = await sendAutoresponderMessage(
      client,
      'acct-1',
      'conv-1',
      text('Hi {{contact.name}}!')
    );
    expect(result).toEqual({ messageId: 'm1', whatsappMessageId: 'w1' });
    expect(sendMessageToConversation).toHaveBeenCalledWith(
      client,
      'acct-1',
      expect.objectContaining({
        conversationId: 'conv-1',
        messageType: 'text',
        contentText: 'Hi Ada!',
        senderType: 'bot',
      })
    );
  });

  it('never lets a token reach the customer when the contact is missing', async () => {
    await sendAutoresponderMessage(
      db(null),
      'acct-1',
      'conv-1',
      text('Hi {{contact.name}}!')
    );
    const params = sendMessageToConversation.mock.calls[0][2];
    expect(params.contentText).not.toContain('{{');
  });

  it('sends media with its link and caption', async () => {
    await sendAutoresponderMessage(db(), 'acct-1', 'conv-1', {
      message_type: 'image',
      payload: {
        type: 'image',
        image: { link: 'https://example.com/a.jpg', caption: 'Our shop' },
      },
    });
    expect(sendMessageToConversation.mock.calls[0][2]).toMatchObject({
      messageType: 'image',
      mediaUrl: 'https://example.com/a.jpg',
      contentText: 'Our shop',
      senderType: 'bot',
    });
  });

  it('carries a location through the structured payload', async () => {
    await sendAutoresponderMessage(db(), 'acct-1', 'conv-1', {
      message_type: 'location',
      payload: {
        type: 'location',
        location: { latitude: 12.97, longitude: 77.59, name: 'Shop' },
      },
    });
    expect(sendMessageToConversation.mock.calls[0][2]).toMatchObject({
      messageType: 'location',
      senderType: 'bot',
      interactivePayload: expect.objectContaining({ type: 'location' }),
    });
  });

  it('refuses a stored message that is no longer valid, before sending', async () => {
    await expect(
      sendAutoresponderMessage(db(), 'acct-1', 'conv-1', text(''))
    ).rejects.toBeInstanceOf(MessageValidationError);
    expect(sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('refuses a WhatsApp Flow button, which this fork cannot deliver', async () => {
    await expect(
      sendAutoresponderMessage(db(), 'acct-1', 'conv-1', {
        message_type: 'interactive',
        payload: {
          type: 'interactive',
          interactive: {
            type: 'flow',
            body: { text: 'Fill in the form' },
            action: {
              name: 'flow',
              parameters: { flow_id: '123', flow_cta: 'Open' },
            },
          },
        },
      } as MessageObject)
    ).rejects.toBeInstanceOf(UnsupportedMessageError);
    expect(sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('lets the send core’s failure reach the caller', async () => {
    sendMessageToConversation.mockRejectedValueOnce(new Error('Meta says no'));
    await expect(
      sendAutoresponderMessage(db(), 'acct-1', 'conv-1', text('Hi'))
    ).rejects.toThrow('Meta says no');
  });
});
