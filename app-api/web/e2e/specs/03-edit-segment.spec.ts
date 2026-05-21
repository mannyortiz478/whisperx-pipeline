import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/testDb.js';
import { createCompletedJob } from '../helpers/createCompletedJob.js';

test.beforeEach(() => {
  resetDb();
});

test('edits a transcript segment and persists the change', async ({ page }) => {
  const jobId = await createCompletedJob(page);

  // Click the first fixture segment to enter edit mode
  const segmentText = page.getByTestId('segment-text').filter({
    hasText: 'Thanks everyone for joining today.',
  });
  await expect(segmentText).toBeVisible({ timeout: 10_000 });
  await segmentText.click();

  // Textarea should appear
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 3_000 });
  await textarea.selectText();
  await textarea.fill('Thanks everyone for joining us today.');

  // Blur to trigger auto-save
  await textarea.press('Tab');

  // Save indicator should show "saved"
  await expect(page.locator('[data-testid="save-indicator"][data-status="saved"]')).toBeVisible({
    timeout: 10_000,
  });

  // Reload and verify persistence via the DB
  await page.goto(`/jobs/${jobId}/transcript`);
  await expect(page.getByTestId('segment-text').first()).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByTestId('segment-text').filter({ hasText: 'Thanks everyone for joining us today.' }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByTestId('segment-text').filter({ hasText: 'Thanks everyone for joining today.' }),
  ).toHaveCount(0);
});

test('shows saving state during save', async ({ page }) => {
  await createCompletedJob(page);

  // Delay the PATCH segment endpoint by 600ms
  await page.route('**/segments/**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await page.waitForTimeout(600);
    }
    await route.continue();
  });

  const segmentText = page.getByTestId('segment-text').first();
  await segmentText.click();

  const textarea = page.locator('textarea').first();
  await textarea.selectText();
  await textarea.fill('Edited text here.');

  // Blur — triggers auto-save which is now delayed 600ms
  await textarea.press('Tab');

  // "saving" indicator should appear while request is in-flight
  await expect(page.locator('[data-testid="save-indicator"][data-status="saving"]')).toBeVisible({
    timeout: 3_000,
  });

  // After the delay resolves, "saved" should appear
  await expect(page.locator('[data-testid="save-indicator"][data-status="saved"]')).toBeVisible({
    timeout: 5_000,
  });
});
