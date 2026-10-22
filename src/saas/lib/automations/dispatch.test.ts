import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({}),
}));

import {
  dispatchSaasAutomationTriggers,
  type InboundForSaasTriggers,
} from './dispatch';

interface Row {
  id: string;
  account_id: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
}

const row = (
  trigger_type: string,
  trigger_config: Record<string, unknown> = {},
  id = `${trigger_type}-1`
): Row => ({ id, account_id: 'acct-1', trigger_type, trigger_config });

/** The one query the dispatcher makes: select().eq().eq().in(). */
function fakeDb(rows: Row[], error: { message: string } | null = null) {
  const calls: { in?: [string, string[]]; eq: [string, unknown][] } = {
    eq: [],
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (k: string, v: unknown) => (calls.eq.push([k, v]), builder),
    in: (k: string, v: string[]) => {
      calls.in = [k, v];
      return Promise.resolve({
        data: error ? null : rows.filter((r) => v.includes(r.trigger_type)),
        error,
      });
    },
  };
  return {
    db: { from: () => builder } as unknown as SupabaseClient,
    calls,
  };
}

const run = vi.fn(async () => undefined);

const text = (body: string) => ({ type: 'text', text: { body } });
const buttonTap = (title: string, id = 'b1') => ({
  type: 'interactive',
  interactive: { type: 'button_reply', button_reply: { id, title } },
});

const input = (
  over: Partial<InboundForSaasTriggers> = {}
): InboundForSaasTriggers => ({
  accountId: 'acct-1',
  contactId: 'contact-1',
  conversationId: 'conv-1',
  consumed: false,
  isFirstInboundMessage: false,
  message: text('hello'),
  inboundText: 'hello',
  ...over,
});

const fired = () =>
  run.mock.calls.map(
    (c) => (c as unknown as [{ triggerType: string }])[0].triggerType
  );

async function dispatch(
  rows: Row[],
  over: Partial<InboundForSaasTriggers> = {}
) {
  const { db } = fakeDb(rows);
  return dispatchSaasAutomationTriggers(input(over), {
    db,
    run: run as never,
  });
}

beforeEach(() => {
  run.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('dispatchSaasAutomationTriggers — which automations it asks for', () => {
  it('queries the account’s active message-reacting automations only', async () => {
    const { db, calls } = fakeDb([]);
    await dispatchSaasAutomationTriggers(input(), { db, run: run as never });
    expect(calls.eq).toEqual([
      ['account_id', 'acct-1'],
      ['is_active', true],
    ]);
    expect(calls.in?.[0]).toBe('trigger_type');
    expect([...(calls.in?.[1] ?? [])].sort()).toEqual(
      [
        'anything_else',
        'button_reply',
        'catalog_order',
        'first_inbound_message',
        'flow_response',
        'interactive_reply',
        'keyword_match',
        'list_reply',
        'meta_ads_ctwa',
      ].sort()
    );
  });

  it('does nothing and reports not handled when no automation reacts', async () => {
    expect(await dispatch([])).toEqual({ handled: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('does nothing when a Flow or a waiting automation already took the message', async () => {
    const { db, calls } = fakeDb([row('anything_else')]);
    const result = await dispatchSaasAutomationTriggers(
      input({ consumed: true }),
      { db, run: run as never }
    );
    expect(result).toEqual({ handled: false });
    expect(run).not.toHaveBeenCalled();
    expect(calls.in).toBeUndefined();
  });

  it('fails soft when the query fails', async () => {
    const { db } = fakeDb([], { message: 'boom' });
    const result = await dispatchSaasAutomationTriggers(input(), {
      db,
      run: run as never,
    });
    expect(result).toEqual({ handled: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('never throws, even when the engine does', async () => {
    const { db } = fakeDb([row('anything_else')]);
    const boom = vi.fn(async () => {
      throw new Error('engine down');
    });
    await expect(
      dispatchSaasAutomationTriggers(input(), { db, run: boom as never })
    ).resolves.toEqual({ handled: false });
  });
});

describe('dispatchSaasAutomationTriggers — the extra triggers', () => {
  it('runs button_reply for a matching tap and passes the signals along', async () => {
    const result = await dispatch([row('button_reply', { text: 'Book now' })], {
      message: buttonTap('book NOW'),
      inboundText: 'book NOW',
      interactiveReplyId: 'b1',
    });
    expect(result).toEqual({ handled: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      accountId: 'acct-1',
      triggerType: 'button_reply',
      contactId: 'contact-1',
      context: {
        message_text: 'book NOW',
        conversation_id: 'conv-1',
        interactive_reply_id: 'b1',
        saas: { tap: 'button', replyTitle: 'book NOW' },
      },
    });
  });

  it('does not run button_reply when the text differs', async () => {
    const result = await dispatch([row('button_reply', { text: 'Book now' })], {
      message: buttonTap('Cancel'),
      inboundText: 'Cancel',
      interactiveReplyId: 'b2',
    });
    expect(result).toEqual({ handled: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('runs flow_response, meta_ads_ctwa and catalog_order for their messages', async () => {
    await dispatch([row('flow_response')], {
      message: {
        type: 'interactive',
        interactive: { type: 'nfm_reply', nfm_reply: {} },
      },
    });
    await dispatch([row('meta_ads_ctwa')], {
      message: { ...text('hi'), referral: { source_id: 'ad-1' } },
    });
    await dispatch([row('catalog_order', { product_ids: ['sku-1'] })], {
      message: {
        type: 'order',
        order: { product_items: [{ product_retailer_id: 'sku-1' }] },
      },
    });
    expect(fired()).toEqual([
      'flow_response',
      'meta_ads_ctwa',
      'catalog_order',
    ]);
  });

  it('can run several of them for one message (an ad click that is also a first message)', async () => {
    await dispatch([row('meta_ads_ctwa'), row('anything_else')], {
      message: { ...text('hi'), referral: { source_id: 'ad-1' } },
    });
    // The ad automation picked the message up, so the fallback stays quiet.
    expect(fired()).toEqual(['meta_ads_ctwa']);
  });
});

describe('dispatchSaasAutomationTriggers — the fallback', () => {
  it('runs for an ordinary message nothing else picked up', async () => {
    const result = await dispatch([row('anything_else')]);
    expect(result).toEqual({ handled: true });
    expect(fired()).toEqual(['anything_else']);
  });

  it('runs for a photo or other non-text content', async () => {
    await dispatch([row('anything_else')], {
      message: { type: 'image', image: { id: 'x' } },
      inboundText: '',
    });
    expect(fired()).toEqual(['anything_else']);
  });

  it('stays quiet when a keyword automation matches the message', async () => {
    const keyword = row('keyword_match', {
      keywords: ['price'],
      match_type: 'contains',
    });
    expect(
      await dispatch([keyword, row('anything_else')], {
        message: text('what is the price'),
        inboundText: 'what is the price',
      })
    ).toEqual({ handled: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('runs when a keyword automation exists but does not match', async () => {
    const keyword = row('keyword_match', {
      keywords: ['price'],
      match_type: 'contains',
    });
    await dispatch([keyword, row('anything_else')]);
    expect(fired()).toEqual(['anything_else']);
  });

  it('stays quiet on a first message when a first-message automation exists, not otherwise', async () => {
    const rows = [row('first_inbound_message'), row('anything_else')];
    await dispatch(rows, { isFirstInboundMessage: true });
    expect(run).not.toHaveBeenCalled();
    await dispatch(rows, { isFirstInboundMessage: false });
    expect(fired()).toEqual(['anything_else']);
  });

  it('never answers a tap, a form or an order (they answer something we sent)', async () => {
    await dispatch([row('anything_else')], {
      message: buttonTap('Stop promotions'),
      inboundText: 'Stop promotions',
      interactiveReplyId: 'stop',
    });
    await dispatch([row('anything_else')], {
      message: {
        type: 'interactive',
        interactive: { type: 'nfm_reply', nfm_reply: {} },
      },
    });
    await dispatch([row('anything_else')], {
      message: { type: 'order', order: { product_items: [] } },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('is not stopped by a new-message automation, which runs for everything', async () => {
    // The stand-in filters on the `in()` list, so this row only gets through
    // if the dispatcher asks for it.
    const result = await dispatch([
      row('new_message_received'),
      row('new_contact_created'),
      row('anything_else'),
    ]);
    expect(result.handled).toBe(true);
    expect(fired()).toEqual(['anything_else']);
  });

  it('stays quiet when a Welcome & Away message was just sent', async () => {
    const result = await dispatch([row('anything_else')], { greeted: true });
    expect(result).toEqual({ handled: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('stays quiet for system and other non-content message types', async () => {
    for (const type of ['system', 'unsupported', 'request_welcome']) {
      await dispatch([row('anything_else')], {
        message: { type },
        inboundText: `[Unsupported message type: ${type}]`,
      });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('stays quiet for a Meta address form, which is not a Flow form either', async () => {
    await dispatch([row('flow_response'), row('anything_else')], {
      message: {
        type: 'interactive',
        interactive: {
          type: 'nfm_reply',
          nfm_reply: { name: 'address_message', response_json: '{}' },
        },
      },
    });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('dispatchSaasAutomationTriggers — more tap and order shapes', () => {
  it('runs list_reply for a chosen list row, not button_reply', async () => {
    await dispatch(
      [row('list_reply', { text: 'Sofas' }), row('button_reply')],
      {
        message: {
          type: 'interactive',
          interactive: {
            type: 'list_reply',
            list_reply: { id: 'r1', title: 'Sofas' },
          },
        },
        inboundText: 'Sofas',
        interactiveReplyId: 'r1',
      }
    );
    expect(fired()).toEqual(['list_reply']);
  });

  it('runs button_reply for a template quick-reply button', async () => {
    await dispatch([row('button_reply', { text: 'Stop promotions' })], {
      message: {
        type: 'button',
        button: { text: 'Stop promotions', payload: 'STOP' },
      },
      inboundText: 'Stop promotions',
      interactiveReplyId: 'STOP',
    });
    expect(fired()).toEqual(['button_reply']);
  });

  it('matches product ids typed with stray spaces', async () => {
    await dispatch([row('catalog_order', { product_ids: [' sku-1 '] })], {
      message: {
        type: 'order',
        order: { product_items: [{ product_retailer_id: 'sku-1' }] },
      },
    });
    expect(fired()).toEqual(['catalog_order']);
  });
});
