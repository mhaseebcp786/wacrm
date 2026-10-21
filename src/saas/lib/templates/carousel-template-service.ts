// ============================================================
// SaaS carousel TEMPLATE — create / edit service.
//
// Upstream `/api/whatsapp/templates/submit` and `/[id]` only know the
// HEADER/BODY/FOOTER/BUTTONS component model: they reject a carousel
// payload (media header without a URL) and never build the Meta
// `CAROUSEL` component. These handlers mirror those routes' flow
// (auth → validate → DRY_RUN → media handles → Meta → persist) for
// carousel templates; the thin route files under
// src/app/api/saas/templates/carousel/** just delegate here.
// ============================================================

import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  editMessageTemplate,
  submitMessageTemplate,
} from '@/lib/whatsapp/meta-api';
import type { MetaTemplateSubmitPayload } from '@/lib/whatsapp/template-components';
import { ensureMediaHeaderHandle } from '@/lib/whatsapp/template-header-handle';
import type { TemplatePayload } from '@/lib/whatsapp/template-validators';
import type { TemplateButton } from '@/types';
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize';
import { getT } from '@/lib/i18n/translate';
import {
  buildMetaCarouselTemplatePayload,
  validateCarouselTemplatePayload,
  type CarouselTemplateCard,
  type CarouselTemplatePayload,
} from '@/saas/lib/whatsapp/carousel-template';

const t = getT('Api');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EDITABLE_STATUSES = new Set(['APPROVED', 'REJECTED', 'PAUSED']);

function isDryRun(): boolean {
  return (
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'
  );
}

/**
 * The persisted shape of a card: the creation-time Meta upload handle
 * is not reusable later (see template-send-builder), so it is dropped.
 */
function storedCards(cards: CarouselTemplateCard[]): CarouselTemplateCard[] {
  return cards.map((card) => ({
    header_type: card.header_type,
    ...(card.header_media_url
      ? { header_media_url: card.header_media_url }
      : {}),
    body_text: card.body_text,
    ...(card.body_sample?.length ? { body_sample: card.body_sample } : {}),
    buttons: card.buttons ?? [],
  }));
}

/** Resumable-upload handle for every card (Meta rejects plain URLs). */
async function ensureCardHandles(
  payload: CarouselTemplatePayload,
  accessToken: string
): Promise<void> {
  await Promise.all(
    payload.cards.map(async (card) => {
      if (card.header_handle) return;
      const probe: TemplatePayload = {
        name: payload.name,
        category: 'Marketing',
        language: payload.language,
        body_text: card.body_text,
        header_type: card.header_type,
        header_media_url: card.header_media_url,
      };
      await ensureMediaHeaderHandle(probe, accessToken);
      card.header_handle = probe.header_handle;
    })
  );
}

function rowFields(payload: CarouselTemplatePayload) {
  return {
    category: payload.category,
    header_type: 'carousel' as const,
    header_content: null,
    header_media_url: null,
    header_handle: null,
    body_text: payload.body_text,
    footer_text: null,
    buttons: null,
    sample_values: payload.sample_values ?? null,
    carousel_cards: storedCards(payload.cards),
  };
}

// The Meta helpers are typed for the upstream component model; the
// carousel payload only adds a `CAROUSEL` component to the same JSON
// envelope, so the cast is confined to this one boundary.
function asUpstreamPayload(
  p: ReturnType<typeof buildMetaCarouselTemplatePayload>
): MetaTemplateSubmitPayload {
  return p as unknown as MetaTemplateSubmitPayload;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Keep only known, well-typed fields of untrusted JSON. */
function normalizeButton(b: unknown): TemplateButton | null {
  if (!b || typeof b !== 'object') return null;
  const r = b as Record<string, unknown>;
  switch (r.type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: str(r.text) };
    case 'URL':
      return {
        type: 'URL',
        text: str(r.text),
        url: str(r.url),
        ...(str(r.example) ? { example: str(r.example) } : {}),
      };
    case 'PHONE_NUMBER':
      return {
        type: 'PHONE_NUMBER',
        text: str(r.text),
        phone_number: str(r.phone_number),
      };
    default:
      // Unsupported types are kept as-is-shaped so the validator reports them.
      return typeof r.type === 'string'
        ? ({ type: r.type, text: str(r.text) } as unknown as TemplateButton)
        : null;
  }
}

function normalizeCard(c: unknown): CarouselTemplateCard {
  const r = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  return {
    header_type: r.header_type as CarouselTemplateCard['header_type'],
    header_media_url: str(r.header_media_url) || undefined,
    header_handle: str(r.header_handle) || undefined,
    body_text: str(r.body_text),
    body_sample: Array.isArray(r.body_sample)
      ? r.body_sample.filter((v): v is string => typeof v === 'string')
      : undefined,
    buttons: Array.isArray(r.buttons)
      ? r.buttons
          .map(normalizeButton)
          .filter((b): b is TemplateButton => b !== null)
      : [],
  };
}

function normalizePayload(
  raw: Record<string, unknown>,
  cards: unknown
): CarouselTemplatePayload {
  const sv = raw.sample_values as { body?: unknown } | undefined;
  const body = Array.isArray(sv?.body)
    ? sv.body.filter((v): v is string => typeof v === 'string')
    : undefined;
  return {
    name: str(raw.name),
    category: raw.category as CarouselTemplatePayload['category'],
    language: str(raw.language),
    header_type: 'carousel',
    body_text: str(raw.body_text),
    ...(body ? { sample_values: { body } } : {}),
    cards: Array.isArray(cards) ? cards.map(normalizeCard) : [],
  };
}

async function readPayload(
  request: Request
): Promise<CarouselTemplatePayload | NextResponse> {
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    // Accept the editor's `carousel_cards` alias for `cards`.
    const cards = (raw.cards ?? raw.carousel_cards) as
      CarouselTemplateCard[] | undefined;
    return normalizePayload(raw, cards);
  } catch {
    return NextResponse.json(
      { error: t('templates.invalidJsonBody') },
      { status: 400 }
    );
  }
}

function validationResponse(
  payload: CarouselTemplatePayload
): NextResponse | null {
  try {
    validateCarouselTemplatePayload(payload);
    return null;
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : t('templates.validationFailed'),
      },
      { status: 400 }
    );
  }
}

function handleError(error: unknown, fallbackKey: string): NextResponse {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return toErrorResponse(error);
  }
  console.error('Error in carousel template handler:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : t(fallbackKey) },
    { status: 500 }
  );
}

/** POST — create + submit a carousel template (upsert by user/name/language). */
export async function submitCarouselTemplate(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');

    const payload = await readPayload(request);
    if (payload instanceof NextResponse) return payload;
    const invalid = validationResponse(payload);
    if (invalid) return invalid;

    const upsert = (extras: {
      status: string;
      metaTemplateId: string | null;
      submissionError: string | null;
    }) =>
      supabase
        .from('message_templates')
        .upsert(
          {
            account_id: accountId,
            user_id: userId,
            name: payload.name,
            language: payload.language,
            ...rowFields(payload),
            status: extras.status,
            meta_template_id: extras.metaTemplateId,
            submission_error: extras.submissionError,
            rejection_reason: null,
            last_submitted_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,name,language' }
        )
        .select()
        .single();

    const dryRun = isDryRun();
    let metaTemplateId: string;
    let metaStatus: string;

    if (dryRun) {
      metaTemplateId = `dry-run-${crypto.randomUUID()}`;
      metaStatus = 'PENDING';
    } else {
      const { data: config, error: configError } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .single();
      if (configError || !config) {
        return NextResponse.json(
          { error: t('common.whatsappNotConfiguredConnect') },
          { status: 400 }
        );
      }
      if (!config.waba_id) {
        return NextResponse.json(
          { error: t('common.wabaIdMissing') },
          { status: 400 }
        );
      }
      const accessToken = decrypt(config.access_token);

      try {
        await ensureCardHandles(payload, accessToken);
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : t('templates.headerUploadFailed'),
          },
          { status: 400 }
        );
      }

      try {
        const meta = await submitMessageTemplate({
          wabaId: config.waba_id,
          accessToken,
          payload: asUpstreamPayload(buildMetaCarouselTemplatePayload(payload)),
        });
        metaTemplateId = meta.id;
        metaStatus = meta.status;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t('templates.metaSubmitFailed');
        await upsert({
          status: 'DRAFT',
          metaTemplateId: null,
          submissionError: message,
        });
        const isRateLimit = /\b429\b/.test(message);
        return NextResponse.json(
          { error: isRateLimit ? t('templates.rateLimit') : message },
          { status: isRateLimit ? 429 : 502 }
        );
      }
    }

    const { data: row, error: upsertErr } = await upsert({
      status: normalizeStatus(metaStatus),
      metaTemplateId,
      submissionError: null,
    });
    if (upsertErr) {
      return NextResponse.json(
        {
          error: t('templates.submittedSaveFailed', {
            message: upsertErr.message,
          }),
          meta_template_id: metaTemplateId,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, template: row, dry_run: dryRun });
  } catch (error) {
    return handleError(error, 'templates.submitFailed');
  }
}

/** PATCH — edit + resubmit an already-submitted carousel template. */
export async function editCarouselTemplate(request: Request, id: string) {
  try {
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: t('templates.invalidId') },
        { status: 400 }
      );
    }
    const { supabase, accountId } = await requireRole('admin');

    const payload = await readPayload(request);
    if (payload instanceof NextResponse) return payload;

    const { data: existing, error: lookupErr } = await supabase
      .from('message_templates')
      .select('id, name, status, meta_template_id, language, header_type')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (lookupErr || !existing) {
      return NextResponse.json(
        { error: t('templates.notFound') },
        { status: 404 }
      );
    }
    // This route rewrites components as a CAROUSEL; never let it convert
    // an ordinary template (use the upstream edit route for those).
    if (existing.header_type !== 'carousel') {
      return NextResponse.json(
        { error: t('templates.validationFailed') },
        { status: 400 }
      );
    }
    if (!existing.meta_template_id) {
      return NextResponse.json(
        { error: t('templates.neverSubmitted') },
        { status: 400 }
      );
    }
    if (!EDITABLE_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          error: t('templates.statusNotEditable', {
            status: String(existing.status),
          }),
        },
        { status: 400 }
      );
    }

    const invalid = validationResponse(payload);
    if (invalid) return invalid;

    if (!isDryRun()) {
      const { data: config, error: configError } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .single();
      if (configError || !config) {
        return NextResponse.json(
          { error: t('common.whatsappNotConfiguredDot') },
          { status: 400 }
        );
      }
      const accessToken = decrypt(config.access_token);

      try {
        await ensureCardHandles(payload, accessToken);
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : t('templates.headerUploadFailed'),
          },
          { status: 400 }
        );
      }

      try {
        await editMessageTemplate({
          metaTemplateId: existing.meta_template_id,
          accessToken,
          components: asUpstreamPayload(
            buildMetaCarouselTemplatePayload(payload)
          ).components,
        });
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t('templates.metaEditFailed');
        await supabase
          .from('message_templates')
          .update({
            submission_error: message,
            last_submitted_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('account_id', accountId);
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    const { data: row, error: updErr } = await supabase
      .from('message_templates')
      .update({
        ...rowFields(payload),
        status: 'PENDING',
        submission_error: null,
        rejection_reason: null,
        last_submitted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();
    if (updErr) {
      return NextResponse.json(
        { error: t('templates.editedSaveFailed', { message: updErr.message }) },
        { status: 500 }
      );
    }
    return NextResponse.json({
      success: true,
      template: row,
      dry_run: isDryRun(),
    });
  } catch (error) {
    return handleError(error, 'templates.editFailed');
  }
}
