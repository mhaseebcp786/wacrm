import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaApiError } from '@/lib/whatsapp/meta-api';
import {
  MessageValidationError,
  prepareMessage,
  sendMessageObject,
} from './send';
import { SAMPLE_TEXT } from './fixtures';

const args = {
  phoneNumberId: '123',
  accessToken: 'tok',
  to: '919876543210',
};

describe('prepareMessage', () => {
  it('personalizes then re-validates, so an over-long name fails before sending', () => {
    const near = {
      message_type: 'text',
      payload: {
        type: 'text',
        text: { body: `${'a'.repeat(4080)}{{contact.name}}` },
      },
    };
    expect(
      prepareMessage({ message: near, contact: { name: 'Bob' } })
    ).toBeTruthy();
    expect(() =>
      prepareMessage({ message: near, contact: { name: 'x'.repeat(50) } })
    ).toThrow(MessageValidationError);
  });

  it('throws MessageValidationError carrying the issues', () => {
    try {
      prepareMessage({ message: { message_type: 'nope', payload: {} } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MessageValidationError);
      expect((e as MessageValidationError).issues[0]).toEqual({
        path: 'message_type',
        code: 'invalidType',
      });
    }
  });
});

describe('sendMessageObject', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the personalized body and returns the Meta message id', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.OK' }] }), {
        status: 200,
      })
    );
    const result = await sendMessageObject({
      ...args,
      message: SAMPLE_TEXT,
      contact: { name: 'Asha' },
      contextMessageId: 'wamid.CTX',
    });
    expect(result).toEqual({ messageId: 'wamid.OK' });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.text.body).toBe(
      'Hello Asha, thanks for contacting Invicto Associates LLP.'
    );
    expect(sent.context).toEqual({ message_id: 'wamid.CTX' });
  });

  it('does not touch the network for an invalid message', async () => {
    await expect(
      sendMessageObject({
        ...args,
        message: {
          message_type: 'text',
          payload: { type: 'text', text: { body: '' } },
        },
      })
    ).rejects.toBeInstanceOf(MessageValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps a Meta error response to MetaApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Re-engagement message',
            code: 131047,
            fbtrace_id: 'T',
          },
        }),
        { status: 400 }
      )
    );
    await expect(
      sendMessageObject({ ...args, message: SAMPLE_TEXT })
    ).rejects.toMatchObject({
      name: 'MetaApiError',
      code: 131047,
      httpStatus: 400,
      message: 'Re-engagement message',
    });
    await expect(
      sendMessageObject({ ...args, message: SAMPLE_TEXT })
    ).rejects.toBeInstanceOf(MetaApiError);
  });
});
