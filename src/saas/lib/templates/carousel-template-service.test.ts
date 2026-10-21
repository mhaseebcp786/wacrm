import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertRows: [] as Record<string, unknown>[],
  updateRows: [] as Record<string, unknown>[],
  submit: vi.fn(),
  edit: vi.fn(),
  ensureHandle: vi.fn(),
  existing: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/lib/auth/account', () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  const chain = (table: string) => {
    const api = {
      select: () => api,
      eq: () => api,
      single: async () =>
        table === 'whatsapp_config'
          ? { data: { waba_id: 'waba1', access_token: 'enc' }, error: null }
          : {
              data: mocks.upsertRows.at(-1) ?? mocks.updateRows.at(-1),
              error: null,
            },
      maybeSingle: async () => ({ data: mocks.existing.current, error: null }),
      upsert: (row: Record<string, unknown>) => {
        mocks.upsertRows.push(row);
        return api;
      },
      update: (row: Record<string, unknown>) => {
        mocks.updateRows.push(row);
        return api;
      },
    };
    return api;
  };
  return {
    UnauthorizedError,
    ForbiddenError,
    toErrorResponse: () => new Response('err', { status: 401 }),
    requireRole: async () => ({
      supabase: { from: chain },
      accountId: 'acc1',
      userId: 'user1',
    }),
  };
});
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: () => 'token' }));
vi.mock('@/lib/whatsapp/meta-api', () => ({
  submitMessageTemplate: mocks.submit,
  editMessageTemplate: mocks.edit,
}));
vi.mock('@/lib/whatsapp/template-header-handle', () => ({
  ensureMediaHeaderHandle: mocks.ensureHandle,
}));

import {
  editCarouselTemplate,
  submitCarouselTemplate,
} from './carousel-template-service';

const card = (n: number) => ({
  header_type: 'image',
  header_media_url: `https://cdn.example.com/${n}.jpg`,
  body_text: `Card ${n}`,
  buttons: [{ type: 'QUICK_REPLY', text: 'More' }],
});

const body = (overrides: Record<string, unknown> = {}) => ({
  name: 'spring_carousel',
  category: 'Marketing',
  language: 'en_US',
  body_text: 'Spring picks',
  carousel_cards: [card(1), card(2)],
  ...overrides,
});

const req = (payload: unknown) =>
  new Request('http://x/api', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

describe('carousel template service', () => {
  beforeEach(() => {
    mocks.upsertRows.length = 0;
    mocks.updateRows.length = 0;
    mocks.submit
      .mockReset()
      .mockResolvedValue({ id: 'meta-1', status: 'PENDING' });
    mocks.edit.mockReset().mockResolvedValue({ success: true });
    mocks.ensureHandle
      .mockReset()
      .mockImplementation(async (p: { header_handle?: string }) => {
        p.header_handle = 'handle-xyz';
      });
    mocks.existing.current = null;
    vi.stubEnv('WHATSAPP_TEMPLATES_DRY_RUN', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects an invalid carousel with 400 and never calls Meta', async () => {
    const res = await submitCarouselTemplate(
      req(body({ carousel_cards: [card(1)] }))
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Minimum 2 cards/);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('creates media handles per card, submits a CAROUSEL component and persists cards', async () => {
    const res = await submitCarouselTemplate(req(body()));
    expect(res.status).toBe(200);
    expect(mocks.ensureHandle).toHaveBeenCalledTimes(2);

    const sent = mocks.submit.mock.calls[0][0].payload;
    expect(sent.category).toBe('MARKETING');
    expect(sent.components.map((c: { type: string }) => c.type)).toEqual([
      'BODY',
      'CAROUSEL',
    ]);
    expect(sent.components[1].cards[0].components[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['handle-xyz'] },
    });

    const row = mocks.upsertRows[0];
    expect(row).toMatchObject({
      account_id: 'acc1',
      header_type: 'carousel',
      header_media_url: null,
      status: 'PENDING',
      meta_template_id: 'meta-1',
    });
    // Persisted cards keep the sample URL but drop the one-shot upload handle.
    const stored = row.carousel_cards as Record<string, unknown>[];
    expect(stored[0]).toMatchObject({
      header_media_url: 'https://cdn.example.com/1.jpg',
    });
    expect(stored[0]).not.toHaveProperty('header_handle');
  });

  it('dry-run skips Meta and media upload but still persists the template', async () => {
    vi.stubEnv('WHATSAPP_TEMPLATES_DRY_RUN', 'true');
    const res = await submitCarouselTemplate(req(body()));
    expect(res.status).toBe(200);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.ensureHandle).not.toHaveBeenCalled();
    expect(String(mocks.upsertRows[0].meta_template_id)).toMatch(/^dry-run-/);
  });

  it('keeps the row as DRAFT with the error when Meta rejects the submit', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('(#100) Invalid parameter'));
    const res = await submitCarouselTemplate(req(body()));
    expect(res.status).toBe(502);
    expect(mocks.upsertRows[0]).toMatchObject({
      status: 'DRAFT',
      submission_error: '(#100) Invalid parameter',
    });
  });

  it('edit: requires an approved/rejected/paused, already-submitted template', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    mocks.existing.current = {
      id,
      name: 'spring_carousel',
      status: 'PENDING',
      meta_template_id: 'm1',
      language: 'en_US',
      header_type: 'carousel',
    };
    const blocked = await editCarouselTemplate(req(body()), id);
    expect(blocked.status).toBe(400);

    mocks.existing.current = {
      id,
      name: 'spring_carousel',
      status: 'APPROVED',
      meta_template_id: 'm1',
      language: 'en_US',
      header_type: 'carousel',
    };
    const ok = await editCarouselTemplate(req(body()), id);
    expect(ok.status).toBe(200);
    expect(
      mocks.edit.mock.calls[0][0].components.map(
        (c: { type: string }) => c.type
      )
    ).toEqual(['BODY', 'CAROUSEL']);
    expect(mocks.updateRows[0]).toMatchObject({
      header_type: 'carousel',
      status: 'PENDING',
    });
  });

  it('edit: refuses to convert a non-carousel template', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    mocks.existing.current = {
      id,
      name: 'plain',
      status: 'APPROVED',
      meta_template_id: 'm1',
      language: 'en_US',
      header_type: 'image',
    };
    const res = await editCarouselTemplate(req(body()), id);
    expect(res.status).toBe(400);
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it('drops unknown fields and non-string values from untrusted JSON', async () => {
    const res = await submitCarouselTemplate(
      req(
        body({
          is_admin: true,
          carousel_cards: [
            {
              ...card(1),
              evil: 'x',
              buttons: [{ type: 'QUICK_REPLY', text: 'More', junk: 1 }],
            },
            { ...card(2), buttons: [{ type: 'QUICK_REPLY', text: 'More' }] },
          ],
        })
      )
    );
    expect(res.status).toBe(200);
    const stored = mocks.upsertRows[0].carousel_cards as Record<
      string,
      unknown
    >[];
    expect(stored[0]).not.toHaveProperty('evil');
    expect(stored[0].buttons).toEqual([{ type: 'QUICK_REPLY', text: 'More' }]);
    expect(mocks.upsertRows[0]).not.toHaveProperty('is_admin');
  });

  it('returns 400 (not 500) when cards is not an array', async () => {
    const res = await submitCarouselTemplate(
      req(body({ carousel_cards: 'nope' }))
    );
    expect(res.status).toBe(400);
  });

  it('edit: rejects a malformed id', async () => {
    const res = await editCarouselTemplate(req(body()), '../etc/passwd');
    expect(res.status).toBe(400);
  });
});
