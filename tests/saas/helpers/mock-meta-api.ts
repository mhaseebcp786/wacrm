import type { Page } from '@playwright/test';

/**
 * Intercepts all Meta WhatsApp Cloud API calls and returns a mocked success response.
 * Call this at the start of any test that would trigger a WhatsApp send.
 */
export async function mockMetaApi(page: Page): Promise<void> {
  // Mock the internal send endpoint
  await page.route('**/api/whatsapp/send', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messageId: 'wamid.test_mock_id_12345' }),
    });
  });

  // Mock the v1 messages endpoint
  await page.route('**/api/v1/messages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { id: 'wamid.test_mock_id_12345', status: 'sent' } }),
    });
  });

  // Mock Meta Graph API directly (in case any client-side code calls it)
  await page.route('**/graph.facebook.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [{ id: 'wamid.test_mock_id_12345' }] }),
    });
  });

  // Mock template submit
  await page.route('**/api/whatsapp/templates/submit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'template_mock_123', status: 'PENDING' }),
    });
  });
}

/**
 * Returns a mock carousel interactive payload for use in tests.
 */
export function mockCarouselPayload() {
  return {
    kind: 'carousel' as const,
    body: 'Check out our featured products!',
    cards: [
      {
        card_index: 0,
        header_type: 'image' as const,
        header_url: 'https://example.com/product1.jpg',
        body_text: 'Product One - $29.99',
        button: { type: 'quick_reply' as const, title: 'Buy Now', id: 'card_0_btn' },
      },
      {
        card_index: 1,
        header_type: 'image' as const,
        header_url: 'https://example.com/product2.jpg',
        body_text: 'Product Two - $39.99',
        button: { type: 'quick_reply' as const, title: 'Buy Now', id: 'card_1_btn' },
      },
    ],
  };
}
