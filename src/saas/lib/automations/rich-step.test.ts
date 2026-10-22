import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({ __db: true }),
}));
vi.mock('@/saas/lib/autoresponder/send', () => ({
  sendAutoresponderMessage: h.send,
}));

import {
  blankRichMessageConfig,
  looksLikeMessageObject,
  richMessagePreview,
} from './rich-config';
import { runRichMessageStep } from './rich-step';
import { validateRichMessageStep } from './rich-validate';

const text = (body: string) => ({
  message_type: 'text',
  payload: { type: 'text', text: { body } },
});

const photoWithButtons = {
  message_type: 'interactive',
  payload: {
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'image', image: { link: 'https://example.com/a.jpg' } },
      body: { text: 'Pick one' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'a', title: 'Browse sofas' } },
          { type: 'reply', reply: { id: 'b', title: 'Talk to a person' } },
        ],
      },
    },
  },
};

beforeEach(() => {
  h.send.mockReset();
  h.send.mockResolvedValue({ messageId: 'm-1', whatsappMessageId: 'wamid.1' });
});

describe('runRichMessageStep', () => {
  it('sends the stored message into the conversation and reports the wamid', async () => {
    const detail = await runRichMessageStep(text('Hi {{contact.name}}'), {
      accountId: 'acct-1',
      conversationId: 'conv-1',
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    const [db, account, conversation, message] = h.send.mock.calls[0];
    expect(db).toEqual({ __db: true });
    expect(account).toBe('acct-1');
    expect(conversation).toBe('conv-1');
    expect(message.message_type).toBe('text');
    expect(detail).toBe('text sent via Meta (wamid.1)');
  });

  it('sends a photo with buttons, which the plain buttons step cannot', async () => {
    const detail = await runRichMessageStep(photoWithButtons, {
      accountId: 'acct-1',
      conversationId: 'conv-1',
    });
    expect(detail).toBe('interactive sent via Meta (wamid.1)');
  });

  it('fails the step with the reason, without sending, when the message is invalid', async () => {
    await expect(
      runRichMessageStep(text(''), { accountId: 'a', conversationId: 'c' })
    ).rejects.toThrow(/./);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('fails the step when the config is not a message object at all', async () => {
    await expect(
      runRichMessageStep(
        { text: 'old style' },
        { accountId: 'a', conversationId: 'c' }
      )
    ).rejects.toThrow(/./);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('lets a send refusal fail the step', async () => {
    h.send.mockRejectedValue(new Error('outside the 24-hour window'));
    await expect(
      runRichMessageStep(text('Hi'), { accountId: 'a', conversationId: 'c' })
    ).rejects.toThrow('outside the 24-hour window');
  });
});

describe('validateRichMessageStep', () => {
  it('accepts a valid message', () => {
    expect(validateRichMessageStep(text('Hello'), 'steps[0]')).toEqual([]);
    expect(validateRichMessageStep(photoWithButtons, 'steps[0]')).toEqual([]);
  });

  it('reports each problem with a path under the step and a readable message', () => {
    const issues = validateRichMessageStep(text(''), 'steps[2]');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].path.startsWith('steps[2]')).toBe(true);
    expect(issues[0].message.length).toBeGreaterThan(0);
  });

  it('rejects an empty or foreign step_config', () => {
    expect(validateRichMessageStep({}, 'steps[0]').length).toBeGreaterThan(0);
    expect(
      validateRichMessageStep({ text: 'old' }, 'steps[0]').length
    ).toBeGreaterThan(0);
  });
});

describe('rich-config helpers', () => {
  it('a blank step is an empty text message that fails validation until filled in', () => {
    const blank = blankRichMessageConfig();
    expect(looksLikeMessageObject(blank)).toBe(true);
    expect(validateRichMessageStep(blank, 'steps[0]').length).toBeGreaterThan(
      0
    );
  });

  it('previews the human text, a placeholder for media, and nothing for junk', () => {
    expect(richMessagePreview(text('  Hello there '))).toBe('Hello there');
    expect(richMessagePreview(photoWithButtons)).toBe('Pick one');
    expect(
      richMessagePreview({
        message_type: 'image',
        payload: {
          type: 'image',
          image: { link: 'https://example.com/a.jpg' },
        },
      })
    ).toBe('[image]');
    expect(richMessagePreview(blankRichMessageConfig())).toBe('');
    expect(richMessagePreview({ text: 'old' })).toBe('');
    expect(richMessagePreview(null)).toBe('');
    // Looks like a message but its payload is broken: no throw.
    expect(richMessagePreview({ message_type: 'carousel', payload: {} })).toBe(
      ''
    );
  });
});
