import { INTERACTIVE_LIMITS } from '@/lib/whatsapp/meta-api';
import { CAROUSEL_LIMITS } from '@/saas/lib/whatsapp/carousel-interactive';

/**
 * Per-field limits for the shared message object. The numbers in spec 01 §3
 * come from the reference app's composer helper text and equal Meta's Cloud API limits.
 * EXCEPTIONS with no source in the spec (fork guesses): documentFilenameMaxLength
 * and the location name/address cap (1000). Interactive/carousel ceilings are re-exported
 * from the existing modules so there is one source of truth.
 */
// The interactive entries are getters, not copies: upstream test suites mock
// `@/lib/whatsapp/meta-api` without `INTERACTIVE_LIMITS`, and the send core now
// loads this module (via the message-object validator), so reading the
// constant at import time would break those suites. A getter reads it on use.
export const MESSAGE_LIMITS = {
  textBodyMaxLength: 4096,
  captionMaxLength: 1024,
  documentFilenameMaxLength: 240,
  locationTextMaxLength: 1000,
  get interactiveBodyMaxLength() {
    return INTERACTIVE_LIMITS.bodyMaxLength;
  },
  get interactiveFooterMaxLength() {
    return INTERACTIVE_LIMITS.footerMaxLength;
  },
  get interactiveHeaderTextMaxLength() {
    return INTERACTIVE_LIMITS.headerTextMaxLength;
  },
  get maxReplyButtons() {
    return INTERACTIVE_LIMITS.maxButtons;
  },
  get buttonTitleMaxLength() {
    return INTERACTIVE_LIMITS.buttonTitleMaxLength;
  },
  buttonIdMaxLength: 256,
  ctaLabelMaxLength: 20,
  listButtonMaxLength: 20,
  get maxListSections() {
    return INTERACTIVE_LIMITS.maxListSections;
  },
  get maxListRows() {
    return INTERACTIVE_LIMITS.maxListRowsTotal;
  },
  listSectionTitleMaxLength: 24,
  listRowIdMaxLength: 200,
  get listRowTitleMaxLength() {
    return INTERACTIVE_LIMITS.listRowTitleMaxLength;
  },
  get listRowDescriptionMaxLength() {
    return INTERACTIVE_LIMITS.listRowDescriptionMaxLength;
  },
  flowCtaMaxLength: 30,
  carousel: CAROUSEL_LIMITS,
} as const;

/** Audio extensions Meta accepts (basic audio); voice notes need OGG/OPUS. */
export const AUDIO_EXTENSIONS = [
  'aac',
  'amr',
  'mp3',
  'm4a',
  'ogg',
  'opus',
] as const;
export const VOICE_EXTENSIONS = ['ogg', 'opus'] as const;
