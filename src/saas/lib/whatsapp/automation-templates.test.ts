import { describe, expect, it } from 'vitest';
import type { MessageTemplate } from '@/types';
import { isSendableInAutomation } from './automation-templates';

const row = (header_type: unknown) =>
  ({ header_type }) as unknown as MessageTemplate;

describe('isSendableInAutomation', () => {
  it('excludes carousel templates only', () => {
    expect(isSendableInAutomation(row('carousel'))).toBe(false);
    for (const type of [
      'image',
      'video',
      'document',
      'text',
      null,
      undefined,
    ]) {
      expect(isSendableInAutomation(row(type))).toBe(true);
    }
  });
});
