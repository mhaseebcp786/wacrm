import { describe, it, expect } from 'vitest';
import {
  MEDIA_LIMITS,
  PDF_TEMPLATE_HEADER_LIMIT,
  describeMediaLimit,
  deriveDocumentFilename,
  getExtension,
  getMediaLimit,
  validateMediaFile,
  validateMediaUrl,
} from './media-specs';

const MB = 1024 * 1024;

describe('MEDIA_LIMITS', () => {
  it('matches the leminai / Meta limits table', () => {
    expect(MEDIA_LIMITS.image.maxBytes).toBe(5 * MB);
    expect(MEDIA_LIMITS.image.extensions).toEqual(['jpg', 'jpeg', 'png']);
    expect(MEDIA_LIMITS.video.maxBytes).toBe(16 * MB);
    expect(MEDIA_LIMITS.video.extensions).toEqual(['mp4', '3gp', '3gpp']);
    expect(MEDIA_LIMITS.document.maxBytes).toBe(100 * MB);
    expect(MEDIA_LIMITS.document.extensions).toEqual([
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'txt',
    ]);
  });

  it('uses PDF only for the template header sample', () => {
    expect(getMediaLimit('document', 'templateHeader')).toBe(
      PDF_TEMPLATE_HEADER_LIMIT
    );
    expect(PDF_TEMPLATE_HEADER_LIMIT.extensions).toEqual(['pdf']);
    expect(getMediaLimit('document', 'send')).toBe(MEDIA_LIMITS.document);
    expect(getMediaLimit('image', 'templateHeader')).toBe(MEDIA_LIMITS.image);
  });

  it('describes the badge text like leminai (truncates long lists)', () => {
    expect(describeMediaLimit('image')).toEqual({
      max: '5 MB',
      formats: 'JPG, JPEG, PNG',
    });
    expect(describeMediaLimit('document').formats).toBe('PDF, DOC, DOCX, etc.');
    expect(describeMediaLimit('document', 'templateHeader')).toEqual({
      max: '100 MB',
      formats: 'PDF',
    });
  });
});

describe('validateMediaFile', () => {
  it('accepts valid images and rejects wrong formats with a code', () => {
    expect(
      validateMediaFile('image', { name: 'a.png', type: 'image/png', size: MB })
        .ok
    ).toBe(true);
    const bad = validateMediaFile('image', {
      name: 'a.gif',
      type: 'image/gif',
      size: MB,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toEqual({
      code: 'invalidFormat',
      params: { formats: 'JPG, JPEG, PNG' },
    });
  });

  it('rejects oversize files with size/max params', () => {
    const r = validateMediaFile('image', {
      name: 'a.jpg',
      type: 'image/jpeg',
      size: 6 * MB,
    });
    expect(r.error?.code).toBe('tooLarge');
    expect(r.error?.params).toEqual({ size: '6.0', max: 5 });
  });

  it('falls back to the extension when the browser reports no MIME (3gp)', () => {
    expect(
      validateMediaFile('video', { name: 'clip.3gp', type: '', size: MB }).ok
    ).toBe(true);
    expect(
      validateMediaFile('video', { name: 'clip.mov', type: '', size: MB }).ok
    ).toBe(false);
  });

  it('applies the 16 MB bucket cap to uploaded documents but not to pasted links', () => {
    const big = { name: 'a.pdf', type: 'application/pdf', size: 20 * MB };
    expect(validateMediaFile('document', big).error?.code).toBe('tooLarge');
    expect(validateMediaFile('document', big, { forUpload: false }).ok).toBe(
      true
    );
    expect(
      validateMediaFile(
        'document',
        { ...big, size: 101 * MB },
        { forUpload: false }
      ).error?.code
    ).toBe('tooLarge');
  });

  it('enforces PDF-only for template header documents', () => {
    const docx = {
      name: 'a.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: MB,
    };
    expect(validateMediaFile('document', docx).ok).toBe(true);
    expect(
      validateMediaFile('document', docx, { context: 'templateHeader' }).ok
    ).toBe(false);
  });
});

describe('validateMediaUrl', () => {
  it('rejects empty and non-http URLs', () => {
    expect(validateMediaUrl('image', '  ').error?.code).toBe('empty');
    expect(validateMediaUrl('image', 'not a url').error?.code).toBe(
      'invalidUrl'
    );
    expect(validateMediaUrl('image', 'ftp://x.com/a.png').error?.code).toBe(
      'invalidUrl'
    );
  });

  it('accepts a matching extension, ignoring the query string', () => {
    const r = validateMediaUrl('video', 'https://cdn.x.com/v/clip.MP4?sig=1');
    expect(r).toEqual({ ok: true });
  });

  it('rejects a known-but-wrong extension', () => {
    const r = validateMediaUrl('image', 'https://x.com/a.gif');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('invalidFormat');
  });

  it('allows an unknown extension with a warning', () => {
    const r = validateMediaUrl('image', 'https://x.com/media/12345');
    expect(r.ok).toBe(true);
    expect(r.warning?.code).toBe('unknownExtension');
  });

  it('warns on plain http', () => {
    const r = validateMediaUrl('image', 'http://x.com/a.png');
    expect(r.ok).toBe(true);
    expect(r.warning?.code).toBe('insecureUrl');
  });

  it('applies the PDF-only rule for template header samples', () => {
    expect(
      validateMediaUrl('document', 'https://x.com/a.docx', {
        context: 'templateHeader',
      }).ok
    ).toBe(false);
    expect(
      validateMediaUrl('document', 'https://x.com/a.pdf', {
        context: 'templateHeader',
      }).ok
    ).toBe(true);
    expect(validateMediaUrl('document', 'https://x.com/a.docx').ok).toBe(true);
  });
});

describe('filename helpers', () => {
  it('extracts extensions', () => {
    expect(getExtension('https://x.com/a/b.PDF?x=1')).toBe('pdf');
    expect(getExtension('noext')).toBeNull();
    expect(getExtension('trailing.')).toBeNull();
  });

  it('derives a document filename from a URL or file name', () => {
    expect(
      deriveDocumentFilename('https://x.com/files/My%20Brochure.pdf?token=1')
    ).toBe('My Brochure.pdf');
    expect(deriveDocumentFilename('report.pdf')).toBe('report.pdf');
    expect(deriveDocumentFilename('https://x.com/')).toBeNull();
    expect(deriveDocumentFilename('   ')).toBeNull();
    expect(deriveDocumentFilename('https://x.com/%E0%A4%A.pdf')).toBe(
      '%E0%A4%A.pdf'
    );
  });
});
