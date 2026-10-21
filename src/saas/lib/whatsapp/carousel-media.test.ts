import { describe, expect, it } from 'vitest';
import { validateCarouselMediaFile } from './carousel-media';

const MB = 1024 * 1024;

describe('validateCarouselMediaFile', () => {
  it('accepts jpg/png images up to 5MB and rejects larger or other types', () => {
    expect(
      validateCarouselMediaFile(
        { name: 'a.jpg', type: 'image/jpeg', size: 5 * MB },
        'image'
      )
    ).toBeNull();
    expect(
      validateCarouselMediaFile(
        { name: 'a.PNG', type: 'image/png', size: 1 },
        'image'
      )
    ).toBeNull();
    expect(
      validateCarouselMediaFile(
        { name: 'a.jpg', type: 'image/jpeg', size: 5 * MB + 1 },
        'image'
      )
    ).toBe('size');
    expect(
      validateCarouselMediaFile(
        { name: 'a.gif', type: 'image/gif', size: 1 },
        'image'
      )
    ).toBe('type');
    expect(
      validateCarouselMediaFile(
        { name: 'a.webp', type: 'image/webp', size: 1 },
        'image'
      )
    ).toBe('type');
  });

  it('accepts mp4/3gp videos up to 16MB and rejects others', () => {
    expect(
      validateCarouselMediaFile(
        { name: 'v.mp4', type: 'video/mp4', size: 16 * MB },
        'video'
      )
    ).toBeNull();
    expect(
      validateCarouselMediaFile({ name: 'v.3gp', type: '', size: 1 }, 'video')
    ).toBeNull();
    expect(
      validateCarouselMediaFile(
        { name: 'v.mp4', type: 'video/mp4', size: 16 * MB + 1 },
        'video'
      )
    ).toBe('size');
    expect(
      validateCarouselMediaFile(
        { name: 'v.mov', type: 'video/quicktime', size: 1 },
        'video'
      )
    ).toBe('type');
  });
});

describe('MIME takes priority over extension (single validator: media-specs)', () => {
  it('rejects a .jpg name whose MIME is not allowed', () => {
    expect(
      validateCarouselMediaFile(
        { name: 'x.jpg', type: 'image/webp', size: 1 },
        'image'
      )
    ).toBe('type');
    expect(
      validateCarouselMediaFile(
        { name: 'x.mp4', type: 'video/quicktime', size: 1 },
        'video'
      )
    ).toBe('type');
  });

  it('uses the extension only when the MIME is empty or generic', () => {
    expect(
      validateCarouselMediaFile({ name: 'x.png', type: '', size: 1 }, 'image')
    ).toBeNull();
    expect(
      validateCarouselMediaFile(
        { name: 'x.png', type: 'application/octet-stream', size: 1 },
        'image'
      )
    ).toBeNull();
    expect(
      validateCarouselMediaFile({ name: 'x.gif', type: '', size: 1 }, 'image')
    ).toBe('type');
    expect(
      validateCarouselMediaFile({ name: 'noext', type: '', size: 1 }, 'video')
    ).toBe('type');
  });
});
