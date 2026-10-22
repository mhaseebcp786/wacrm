import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

import en from '../../../../messages/en.json';
import { MESSAGE_TYPES } from '@/saas/lib/messages/types';
import { EDITOR_TYPES } from '@/saas/lib/quick-replies/editor-state';
import type { QuickReplyIssue } from '@/saas/lib/quick-replies/types';
import { validateQuickReplyMessage } from '@/saas/lib/quick-replies/validate';
import { fieldKey, issueText } from './issue-text';

const errors: string[] = [];
const tr = (namespace: string) => {
  const t = createTranslator({
    locale: 'en',
    messages: en,
    namespace: namespace as never,
    onError: (e) => errors.push(`${namespace}: ${e.message}`),
  }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;
  return t;
};
const tIssues = tr('SaasQuickReplies.issues');
const tCarousel = tr('SaasCarousel.issues');

describe('issue text', () => {
  it('maps validator paths to field labels, skipping array indexes', () => {
    expect(fieldKey('payload.interactive.action.buttons.0.reply.title')).toBe(
      'title'
    );
    expect(fieldKey('payload.location.latitude')).toBe('latitude');
    expect(fieldKey('payload.contacts.0.name.formatted_name')).toBe(
      'formatted_name'
    );
    expect(fieldKey('payload.type')).toBeNull();
  });

  it('renders every issue code in plain language with no raw keys', () => {
    errors.length = 0;
    const samples: QuickReplyIssue[] = [
      { path: 'payload.text.body', code: 'required' },
      { path: 'payload.text.body', code: 'tooLong', params: { max: 4096 } },
      {
        path: 'payload.interactive.action.buttons',
        code: 'tooFew',
        params: { min: 1 },
      },
      {
        path: 'payload.interactive.action.buttons',
        code: 'tooMany',
        params: { max: 3 },
      },
      {
        path: 'payload.interactive.action.buttons.1.reply.id',
        code: 'duplicate',
      },
      {
        path: 'payload.location.latitude',
        code: 'outOfRange',
        params: { min: -90, max: 90 },
      },
      { path: 'payload.image.link', code: 'invalidUrl' },
      { path: 'payload.image.link', code: 'invalidMedia' },
      { path: 'payload.type', code: 'invalidValue' },
      { path: '', code: 'notObject' },
      {
        path: 'payload.interactive',
        code: 'unsupported',
        params: { feature: 'flow' },
      },
      {
        path: 'payload.interactive',
        code: 'carousel',
        params: { reason: 'minCards' },
      },
      {
        path: 'payload.interactive',
        code: 'carousel',
        params: { reason: 'headerUrl', card: 2 },
      },
    ];
    for (const s of samples) {
      const text = issueText(s, tIssues, tCarousel);
      expect(text, JSON.stringify(s)).not.toMatch(
        /SaasQuickReplies|SaasCarousel|\{/
      );
      expect(text.length).toBeGreaterThan(5);
    }
    expect(errors).toEqual([]);
  });

  it('names the offending field and fills the numbers in', () => {
    const text = issueText(
      {
        path: 'payload.location.latitude',
        code: 'outOfRange',
        params: { min: -90, max: 90 },
      },
      tIssues,
      tCarousel
    );
    expect(text).toBe('Latitude must be between -90 and 90.');
  });

  it('localizes real validator output', () => {
    const r = validateQuickReplyMessage({
      message_type: 'location',
      payload: { type: 'location', location: { latitude: 123, longitude: 0 } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(issueText(r.issues[0], tIssues, tCarousel)).toMatch(/Latitude/);
    }
  });

  it('has a type label for every message and editor type', () => {
    const types = (
      en as { SaasQuickReplies: { types: Record<string, string> } }
    ).SaasQuickReplies.types;
    for (const type of new Set([...MESSAGE_TYPES, ...EDITOR_TYPES])) {
      expect(types[type], type).toBeTruthy();
    }
  });
});
