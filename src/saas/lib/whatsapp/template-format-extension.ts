// ============================================================
// SaaS template format extension.
//
// Extends the upstream HeaderFormat type and HEADER_FORMATS array
// to include 'carousel'. Upstream template-manager.tsx imports and
// re-exports these so the custom type lives entirely in saas/.
// ============================================================

/** All header format values, including SaaS carousel extension. */
export type SaasHeaderFormat =
  | 'none'
  | 'text'
  | 'image'
  | 'video'
  | 'document'
  | 'carousel';

/** All header format values as a runtime array. */
export const SAAS_HEADER_FORMATS: SaasHeaderFormat[] = [
  'none',
  'text',
  'image',
  'video',
  'document',
  'carousel',
];
