import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/testDb.js';
import { createCompletedJob } from '../helpers/createCompletedJob.js';

test.beforeEach(() => {
  resetDb();
});

test('search highlights matching transcript segments', async ({ page }) => {
  await createCompletedJob(page);

  const searchInput = page.getByTestId('search-input');
  await expect(searchInput).toBeVisible({ timeout: 5_000 });

  // Initially all 3 fixture segments are visible
  await expect(page.getByTestId('segment-text')).toHaveCount(3, { timeout: 5_000 });

  // Search for a term that matches only the third segment
  await searchInput.fill('Friday');

  // Only the matching segment should be rendered
  await expect(page.getByTestId('segment-text')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.getByTestId('segment-text').filter({ hasText: 'Friday' })).toBeVisible();

  // The visible segment container carries data-highlighted="true"
  await expect(page.locator('[data-highlighted="true"]')).toBeVisible();

  // Non-matching segments are gone from the DOM
  await expect(page.getByTestId('segment-text').filter({ hasText: 'joining today' })).toHaveCount(0);
});

test('search is case insensitive', async ({ page }) => {
  await createCompletedJob(page);

  await page.getByTestId('search-input').fill('friday');

  await expect(page.getByTestId('segment-text').filter({ hasText: 'Friday' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId('segment-text')).toHaveCount(1);
});

test('clearing search restores all segments', async ({ page }) => {
  await createCompletedJob(page);

  await page.getByTestId('search-input').fill('Friday');
  await expect(page.getByTestId('segment-text')).toHaveCount(1, { timeout: 5_000 });

  // Clear the search
  await page.getByTestId('search-input').fill('');
  await expect(page.getByTestId('segment-text')).toHaveCount(3, { timeout: 5_000 });

  // No highlighted attribute when search is empty
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0);
});
