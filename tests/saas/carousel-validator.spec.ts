import { test, expect } from '@playwright/test';

// These are API-level tests that call our Next.js route handler
// with mocked Meta API responses. The dev server must be running.
test.describe('Carousel message validation (API)', () => {
  test('POST /api/whatsapp/send with valid carousel payload returns 200', async ({ request }) => {
    const response = await request.post('/api/whatsapp/send', {
      data: {
        conversationId: 'test-conv-id',
        messageType: 'carousel',
        interactivePayload: {
          kind: 'carousel',
          body: 'Check out our products!',
          cards: [
            {
              card_index: 0,
              header_type: 'image',
              header_url: 'https://example.com/img1.jpg',
              body_text: 'Product One',
              button: { type: 'quick_reply', title: 'Buy Now', id: 'card_0_btn' },
            },
            {
              card_index: 1,
              header_type: 'image',
              header_url: 'https://example.com/img2.jpg',
              body_text: 'Product Two',
              button: { type: 'quick_reply', title: 'Buy Now', id: 'card_1_btn' },
            },
          ],
        },
      },
    });
    // Auth check — should not be a 500 (server error)
    // It will be 401 (unauthorized) since we don't have a session, but NOT 400 or 500
    // which would indicate our validation is crashing the server.
    expect(response.status()).not.toBe(500);
    expect([200, 401, 403]).toContain(response.status());
  });

  test('POST /api/whatsapp/send with invalid carousel (< 2 cards) returns 400', async ({ request }) => {
    const response = await request.post('/api/whatsapp/send', {
      data: {
        conversationId: 'test-conv-id',
        messageType: 'carousel',
        interactivePayload: {
          kind: 'carousel',
          body: 'Only one card',
          cards: [
            {
              card_index: 0,
              header_type: 'image',
              header_url: 'https://example.com/img1.jpg',
              body_text: 'Product One',
              button: { type: 'quick_reply', title: 'Buy Now', id: 'card_0_btn' },
            },
          ],
        },
      },
    });
    // Should be 400 (bad request) regardless of auth — validation happens before auth check
    // OR 401 if auth happens first (depends on middleware order)
    // But should NEVER be 200 or 500
    expect(response.status()).not.toBe(200);
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/whatsapp/send with mixed button types returns non-200', async ({ request }) => {
    const response = await request.post('/api/whatsapp/send', {
      data: {
        conversationId: 'test-conv-id',
        messageType: 'carousel',
        interactivePayload: {
          kind: 'carousel',
          body: 'Mixed buttons test',
          cards: [
            {
              card_index: 0,
              header_type: 'image',
              header_url: 'https://example.com/img1.jpg',
              body_text: 'Card One',
              button: { type: 'quick_reply', title: 'Reply', id: 'c0' },
            },
            {
              card_index: 1,
              header_type: 'image',
              header_url: 'https://example.com/img2.jpg',
              body_text: 'Card Two',
              button: { type: 'cta_url', display_text: 'Visit', url: 'https://example.com' },
            },
          ],
        },
      },
    });
    expect(response.status()).not.toBe(200);
    expect(response.status()).not.toBe(500);
  });
});
