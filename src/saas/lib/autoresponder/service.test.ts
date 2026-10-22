import { describe, expect, it } from 'vitest';

import { createFakeDb } from './fake-db';
import {
  TABLE,
  createAutoresponder,
  deleteAutoresponder,
  getAutoresponder,
  listAutoresponders,
  updateAutoresponder,
} from './service';

const ctx = { accountId: 'acct-1', userId: 'user-1' };

const message = (body: string) => ({
  message_type: 'text',
  payload: { type: 'text', text: { body } },
});

const valid = {
  name: 'Welcome',
  message: message('Hi {{contact.name}}'),
  send_when: 'first_message',
  schedule: null,
};

const schedule = {
  days: [1, 2, 3],
  from: '18:00',
  to: '09:00',
  timezone: 'Asia/Kolkata',
};

const setup = (rows: Record<string, unknown>[] = []) => {
  const tables = { [TABLE]: rows };
  return { tables, db: createFakeDb(tables) };
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  account_id: 'acct-1',
  user_id: 'user-1',
  name: 'Existing',
  message_type: 'text',
  payload: message('Hello').payload,
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

describe('createAutoresponder', () => {
  it('stores a first-message rule for the caller’s account', async () => {
    const { db, tables } = setup();
    const r = await createAutoresponder(db, ctx, valid);
    expect(r.ok).toBe(true);
    expect(tables[TABLE]).toEqual([
      expect.objectContaining({
        account_id: 'acct-1',
        user_id: 'user-1',
        name: 'Welcome',
        message_type: 'text',
        send_when: 'first_message',
        interval_days: null,
        schedule_days: null,
        timezone: null,
        is_active: true,
      }),
    ]);
  });

  it('stores the schedule columns and the day count of a welcome-back rule', async () => {
    const { db, tables } = setup();
    const r = await createAutoresponder(db, ctx, {
      ...valid,
      send_when: 'after_inactivity',
      interval_days: 14,
      schedule,
      is_active: false,
    });
    expect(r.ok && r.value.schedule).toEqual(schedule);
    expect(tables[TABLE][0]).toEqual(
      expect.objectContaining({
        send_when: 'after_inactivity',
        interval_days: 14,
        schedule_days: [1, 2, 3],
        schedule_from: '18:00',
        schedule_to: '09:00',
        timezone: 'Asia/Kolkata',
        is_active: false,
      })
    );
  });

  it('refuses an invalid rule without writing anything', async () => {
    const { db, tables } = setup();
    const r = await createAutoresponder(db, ctx, { ...valid, name: '' });
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
    expect(tables[TABLE]).toEqual([]);
  });

  it('reports a database failure', async () => {
    const tables = { [TABLE]: [] };
    const db = createFakeDb(tables, {
      failOn: (_t, op) => (op === 'insert' ? 'disk full' : null),
    });
    expect(await createAutoresponder(db, ctx, valid)).toEqual({
      ok: false,
      error: 'db',
      message: 'disk full',
    });
  });
});

describe('listAutoresponders / getAutoresponder', () => {
  it('lists only this account’s rules, newest first', async () => {
    const { db } = setup([
      row({ id: 'old', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ id: 'new', created_at: '2026-02-01T00:00:00.000Z' }),
      row({ id: 'other', account_id: 'acct-2' }),
    ]);
    const r = await listAutoresponders(db, 'acct-1');
    expect(r.ok && r.value.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('maps stored columns to a schedule', async () => {
    const { db } = setup([
      row({
        schedule_days: [7, 6],
        schedule_from: '10:00',
        schedule_to: '12:00',
        timezone: 'UTC',
      }),
    ]);
    const r = await getAutoresponder(db, 'acct-1', 'r1');
    expect(r.ok && r.value.schedule).toEqual({
      days: [6, 7],
      from: '10:00',
      to: '12:00',
      timezone: 'UTC',
    });
  });

  it('does not return another account’s rule', async () => {
    const { db } = setup([row({ account_id: 'acct-2' })]);
    expect(await getAutoresponder(db, 'acct-1', 'r1')).toEqual({
      ok: false,
      error: 'notFound',
    });
  });
});

describe('updateAutoresponder', () => {
  it('only switches the rule on/off when just is_active is sent', async () => {
    // A rule whose stored message no longer validates can still be switched off.
    const { db, tables } = setup([
      row({ payload: { type: 'text', text: {} } }),
    ]);
    const r = await updateAutoresponder(db, ctx, 'r1', { is_active: false });
    expect(r.ok).toBe(true);
    expect(tables[TABLE][0].is_active).toBe(false);
    expect(tables[TABLE][0].name).toBe('Existing');
  });

  it('keeps the stored fields it was not given', async () => {
    const { db, tables } = setup([row()]);
    const r = await updateAutoresponder(db, ctx, 'r1', { name: 'Renamed' });
    expect(r.ok && r.value.name).toBe('Renamed');
    expect(tables[TABLE][0].payload).toEqual(message('Hello').payload);
  });

  it('adds a schedule, then clears it with null', async () => {
    const { db } = setup([row()]);
    const added = await updateAutoresponder(db, ctx, 'r1', { schedule });
    expect(added.ok && added.value.schedule).toEqual(schedule);
    const cleared = await updateAutoresponder(db, ctx, 'r1', {
      schedule: null,
    });
    expect(cleared.ok && cleared.value.schedule).toBeNull();
  });

  it('turning a welcome rule into welcome-back needs a day count', async () => {
    const { db } = setup([row()]);
    const bad = await updateAutoresponder(db, ctx, 'r1', {
      send_when: 'after_inactivity',
    });
    expect(bad).toMatchObject({ ok: false, error: 'invalid' });
    const good = await updateAutoresponder(db, ctx, 'r1', {
      send_when: 'after_inactivity',
      interval_days: 7,
    });
    expect(good.ok && good.value.interval_days).toBe(7);
  });

  it('turning welcome-back into first-message drops the day count', async () => {
    const { db, tables } = setup([
      row({ send_when: 'after_inactivity', interval_days: 7 }),
    ]);
    await updateAutoresponder(db, ctx, 'r1', { send_when: 'first_message' });
    expect(tables[TABLE][0].interval_days).toBeNull();
  });

  it('validates the whole result, not just the changed field', async () => {
    const { db, tables } = setup([row()]);
    const r = await updateAutoresponder(db, ctx, 'r1', {
      schedule: { ...schedule, timezone: 'Nowhere/City' },
    });
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
    expect(tables[TABLE][0].timezone).toBeNull();
  });

  it('cannot touch another account’s rule', async () => {
    const { db, tables } = setup([row({ account_id: 'acct-2' })]);
    const r = await updateAutoresponder(db, ctx, 'r1', { name: 'Hijack' });
    expect(r).toMatchObject({ ok: false, error: 'notFound' });
    expect(tables[TABLE][0].name).toBe('Existing');
  });

  it('returns the rule unchanged for an empty patch', async () => {
    const { db } = setup([row()]);
    const r = await updateAutoresponder(db, ctx, 'r1', {});
    expect(r.ok && r.value.name).toBe('Existing');
  });
});

describe('deleteAutoresponder', () => {
  it('deletes this account’s rule', async () => {
    const { db, tables } = setup([row()]);
    expect(await deleteAutoresponder(db, 'acct-1', 'r1')).toEqual({
      ok: true,
      value: true,
    });
    expect(tables[TABLE]).toEqual([]);
  });

  it('reports not found for another account’s rule and leaves it', async () => {
    const { db, tables } = setup([row({ account_id: 'acct-2' })]);
    expect(await deleteAutoresponder(db, 'acct-1', 'r1')).toMatchObject({
      ok: false,
      error: 'notFound',
    });
    expect(tables[TABLE]).toHaveLength(1);
  });
});
