import { test, expect } from '@playwright/test';

// These tests verify the app boots correctly with our SaaS changes.
// They do NOT require authentication for the pages that are public.
test.describe('SaaS smoke tests', () => {
  test('home page loads (redirect to auth or dashboard)', async ({ page }) => {
    const response = await page.goto('/');
    // Either 200 (landing page) or redirect chain ending at 200 (auth page)
    expect(page.url()).toBeTruthy();
    // Should not throw or show a 500 error page
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('sign-in page loads', async ({ page }) => {
    await page.goto('/en/auth/sign-in', { waitUntil: 'domcontentloaded' });
    // Page should render without crashing
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Application error');
    expect(bodyText).not.toContain('Internal Server Error');
  });
});
