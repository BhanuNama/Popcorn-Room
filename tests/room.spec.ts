import { test, expect } from '@playwright/test';

test.describe('The Orbit End-to-End Watch Party Flow', () => {
  test('Landing page renders hero, features and sound architecture', async ({ page }) => {
    await page.goto('/');

    // Check header and titles
    await expect(page).toHaveTitle(/The Orbit/i);
    await expect(page.getByRole('heading', { name: /one screen at the center\./i })).toBeVisible();

    // Check features
    await expect(page.getByText('Everything a watch party needs')).toBeVisible();
    await expect(page.getByText('The movie sounds like the movie')).toBeVisible();

    // Check sound tracks
    await expect(page.getByText('Movie Audio Track')).toBeVisible();
    await expect(page.getByText('Voice Mic Track')).toBeVisible();
  });

  test('Host creates a room, guest joins, and chat communicates', async ({ browser }) => {
    // 1. Host context
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');

    // Open create dialog
    await hostPage.getByTestId('hero-create').click();
    await hostPage.getByTestId('create-name').fill('Alice');
    await hostPage.getByTestId('create-submit').click();

    // Wait for redirect to room
    await hostPage.waitForURL(/\/r\/[a-z0-9]+/);
    const roomUrl = hostPage.url();
    expect(roomUrl).toContain('/r/');

    // 2. Guest context
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(roomUrl);

    // Guest fills name
    await expect(guestPage.getByRole('heading', { name: /Alice's room/i })).toBeVisible();
    await guestPage.getByPlaceholder(/e\.g\. Maya/i).fill('Bob');
    await guestPage.getByRole('button', { name: /Join Room/i }).click();

    // Verify both participants load stage
    await expect(guestPage.getByRole('region', { name: /watch party stage/i })).toBeVisible({ timeout: 10000 });
    await expect(hostPage.getByRole('region', { name: /watch party stage/i })).toBeVisible({ timeout: 10000 });

    // 3. Clean up
    await hostContext.close();
    await guestContext.close();
  });
});
