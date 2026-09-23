import { expect, test } from '@playwright/test';

test('adds a quality check through the main user flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Quality checks' })).toBeVisible();
  await page.getByLabel('Check name').fill('E2E flow');
  await page.getByRole('button', { name: 'Add check' }).click();
  await expect(page.getByText('E2E flow')).toBeVisible();
});
