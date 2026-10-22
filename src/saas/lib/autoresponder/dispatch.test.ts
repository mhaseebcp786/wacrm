import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({}),
}));
vi.mock('./send', () => ({
  sendAutoresponderMessage: vi.fn(),
}));

import { SENDS_TABLE } from './claim';
import { runAutoresponders, type InboundForAutoresponder } from './dispatch';
import { createFakeDb, type FakeDbOptions } from './fake-db';
import type { SaasAutoresponderRow } from './types';

const DAY = 24 * 60 * 60 * 1000;
// Monday 2026-03-02 12:00 UTC.
const NOW = new Date('2026-03-02T12:00:00.000Z');

const text = (body: string) => ({
  type: 'text',
  text: { body },
});

const rule = (
  over: Partial<SaasAutoresponderRow> = {}
): SaasAutoresponderRow => ({
  id: 'rule-1',
  account_id: 'acct-1',
  user_id: 'user-1',
  name: 'Welcome',
  message_type: 'text',
  payload: text('Welcome!'),
  send_when: 'first_message',
  interval_days: null,
  schedule_days: null,
  schedule_from: null,
  schedule_to: null,
  timezone: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const customerMessage = (createdAt: Date, id = 'm-prev') => ({
  id,
  conversation_id: 'conv-1',
  sender_type: 'customer',
  created_at: createdAt.toISOString(),
});

const input = (over: Partial<InboundForAutoresponder> = {}) => ({
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  inboundAt: NOW,
  consumed: false,
  ...over,
});

const setup = (
  data: {
    rules?: SaasAutoresponderRow[];
    messages?: Record<string, unknown>[];
    sends?: Record<string, unknown>[];
    broadcasts?: Record<string, unknown>[];
  } = {},
  failOn?: FakeDbOptions['failOn']
) => {
  const tables: Record<string, Record<string, unknown>[]> = {
    saas_autoresponders: (data.rules ?? []) as unknown as Record<
      string,
      unknown
    >[],
    messages: data.messages ?? [],
    broadcast_recipients: data.broadcasts ?? [],
    [SENDS_TABLE]: data.sends ?? [],
  };
  const db = createFakeDb(tables, {
    uniqueKeys: { [SENDS_TABLE]: ['autoresponder_id', 'conversation_id'] },
    failOn,
  });
  const send = vi.fn(async () => ({ messageId: 'x', whatsappMessageId: 'w' }));
  const run = (over: Partial<InboundForAutoresponder> = {}) =>
    runAutoresponders(input(over), { db, send, now: () => NOW });
  return { tables, db, send, run };
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runAutoresponders', () => {
  it('sends a first-message rule to a brand-new customer', async () => {
    const { send, run, db } = setup({ rules: [rule()] });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(db, 'acct-1', 'conv-1', {
      message_type: 'text',
      payload: text('Welcome!'),
    });
  });

  it('does nothing when a Flow or waiting automation already took the message', async () => {
    const { send, run } = setup({ rules: [rule()] });
    await run({ consumed: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing without switched-on rules', async () => {
    const { send, run } = setup({ rules: [rule({ is_active: false })] });
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores another account’s rules', async () => {
    const { send, run } = setup({ rules: [rule({ account_id: 'acct-2' })] });
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not greet a customer who has written before (first-message rule)', async () => {
    const { send, run } = setup({
      rules: [rule()],
      messages: [customerMessage(new Date(NOW.getTime() - 400 * DAY))],
    });
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  describe('a conversation the business started', () => {
    const outbound = (sender: string, daysAgo: number) => ({
      id: 'm-out',
      conversation_id: 'conv-1',
      sender_type: sender,
      created_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    });

    it('is not a stranger’s first message: an agent wrote first', async () => {
      const { send, run } = setup({
        rules: [rule()],
        messages: [outbound('agent', 1)],
      });
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('is not a first message when our own bot wrote earlier', async () => {
      const { send, run } = setup({
        rules: [rule()],
        messages: [outbound('bot', 1)],
      });
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('is not a first message when the contact was sent a broadcast (broadcasts are not stored as messages)', async () => {
      const { send, run } = setup({
        rules: [rule()],
        broadcasts: [
          {
            contact_id: 'contact-1',
            sent_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
          },
        ],
      });
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('a broadcast to someone else does not count', async () => {
      const { send, run } = setup({
        rules: [rule()],
        broadcasts: [
          {
            contact_id: 'contact-2',
            sent_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
          },
        ],
      });
      await run();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('welcome-back counts the quiet from our last contact', async () => {
      const back = rule({
        id: 'rule-back',
        send_when: 'after_inactivity',
        interval_days: 30,
      });
      const recent = setup({ rules: [back], messages: [outbound('agent', 5)] });
      await recent.run();
      expect(recent.send).not.toHaveBeenCalled();

      const old = setup({ rules: [back], messages: [outbound('agent', 40)] });
      await old.run();
      expect(old.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('a live agent', () => {
    const agentSaid = (minutesAgo: number) => ({
      id: 'm-agent',
      conversation_id: 'conv-1',
      sender_type: 'agent',
      created_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    });
    const away = rule({
      id: 'rule-away',
      send_when: 'every_n_days',
      interval_days: 1,
    });

    it('is not interrupted by an automatic note while they are in the conversation', async () => {
      const { send, run } = setup({
        rules: [away],
        messages: [agentSaid(10)],
      });
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('once the agent has been quiet for over 30 minutes the note can go out', async () => {
      const { send, run } = setup({
        rules: [away],
        messages: [agentSaid(31)],
      });
      await run();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  it('only looks at this conversation’s history', async () => {
    const { send, run } = setup({
      rules: [rule()],
      messages: [
        {
          ...customerMessage(new Date(NOW.getTime() - DAY)),
          conversation_id: 'conv-other',
        },
      ],
    });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  describe('welcome back', () => {
    const back = rule({
      id: 'rule-back',
      send_when: 'after_inactivity',
      interval_days: 30,
    });

    it('greets a customer back after enough silence, and records the send', async () => {
      const { send, run, tables } = setup({
        rules: [back],
        messages: [customerMessage(new Date(NOW.getTime() - 31 * DAY))],
      });
      await run();
      expect(send).toHaveBeenCalledTimes(1);
      expect(tables[SENDS_TABLE]).toHaveLength(1);
    });

    it('stays quiet when the customer wrote recently', async () => {
      const { send, run } = setup({
        rules: [back],
        messages: [customerMessage(new Date(NOW.getTime() - 29 * DAY))],
      });
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('measures silence from the latest earlier message, not the oldest', async () => {
      const { send, run } = setup({
        rules: [back],
        messages: [
          customerMessage(new Date(NOW.getTime() - 100 * DAY), 'm-old'),
          customerMessage(new Date(NOW.getTime() - 2 * DAY), 'm-new'),
        ],
      });
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('greets again the next time after another stretch of silence', async () => {
      const { send, run, tables } = setup({
        rules: [back],
        messages: [customerMessage(new Date(NOW.getTime() - 31 * DAY))],
        sends: [
          {
            autoresponder_id: 'rule-back',
            conversation_id: 'conv-1',
            account_id: 'acct-1',
            last_sent_at: new Date(NOW.getTime() - 31 * DAY).toISOString(),
          },
        ],
      });
      await run();
      expect(send).toHaveBeenCalledTimes(1);
      expect(tables[SENDS_TABLE]).toHaveLength(1);
      expect(tables[SENDS_TABLE][0].last_sent_at).toBe(NOW.toISOString());
    });
  });

  describe('schedule', () => {
    // Mon–Fri nights 18:00–09:00 UTC.
    const away = rule({
      id: 'rule-away',
      name: 'Away',
      payload: text('We are away'),
      schedule_days: [1, 2, 3, 4, 5],
      schedule_from: '18:00',
      schedule_to: '09:00',
      timezone: 'UTC',
    });

    it('sends inside the window', async () => {
      const { send, run } = setup({ rules: [away] });
      await run({ inboundAt: new Date('2026-03-02T22:00:00Z') });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('stays quiet outside the window', async () => {
      const { send, run } = setup({ rules: [away] });
      await run({ inboundAt: new Date('2026-03-02T12:00:00Z') });
      expect(send).not.toHaveBeenCalled();
    });

    it('judges the time the customer wrote, not the time we processed it', async () => {
      const { send, run } = setup({ rules: [away] });
      // Written 17:59, but "now" is inside the window.
      await run({ inboundAt: new Date('2026-03-02T17:59:00Z') });
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('several rules', () => {
    it('sends only one message: the rule with set hours beats the always-on one', async () => {
      const welcome = rule({ id: 'welcome', payload: text('Welcome') });
      const away = rule({
        id: 'away',
        payload: text('Away'),
        created_at: '2026-02-01T00:00:00.000Z',
        schedule_days: [1],
        schedule_from: '10:00',
        schedule_to: '14:00',
        timezone: 'UTC',
      });
      const { send, run } = setup({ rules: [welcome, away] });
      await run();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(expect.anything(), 'acct-1', 'conv-1', {
        message_type: 'text',
        payload: text('Away'),
      });
    });
  });

  describe('safety', () => {
    it('sends once when two messages of a new customer arrive in the same second', async () => {
      const { send, run } = setup({ rules: [rule()] });
      await Promise.all([run(), run()]);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('does not send a second time after a failed send for the same moment', async () => {
      const { send, run, tables } = setup({ rules: [rule()] });
      send.mockRejectedValueOnce(new Error('Meta is down'));
      await run();
      await run();
      // The first attempt failed; the repeat is the same customer message
      // being processed again, and it must not turn into a second attempt.
      expect(send).toHaveBeenCalledTimes(1);
      expect(tables[SENDS_TABLE]).toHaveLength(1);
    });

    it('logs and swallows a failed send instead of throwing', async () => {
      const { send, run } = setup({ rules: [rule()] });
      send.mockRejectedValueOnce(new Error('Meta is down'));
      await expect(run()).resolves.toBe(false);
      expect(console.error).toHaveBeenCalled();
    });

    it('does nothing when the rules cannot be loaded', async () => {
      const { send, run } = setup({ rules: [rule()] }, (table) =>
        table === 'saas_autoresponders' ? 'db down' : null
      );
      await run();
      expect(send).not.toHaveBeenCalled();
    });

    it('says nothing when the customer’s history cannot be read', async () => {
      const { send, run } = setup({ rules: [rule()] }, (table) =>
        table === 'messages' ? 'db down' : null
      );
      await run();
      expect(send).not.toHaveBeenCalled();
    });
  });
});

describe('runAutoresponders — every few days (away note)', () => {
  const away = rule({
    id: 'rule-away',
    name: 'Away',
    payload: text('We are closed'),
    send_when: 'every_n_days',
    interval_days: 3,
  });
  const sentAt = (daysAgo: number) => ({
    autoresponder_id: 'rule-away',
    conversation_id: 'conv-1',
    account_id: 'acct-1',
    last_sent_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  });

  it('answers a regular customer who wrote an hour ago and was never told', async () => {
    const { send, run } = setup({
      rules: [away],
      messages: [customerMessage(new Date(NOW.getTime() - 3_600_000))],
    });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not repeat within the interval, and repeats after it', async () => {
    const recent = setup({
      rules: [away],
      messages: [customerMessage(new Date(NOW.getTime() - 3_600_000))],
      sends: [sentAt(2)],
    });
    await recent.run();
    expect(recent.send).not.toHaveBeenCalled();

    const old = setup({
      rules: [away],
      messages: [customerMessage(new Date(NOW.getTime() - 3_600_000))],
      sends: [sentAt(4)],
    });
    await old.run();
    expect(old.send).toHaveBeenCalledTimes(1);
    expect(old.tables[SENDS_TABLE][0].last_sent_at).toBe(NOW.toISOString());
  });

  it('while the away note is cooling down, another rule can still answer', async () => {
    const welcome = rule({ id: 'rule-welcome', payload: text('Welcome') });
    const { send, run } = setup({ rules: [away, welcome], sends: [sentAt(1)] });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.anything(), 'acct-1', 'conv-1', {
      message_type: 'text',
      payload: text('Welcome'),
    });
  });
});

describe('runAutoresponders — safety nets', () => {
  it('tells the caller whether a greeting went out', async () => {
    const yes = setup({ rules: [rule()] });
    expect(await yes.run()).toBe(true);
    const no = setup({ rules: [] });
    expect(await no.run()).toBe(false);
    const consumed = setup({ rules: [rule()] });
    expect(await consumed.run({ consumed: true })).toBe(false);
  });

  it('does not greet a message that is more than 10 minutes old (a late Meta retry)', async () => {
    const stale = setup({ rules: [rule()] });
    await stale.run({ inboundAt: new Date(NOW.getTime() - 11 * 60_000) });
    expect(stale.send).not.toHaveBeenCalled();

    const fresh = setup({ rules: [rule()] });
    await fresh.run({ inboundAt: new Date(NOW.getTime() - 9 * 60_000) });
    expect(fresh.send).toHaveBeenCalledTimes(1);
  });

  it('a retry of an old first message cannot welcome the customer a second time', async () => {
    // The welcome was sent long ago, then the same first message is delivered
    // again (no earlier customer message is visible to it).
    const { send, run } = setup({
      rules: [rule()],
      sends: [
        {
          autoresponder_id: 'rule-1',
          conversation_id: 'conv-1',
          account_id: 'acct-1',
          last_sent_at: new Date(NOW.getTime() - 5 * DAY).toISOString(),
        },
      ],
    });
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  it('says nothing when it cannot read what it already sent', async () => {
    const { send, run } = setup({ rules: [rule()] }, (table) =>
      table === SENDS_TABLE ? 'db down' : null
    );
    await run();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('runAutoresponders — more safety nets', () => {
  it('does not greet when the message timestamp is unreadable', async () => {
    const { send, run } = setup({ rules: [rule()] });
    await run({ inboundAt: new Date('not a date') });
    expect(send).not.toHaveBeenCalled();
  });

  it('a welcome-back rule still fires right at the N-day boundary despite processing delay', async () => {
    const back = rule({
      id: 'rule-back',
      send_when: 'after_inactivity',
      interval_days: 30,
    });
    // Greeted 30 days minus 5 minutes ago (processing delay), and the customer
    // has now been silent for exactly 30 days from their own last message.
    const { send, run } = setup({
      rules: [back],
      messages: [customerMessage(new Date(NOW.getTime() - 30 * DAY))],
      sends: [
        {
          autoresponder_id: 'rule-back',
          conversation_id: 'conv-1',
          account_id: 'acct-1',
          last_sent_at: new Date(
            NOW.getTime() - 30 * DAY + 5 * 60_000
          ).toISOString(),
        },
      ],
    });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
