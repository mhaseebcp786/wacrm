import { describe, expect, it } from 'vitest';

import { CLAIM_GAP_MS, SENDS_TABLE, claimSend } from './claim';
import { createFakeDb } from './fake-db';

const T0 = new Date('2026-03-02T12:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

const args = (now: Date, conversationId = 'conv-1') => ({
  accountId: 'acct-1',
  autoresponderId: 'rule-1',
  conversationId,
  now,
});

const setup = () => {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const db = createFakeDb(tables, {
    uniqueKeys: { [SENDS_TABLE]: ['autoresponder_id', 'conversation_id'] },
  });
  return { tables, db };
};

describe('claimSend', () => {
  it('lets the first caller claim and records it', async () => {
    const { db, tables } = setup();
    expect(await claimSend(db, args(T0))).toBe(true);
    expect(tables[SENDS_TABLE]).toEqual([
      expect.objectContaining({
        autoresponder_id: 'rule-1',
        conversation_id: 'conv-1',
        account_id: 'acct-1',
        last_sent_at: T0.toISOString(),
      }),
    ]);
  });

  it('refuses a second claim made at the same moment', async () => {
    const { db } = setup();
    expect(await claimSend(db, args(T0))).toBe(true);
    expect(await claimSend(db, args(T0))).toBe(false);
  });

  it('refuses a claim just inside the gap and accepts one just past it', async () => {
    const { db } = setup();
    await claimSend(db, args(T0));
    expect(await claimSend(db, args(later(CLAIM_GAP_MS - 1)))).toBe(false);
    expect(await claimSend(db, args(later(CLAIM_GAP_MS + 1)))).toBe(true);
  });

  it('moves the timestamp forward when a later claim takes over', async () => {
    const { db, tables } = setup();
    await claimSend(db, args(T0));
    const days3 = later(3 * 24 * 60 * 60 * 1000);
    expect(await claimSend(db, args(days3))).toBe(true);
    expect(tables[SENDS_TABLE]).toHaveLength(1);
    expect(tables[SENDS_TABLE][0].last_sent_at).toBe(days3.toISOString());
  });

  it('keeps conversations separate', async () => {
    const { db } = setup();
    expect(await claimSend(db, args(T0, 'conv-1'))).toBe(true);
    expect(await claimSend(db, args(T0, 'conv-2'))).toBe(true);
  });

  it('does not send when the guard table cannot be written', async () => {
    const db = createFakeDb(
      {},
      { failOn: (_table, op) => (op === 'insert' ? 'boom' : null) }
    );
    expect(await claimSend(db, args(T0))).toBe(false);
  });

  it('does not send when the existing claim cannot be taken over', async () => {
    const { db } = setup();
    await claimSend(db, args(T0));
    const broken = createFakeDb(
      {
        [SENDS_TABLE]: [
          { autoresponder_id: 'rule-1', conversation_id: 'conv-1' },
        ],
      },
      {
        uniqueKeys: { [SENDS_TABLE]: ['autoresponder_id', 'conversation_id'] },
        failOn: (_table, op) => (op === 'update' ? 'boom' : null),
      }
    );
    expect(await claimSend(broken, args(later(CLAIM_GAP_MS * 10)))).toBe(false);
  });
});

describe('claimSend with a minimum gap', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('a first-message rule (infinite gap) never claims twice, even years later', async () => {
    const { db } = setup();
    expect(
      await claimSend(db, { ...args(T0), minGapMs: Number.POSITIVE_INFINITY })
    ).toBe(true);
    expect(
      await claimSend(db, {
        ...args(later(1000 * DAY)),
        minGapMs: Number.POSITIVE_INFINITY,
      })
    ).toBe(false);
  });

  it('a repeating rule waits its own interval', async () => {
    const { db } = setup();
    await claimSend(db, { ...args(T0), minGapMs: 3 * DAY });
    expect(
      await claimSend(db, { ...args(later(2 * DAY)), minGapMs: 3 * DAY })
    ).toBe(false);
    expect(
      await claimSend(db, { ...args(later(3 * DAY + 1)), minGapMs: 3 * DAY })
    ).toBe(true);
  });

  it('never goes below the short race-guard gap', async () => {
    const { db } = setup();
    await claimSend(db, args(T0));
    expect(
      await claimSend(db, { ...args(later(CLAIM_GAP_MS - 1)), minGapMs: 0 })
    ).toBe(false);
  });
});
