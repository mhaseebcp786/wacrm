import { describe, it, expect } from 'vitest';
import {
  MEDIA_HEADER_SPECS,
  isMediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';
import { MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media';
import { TemplateHeaderMediaInput } from './template-header-media-input';
import { TemplatePickerWithMedia } from './template-picker-with-media';
import fs from 'node:fs';
import path from 'node:path';

describe('Template Media Header Specifications', () => {
  it('defines correct media header specs for image, video, document', () => {
    expect(isMediaHeaderKind('image')).toBe(true);
    expect(isMediaHeaderKind('video')).toBe(true);
    expect(isMediaHeaderKind('document')).toBe(true);
    expect(isMediaHeaderKind('text')).toBe(false);

    // Image specs
    expect(MEDIA_HEADER_SPECS.image.mimeTypes).toContain('image/jpeg');
    expect(MEDIA_HEADER_SPECS.image.mimeTypes).toContain('image/png');
    expect(MEDIA_HEADER_SPECS.image.maxBytes).toBe(5 * 1024 * 1024);

    // Video specs
    expect(MEDIA_HEADER_SPECS.video.mimeTypes).toContain('video/mp4');
    expect(MEDIA_HEADER_SPECS.video.mimeTypes).toContain('video/3gpp');
    expect(MEDIA_HEADER_SPECS.video.maxBytes).toBe(16 * 1024 * 1024);

    // Document specs
    expect(MEDIA_HEADER_SPECS.document.mimeTypes).toContain('application/pdf');
    expect(MEDIA_HEADER_SPECS.document.mimeTypes).toContain('text/plain');
  });

  it('matches client upload ceilings in MEDIA_MAX_BYTES_BY_KIND', () => {
    expect(MEDIA_MAX_BYTES_BY_KIND.image).toBe(5 * 1024 * 1024);
    expect(MEDIA_MAX_BYTES_BY_KIND.video).toBe(16 * 1024 * 1024);
    expect(MEDIA_MAX_BYTES_BY_KIND.document).toBe(16 * 1024 * 1024);
  });

  it('exports valid component functions', () => {
    expect(typeof TemplateHeaderMediaInput).toBe('function');
    expect(typeof TemplatePickerWithMedia).toBe('function');
  });

  it('verifies all required i18n keys in all 4 locales', () => {
    const locales = ['en', 'es', 'ko', 'pt'];
    const requiredPersonalizeKeys = [
      'headerVideo',
      'headerDocument',
      'mediaUrl',
      'mediaUrlPlaceholder',
      'headerVideoDesc',
      'headerDocumentDesc',
      'uploadMedia',
      'uploadingMedia',
    ];
    const requiredTemplatePickerKeys = [
      'mediaHeaderTitle',
      'mediaHeaderDesc',
      'mediaUrl',
      'mediaUrlPlaceholder',
      'confirmSend',
      'uploadFile',
      'uploading',
    ];

    for (const locale of locales) {
      const filePath = path.join(process.cwd(), 'messages', `${locale}.json`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(raw);

      const personalize = json.Broadcasts?.wizard?.personalize;
      expect(personalize).toBeDefined();
      for (const k of requiredPersonalizeKeys) {
        expect(personalize[k], `Missing ${k} in ${locale}.json Broadcasts.wizard.personalize`).toBeTruthy();
      }

      const templatePicker = json.Inbox?.templatePicker;
      expect(templatePicker).toBeDefined();
      for (const k of requiredTemplatePickerKeys) {
        expect(templatePicker[k], `Missing ${k} in ${locale}.json Inbox.templatePicker`).toBeTruthy();
      }
    }
  });
});
