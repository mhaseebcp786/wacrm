import { test, expect } from '@playwright/test';

test.describe('Template media header send (API)', () => {
  test('POST /api/whatsapp/send with video template does not 500', async ({ request }) => {
    const response = await request.post('/api/whatsapp/send', {
      data: {
        conversationId: 'test-conv-id',
        messageType: 'template',
        templateName: 'test_video_template',
        templateMessageParams: {
          body: 'Hello {{1}}',
          headerMediaUrl: 'https://example.com/video.mp4',
        },
      },
    });
    // Should not 500 — auth will return 401 but server must not crash
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/whatsapp/templates/submit with carousel type does not 500', async ({ request }) => {
    const response = await request.post('/api/whatsapp/templates/submit', {
      data: {
        name: 'test_carousel_tmpl',
        category: 'Marketing',
        language: 'en',
        header_format: 'carousel',
        body_text: 'Check our products',
        carousel_cards: [
          {
            header_type: 'image',
            body_text: 'Product A',
            buttons: [{ type: 'QUICK_REPLY', text: 'Buy' }],
          },
          {
            header_type: 'image',
            body_text: 'Product B',
            buttons: [{ type: 'QUICK_REPLY', text: 'Buy' }],
          },
        ],
      },
    });
    expect(response.status()).not.toBe(500);
  });
});
