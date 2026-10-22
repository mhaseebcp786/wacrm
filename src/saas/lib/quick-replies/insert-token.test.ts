import { describe, expect, it } from 'vitest';

import { insertAtSelection, NAME_TOKEN, PHONE_TOKEN } from './insert-token';

describe('insertAtSelection', () => {
  it('inserts at the caret and moves the caret past the token', () => {
    expect(insertAtSelection('Hello !', 6, 6, NAME_TOKEN)).toEqual({
      value: 'Hello {{contact.name}}!',
      caret: 6 + NAME_TOKEN.length,
    });
  });

  it('replaces the selected text', () => {
    expect(insertAtSelection('Hi NAME, welcome', 3, 7, NAME_TOKEN)?.value).toBe(
      'Hi {{contact.name}}, welcome'
    );
  });

  it('appends when the caret is past the end, and clamps a reversed range', () => {
    expect(insertAtSelection('Call', 99, 99, PHONE_TOKEN)?.value).toBe(
      'Call{{contact.phone}}'
    );
    expect(insertAtSelection('abcd', 3, 1, 'X')?.value).toBe('abcXd');
  });

  it('refuses when the result would exceed the field limit, and 0 means no limit', () => {
    expect(
      insertAtSelection('x'.repeat(10), 10, 10, NAME_TOKEN, 20)
    ).toBeNull();
    expect(
      insertAtSelection('x'.repeat(10), 10, 10, NAME_TOKEN, 26)
    ).not.toBeNull();
    expect(
      insertAtSelection('x'.repeat(10), 10, 10, NAME_TOKEN, 0)
    ).not.toBeNull();
    expect(
      insertAtSelection('x'.repeat(10), 10, 10, NAME_TOKEN, -1)
    ).not.toBeNull();
  });

  it('counts a replaced selection against the limit', () => {
    // 10 chars, 8 selected, token is 16 -> 18 total.
    expect(
      insertAtSelection('x'.repeat(10), 0, 8, NAME_TOKEN, 18)
    ).not.toBeNull();
    expect(insertAtSelection('x'.repeat(10), 0, 8, NAME_TOKEN, 17)).toBeNull();
  });
});
