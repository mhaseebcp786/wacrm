import { describe, expect, it } from 'vitest';

import { saasTriggerMatches, validateSaasTrigger } from './triggers';
import type { SaasInboundSignals } from './types';

const auto = (trigger_type: string, trigger_config: unknown = {}) => ({
  trigger_type,
  trigger_config,
});

const button = (replyTitle?: string): SaasInboundSignals => ({
  tap: 'button',
  replyTitle,
});
const list = (replyTitle?: string): SaasInboundSignals => ({
  tap: 'list',
  replyTitle,
});

describe('saasTriggerMatches', () => {
  it('leaves upstream triggers alone (null)', () => {
    expect(saasTriggerMatches(auto('keyword_match'), {})).toBeNull();
    expect(
      saasTriggerMatches(auto('interactive_reply'), button('x'))
    ).toBeNull();
    expect(saasTriggerMatches(auto('nonsense'), {})).toBeNull();
  });

  describe('button_reply', () => {
    it('matches any button when the text is blank or absent', () => {
      expect(saasTriggerMatches(auto('button_reply'), button('Yes'))).toBe(
        true
      );
      expect(
        saasTriggerMatches(auto('button_reply', { text: '  ' }), button('Yes'))
      ).toBe(true);
    });

    it('matches the text exactly, ignoring case and surrounding spaces', () => {
      const a = auto('button_reply', { text: ' Book Now ' });
      expect(saasTriggerMatches(a, button('book now'))).toBe(true);
      expect(saasTriggerMatches(a, button('Book now please'))).toBe(false);
      expect(saasTriggerMatches(a, button('Book'))).toBe(false);
    });

    it('does not match a list row, plain text, or a button without a label', () => {
      const a = auto('button_reply', { text: 'Yes' });
      expect(saasTriggerMatches(a, list('Yes'))).toBe(false);
      expect(saasTriggerMatches(a, {})).toBe(false);
      expect(saasTriggerMatches(a, undefined)).toBe(false);
      expect(saasTriggerMatches(a, button(undefined))).toBe(false);
      // Blank config still needs an actual button tap.
      expect(saasTriggerMatches(auto('button_reply'), {})).toBe(false);
    });
  });

  describe('list_reply', () => {
    it('matches a list row by text, or any row when blank', () => {
      expect(
        saasTriggerMatches(auto('list_reply', { text: 'sofas' }), list('Sofas'))
      ).toBe(true);
      expect(
        saasTriggerMatches(auto('list_reply', { text: 'beds' }), list('Sofas'))
      ).toBe(false);
      expect(saasTriggerMatches(auto('list_reply'), list('Anything'))).toBe(
        true
      );
    });

    it('does not match a button tap', () => {
      expect(saasTriggerMatches(auto('list_reply'), button('Sofas'))).toBe(
        false
      );
    });
  });

  it('flow_response matches only a submitted form', () => {
    expect(
      saasTriggerMatches(auto('flow_response'), { flowResponse: true })
    ).toBe(true);
    expect(saasTriggerMatches(auto('flow_response'), button('x'))).toBe(false);
    expect(saasTriggerMatches(auto('flow_response'), undefined)).toBe(false);
  });

  it('meta_ads_ctwa matches only a message that came from an ad', () => {
    expect(
      saasTriggerMatches(auto('meta_ads_ctwa'), {
        adReferral: { sourceId: 'a' },
      })
    ).toBe(true);
    expect(saasTriggerMatches(auto('meta_ads_ctwa'), {})).toBe(false);
  });

  describe('catalog_order', () => {
    const order: SaasInboundSignals = {
      order: { productIds: ['sku-1', 'sku-2'] },
    };

    it('matches any order when no product ids are set', () => {
      expect(saasTriggerMatches(auto('catalog_order'), order)).toBe(true);
      expect(
        saasTriggerMatches(auto('catalog_order', { product_ids: [] }), order)
      ).toBe(true);
      // An order whose items could not be read is still an order.
      expect(
        saasTriggerMatches(auto('catalog_order'), { order: { productIds: [] } })
      ).toBe(true);
    });

    it('matches when the order holds one of the listed products', () => {
      expect(
        saasTriggerMatches(
          auto('catalog_order', { product_ids: ['sku-9', 'sku-2'] }),
          order
        )
      ).toBe(true);
      expect(
        saasTriggerMatches(
          auto('catalog_order', { product_ids: ['sku-9'] }),
          order
        )
      ).toBe(false);
    });

    it('does not match a message that is not an order', () => {
      expect(saasTriggerMatches(auto('catalog_order'), {})).toBe(false);
    });
  });

  it('anything_else has no condition of its own (the dispatcher decides)', () => {
    expect(saasTriggerMatches(auto('anything_else'), {})).toBe(true);
    expect(saasTriggerMatches(auto('anything_else'), undefined)).toBe(true);
  });

  it('survives a null or non-object config', () => {
    expect(saasTriggerMatches(auto('button_reply', null), button('x'))).toBe(
      true
    );
    expect(
      saasTriggerMatches(auto('catalog_order', 'x'), {
        order: { productIds: [] },
      })
    ).toBe(true);
  });
});

describe('validateSaasTrigger', () => {
  it('has nothing to say about upstream triggers', () => {
    expect(validateSaasTrigger('keyword_match', {})).toEqual([]);
  });

  it('accepts the triggers that need no configuration', () => {
    for (const type of ['flow_response', 'meta_ads_ctwa', 'anything_else']) {
      expect(validateSaasTrigger(type, {})).toEqual([]);
      expect(validateSaasTrigger(type, undefined)).toEqual([]);
    }
  });

  it('accepts blank / absent / ordinary reply text', () => {
    expect(validateSaasTrigger('button_reply', {})).toEqual([]);
    expect(validateSaasTrigger('button_reply', { text: '' })).toEqual([]);
    expect(validateSaasTrigger('list_reply', { text: 'Sofas' })).toEqual([]);
  });

  it('rejects reply text that is not a string or is too long', () => {
    const notString = validateSaasTrigger('button_reply', { text: 5 });
    expect(notString).toHaveLength(1);
    expect(notString[0].path).toBe('trigger.text');
    const tooLong = validateSaasTrigger('list_reply', {
      text: 'x'.repeat(201),
    });
    expect(tooLong[0].message).toContain('200');
  });

  it('rejects malformed or excessive product ids', () => {
    expect(validateSaasTrigger('catalog_order', {})).toEqual([]);
    expect(
      validateSaasTrigger('catalog_order', { product_ids: ['a'] })
    ).toEqual([]);
    expect(
      validateSaasTrigger('catalog_order', { product_ids: ['a', ' '] })[0].path
    ).toBe('trigger.product_ids');
    expect(
      validateSaasTrigger('catalog_order', { product_ids: 'a' })[0].path
    ).toBe('trigger.product_ids');
    const many = Array.from({ length: 51 }, (_, i) => `sku-${i}`);
    expect(
      validateSaasTrigger('catalog_order', { product_ids: many })[0].message
    ).toContain('50');
  });
});
