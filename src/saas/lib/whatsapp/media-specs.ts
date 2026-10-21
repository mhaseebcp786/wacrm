/**
 * Media limits + validator for template headers, carousel cards and
 * send-time media (leminai-style "Meta limit" table).
 *
 * Reuse policy: MIME lists and Meta's per-type ceilings come from the
 * upstream `MEDIA_HEADER_SPECS` (they already match Meta's table: image
 * 5 MB jpeg/png, video 16 MB mp4/3gpp, document 100 MB pdf/office/txt).
 * Two things upstream does not model and this module adds:
 *   1. file EXTENSIONS (incl. jpeg/3gpp aliases) so pasted URLs and files
 *      with an empty `File.type` (3gp on some browsers) can be validated;
 *   2. the PDF-only rule for a template's document-header SAMPLE (Meta only
 *      accepts a PDF sample at creation; any document type is fine at send).
 * Divergence from `MEDIA_MAX_BYTES_BY_KIND`: that table is the bucket-side
 * UPLOAD cap (documents 16 MB, the chat-media bucket limit), not Meta's
 * cap. `validateMediaFile` applies the upload cap by default; pasted URLs
 * (`validateMediaUrl`) are only constrained by Meta's own limits.
 *
 * Errors are i18n-friendly codes (never English strings): callers map
 * `code` (+ `params`) to a catalogue message.
 */

import {
  MEDIA_HEADER_SPECS,
  type MediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';
import { MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media';

export type SaasMediaKind = MediaHeaderKind;

/**
 * `send`           – media chosen at send time (document: any supported type)
 * `templateHeader` – sample for a template header at creation (document: PDF only)
 */
export type MediaContext = 'send' | 'templateHeader';

export interface MediaLimit {
  kind: SaasMediaKind;
  /** Meta's ceiling in bytes. */
  maxBytes: number;
  /** Accepted lower-case extensions without the dot. */
  extensions: readonly string[];
  /** Accepted MIME types. */
  mimeTypes: readonly string[];
}

const MB = 1024 * 1024;

/** Extra extension spellings for the same MIME (jpeg == jpg, 3gpp == 3gp). */
const EXTENSION_ALIASES: Readonly<Record<SaasMediaKind, readonly string[]>> = {
  image: ['jpg', 'jpeg', 'png'],
  video: ['mp4', '3gp', '3gpp'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
};

export const MEDIA_LIMITS: Readonly<Record<SaasMediaKind, MediaLimit>> = {
  image: {
    kind: 'image',
    maxBytes: MEDIA_HEADER_SPECS.image.maxBytes,
    extensions: EXTENSION_ALIASES.image,
    mimeTypes: MEDIA_HEADER_SPECS.image.mimeTypes,
  },
  video: {
    kind: 'video',
    maxBytes: MEDIA_HEADER_SPECS.video.maxBytes,
    extensions: EXTENSION_ALIASES.video,
    mimeTypes: [...MEDIA_HEADER_SPECS.video.mimeTypes, 'video/3gp'],
  },
  document: {
    kind: 'document',
    maxBytes: MEDIA_HEADER_SPECS.document.maxBytes,
    extensions: EXTENSION_ALIASES.document,
    mimeTypes: MEDIA_HEADER_SPECS.document.mimeTypes,
  },
};

/** Template document-header SAMPLE: Meta accepts a PDF only. */
export const PDF_TEMPLATE_HEADER_LIMIT: MediaLimit = {
  kind: 'document',
  maxBytes: MEDIA_HEADER_SPECS.document.maxBytes,
  extensions: ['pdf'],
  mimeTypes: ['application/pdf'],
};

export function getMediaLimit(
  kind: SaasMediaKind,
  context: MediaContext = 'send'
): MediaLimit {
  if (kind === 'document' && context === 'templateHeader') {
    return PDF_TEMPLATE_HEADER_LIMIT;
  }
  return MEDIA_LIMITS[kind];
}

export type MediaIssueCode =
  | 'empty'
  | 'invalidUrl'
  | 'invalidFormat'
  | 'tooLarge'
  | 'insecureUrl'
  | 'unknownExtension';

export interface MediaIssue {
  code: MediaIssueCode;
  /** Interpolation values for the catalogue message. */
  params?: Record<string, string | number>;
}

export interface MediaValidationResult {
  ok: boolean;
  error?: MediaIssue;
  /** Non-blocking note (e.g. pasted URL without a recognisable extension). */
  warning?: MediaIssue;
}

/** Display list of extensions: ["JPG","JPEG","PNG"]. */
export function formatExtensions(limit: MediaLimit): string {
  return limit.extensions.map((e) => e.toUpperCase()).join(', ');
}

/**
 * leminai's "Meta limit" badge shows at most 3 extensions then "etc.".
 * Returns `{ max, formats }` for `Meta limit: Max {max} ({formats})`.
 */
export function describeMediaLimit(
  kind: SaasMediaKind,
  context: MediaContext = 'send'
): { max: string; formats: string } {
  const limit = getMediaLimit(kind, context);
  const exts = limit.extensions.map((e) => e.toUpperCase());
  const shown =
    exts.length > 4 ? `${exts.slice(0, 3).join(', ')}, etc.` : exts.join(', ');
  return { max: formatBytes(limit.maxBytes), formats: shown };
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

export function getExtension(nameOrUrl: string): string | null {
  const cleaned = nameOrUrl.split(/[?#]/)[0] ?? '';
  const last = cleaned.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot < 0 || dot === last.length - 1) return null;
  return last.slice(dot + 1).toLowerCase();
}

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

export interface ValidateFileOptions {
  context?: MediaContext;
  /**
   * Apply the bucket-side upload cap (`MEDIA_MAX_BYTES_BY_KIND`, 16 MB for
   * documents) in addition to Meta's ceiling. Default true: the file is
   * about to be uploaded to our bucket. A larger document can be sent by
   * pasting a link.
   */
  forUpload?: boolean;
}

export function validateMediaFile(
  kind: SaasMediaKind,
  file: FileLike,
  options: ValidateFileOptions = {}
): MediaValidationResult {
  const limit = getMediaLimit(kind, options.context ?? 'send');
  const formats = formatExtensions(limit);

  const mime = file.type.trim().toLowerCase();
  const ext = getExtension(file.name);
  const mimeGeneric = mime === '' || mime === 'application/octet-stream';
  const formatOk = mimeGeneric
    ? ext !== null && limit.extensions.includes(ext)
    : limit.mimeTypes.includes(mime);
  if (!formatOk) {
    return { ok: false, error: { code: 'invalidFormat', params: { formats } } };
  }

  const cap =
    options.forUpload === false
      ? limit.maxBytes
      : Math.min(limit.maxBytes, MEDIA_MAX_BYTES_BY_KIND[kind]);
  if (file.size > cap) {
    return {
      ok: false,
      error: {
        code: 'tooLarge',
        params: {
          size: (file.size / MB).toFixed(1),
          max: Math.round(cap / MB),
        },
      },
    };
  }
  return { ok: true };
}

function parseHttpUrl(value: string): URL | null {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Validate a pasted media link. A recognisable extension that is not in
 * the allowed list is an error; no extension (or a CDN-style URL) is
 * allowed with an `unknownExtension` warning because the type can only
 * be confirmed by fetching it. Size is unknowable here.
 */
export function validateMediaUrl(
  kind: SaasMediaKind,
  value: string,
  options: { context?: MediaContext } = {}
): MediaValidationResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: { code: 'empty' } };
  const url = parseHttpUrl(trimmed);
  if (!url) return { ok: false, error: { code: 'invalidUrl' } };

  const limit = getMediaLimit(kind, options.context ?? 'send');
  const ext = getExtension(url.pathname);
  const insecure =
    url.protocol === 'http:'
      ? ({ code: 'insecureUrl' } as MediaIssue)
      : undefined;

  if (ext && limit.extensions.includes(ext)) {
    return insecure ? { ok: true, warning: insecure } : { ok: true };
  }
  // A well-known file extension that is not allowed here: reject. Any
  // other tail (or none) cannot be judged from the URL alone: warn.
  if (ext && KNOWN_FILE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: {
        code: 'invalidFormat',
        params: { formats: formatExtensions(limit) },
      },
    };
  }
  return { ok: true, warning: insecure ?? { code: 'unknownExtension' } };
}

/** Extensions common enough that a mismatch is almost certainly a wrong file. */
const KNOWN_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'bmp',
  'tiff',
  'heic',
  'ico',
  'mp4',
  'mov',
  'avi',
  'webm',
  'mkv',
  'wmv',
  'flv',
  '3gp',
  '3gpp',
  'mpeg',
  'mpg',
  'mp3',
  'wav',
  'ogg',
  'aac',
  'm4a',
  'flac',
  'amr',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'zip',
  'rar',
  'tar',
  'gz',
  'rtf',
  'odt',
  'ods',
  'json',
  'xml',
  'html',
  'htm',
  'exe',
]);

/**
 * File name for a document header: the last path segment of a URL (or a
 * plain file name), decoded. Returns null when nothing usable exists.
 * Mirrors what the server derives so the confirm dialog shows the same
 * name the recipient will see.
 */
export function deriveDocumentFilename(urlOrName: string): string | null {
  const raw = urlOrName.trim();
  if (!raw) return null;
  let path = raw;
  const url = parseHttpUrl(raw);
  if (url) path = url.pathname;
  else path = raw.split(/[?#]/)[0] ?? raw;
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return null;
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  decoded = decoded.trim();
  return decoded.length > 0 ? decoded : null;
}
