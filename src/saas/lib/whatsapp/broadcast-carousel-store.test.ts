import { beforeEach, describe, expect, it } from 'vitest';
import type { MessageTemplate } from '@/types';
import {
  broadcastRecipientParams,
  carouselBroadcastIssues,
  clearBroadcastCarousel,
  ensureBroadcastCarouselState,
  getBroadcastCarouselSnapshot,
  setBroadcastCarouselCards,
  snapshotMatches,
  updateBroadcastCarouselCards,
  withBroadcastCarouselParams,
} from './broadcast-carousel-store';

function template(cardCount: number, id = 't1'): MessageTemplate {
  return {
    id,
    name: 'promo',
    body_text: 'Hi',
    header_type: 'carousel',
    carousel_cards: Array.from({ length: cardCount }, (_, i) => ({
      header_type: 'image',
      header_media_url: `https://x.com/${i}.png`,
      body_text: 'Card {{1}}',
      body_sample: ['Sample'],
      buttons: [],
    })),
  } as unknown as MessageTemplate;
}

beforeEach(() => clearBroadcastCarousel());

describe('broadcast carousel store seeding (R9)', () => {
  it('seeds from the template sample and keeps edits for the same template object', () => {
    const t = template(2);
    ensureBroadcastCarouselState(t);
    updateBroadcastCarouselCards('t1', (prev) =>
      prev.map((c, i) => (i === 0 ? { ...c, bodyParams: ['Edited'] } : c))
    );
    ensureBroadcastCarouselState(t);
    expect(getBroadcastCarouselSnapshot().cards[0]!.bodyParams).toEqual([
      'Edited',
    ]);
  });

  it('re-seeds on a new wizard session (new template object, same id)', () => {
    ensureBroadcastCarouselState(template(2));
    updateBroadcastCarouselCards('t1', (prev) =>
      prev.map((c) => ({ ...c, bodyParams: ['Old'] }))
    );
    ensureBroadcastCarouselState(template(2));
    expect(getBroadcastCarouselSnapshot().cards[0]!.bodyParams).toEqual([
      'Sample',
    ]);
  });

  it('re-seeds when the template card count changed under the same id', () => {
    ensureBroadcastCarouselState(template(2));
    const resynced = template(3);
    expect(snapshotMatches(getBroadcastCarouselSnapshot(), resynced)).toBe(
      false
    );
    ensureBroadcastCarouselState(resynced);
    expect(getBroadcastCarouselSnapshot().cards).toHaveLength(3);
  });

  it('ignores a late functional update after the store moved to another template', () => {
    ensureBroadcastCarouselState(template(2, 'a'));
    ensureBroadcastCarouselState(template(2, 'b'));
    updateBroadcastCarouselCards('a', (prev) =>
      prev.map((c) => ({ ...c, mediaUrl: 'https://late' }))
    );
    expect(getBroadcastCarouselSnapshot().templateId).toBe('b');
    expect(getBroadcastCarouselSnapshot().cards[0]!.mediaUrl).toBe(
      'https://x.com/0.png'
    );
  });

  it('sends the edited values, and falls back to the sample when the card count mismatches', () => {
    const t = template(2);
    ensureBroadcastCarouselState(t);
    setBroadcastCarouselCards(
      't1',
      getBroadcastCarouselSnapshot().cards.map((c) => ({
        ...c,
        bodyParams: ['Real'],
      }))
    );
    const sent = withBroadcastCarouselParams(t, { headerMediaUrl: 'h' });
    expect(sent?.carouselCards?.[0]?.bodyParams).toEqual(['Real']);
    expect(sent).toMatchObject({ headerMediaUrl: 'h' });

    const bigger = template(3);
    expect(
      withBroadcastCarouselParams(bigger, undefined)?.carouselCards
    ).toHaveLength(3);
    expect(
      carouselBroadcastIssues(bigger, getBroadcastCarouselSnapshot())
    ).toEqual([]);
  });

  it('leaves non-carousel params untouched', () => {
    const plain = {
      ...template(2),
      header_type: 'image',
    } as unknown as MessageTemplate;
    expect(withBroadcastCarouselParams(plain, undefined)).toBeUndefined();
    expect(broadcastRecipientParams(plain, undefined)).toEqual({});
    expect(broadcastRecipientParams(plain, { headerMediaUrl: 'x' })).toEqual({
      messageParams: { headerMediaUrl: 'x' },
    });
  });
});
