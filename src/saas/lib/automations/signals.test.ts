import { describe, expect, it } from 'vitest';

import { extractInboundSignals } from './signals';

describe('extractInboundSignals', () => {
  it('reads the title of a tapped reply button', () => {
    expect(
      extractInboundSignals({
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'b1', title: 'Yes please' },
        },
      })
    ).toEqual({ tap: 'button', replyTitle: 'Yes please' });
  });

  it('reads the title of a chosen list row', () => {
    expect(
      extractInboundSignals({
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: { id: 'r1', title: 'Sofas', description: 'x' },
        },
      })
    ).toEqual({ tap: 'list', replyTitle: 'Sofas' });
  });

  it('treats a template quick-reply tap as a button tap (label, else payload)', () => {
    expect(
      extractInboundSignals({
        type: 'button',
        button: { text: 'Stop promotions', payload: 'STOP' },
      })
    ).toEqual({ tap: 'button', replyTitle: 'Stop promotions' });
    expect(
      extractInboundSignals({ type: 'button', button: { payload: 'STOP' } })
    ).toEqual({ tap: 'button', replyTitle: 'STOP' });
  });

  it('flags a submitted WhatsApp Flow (nfm_reply) without reading the answers', () => {
    expect(
      extractInboundSignals({
        type: 'interactive',
        interactive: {
          type: 'nfm_reply',
          nfm_reply: { name: 'flow', response_json: '{"flow_token":"t"}' },
        },
      })
    ).toEqual({ flowResponse: true });
  });

  it('collects the retailer ids of a catalogue order', () => {
    expect(
      extractInboundSignals({
        type: 'order',
        order: {
          catalog_id: 'c',
          product_items: [
            { product_retailer_id: 'sku-1', quantity: 2 },
            { product_retailer_id: ' ' },
            { quantity: 1 },
            { product_retailer_id: 'sku-2' },
          ],
        },
      })
    ).toEqual({ order: { productIds: ['sku-1', 'sku-2'] } });
  });

  it('still reports an order with no readable items', () => {
    expect(extractInboundSignals({ type: 'order', order: {} })).toEqual({
      order: { productIds: [] },
    });
  });

  it('reads the Click-to-WhatsApp referral off a text message', () => {
    expect(
      extractInboundSignals({
        type: 'text',
        text: { body: 'Hi' },
        referral: {
          source_id: 'ad-9',
          source_type: 'ad',
          headline: 'Sofa sale',
          ctwa_clid: 'ignored',
        },
      })
    ).toEqual({
      adReferral: {
        sourceId: 'ad-9',
        sourceType: 'ad',
        headline: 'Sofa sale',
      },
    });
  });

  it('returns nothing for a plain message and for junk input', () => {
    expect(
      extractInboundSignals({ type: 'text', text: { body: 'hi' } })
    ).toEqual({});
    expect(extractInboundSignals(null)).toEqual({});
    expect(extractInboundSignals('x')).toEqual({});
    expect(extractInboundSignals({ type: 'interactive' })).toEqual({});
  });
});
