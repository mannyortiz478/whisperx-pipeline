import { test, expect } from '@playwright/test';
import { resetDb } from '../helpers/testDb.js';
import { createCompletedJob } from '../helpers/createCompletedJob.js';

test.beforeEach(() => {
  resetDb();
});

test('renames a speaker and updates all matching segments', async ({ page }) => {
  await createCompletedJob(page);

  // Click "Speaker 1" in the sidebar to enter rename mode
  const speakerLabel = page.getByTestId('speaker-label').filter({ hasText: 'Speaker 1' }).first();
  await expect(speakerLabel).toBeVisible({ timeout: 10_000 });
  await speakerLabel.click();

  // An input should appear focused with the current name
  const renameInput = page.locator('input[type="text"]').first();
  await expect(renameInput).toBeFocused({ timeout: 3_000 });
  await renameInput.selectText();
  await renameInput.fill('Alex');
  await renameInput.press('Enter');

  // All segment chips that showed "Speaker 1" should now show "Alex"
  await expect(page.getByTestId('segment-speaker').filter({ hasText: 'Alex' }).first()).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId('segment-speaker').filter({ hasText: 'Speaker 1' })).toHaveCount(0, {
    timeout: 5_000,
  });
});

test('speaker rename persists after page reload', async ({ page }) => {
  const jobId = await createCompletedJob(page);

  // Rename Speaker 1 → Alex
  const speakerLabel = page.getByTestId('speaker-label').filter({ hasText: 'Speaker 1' }).first();
  await speakerLabel.click();
  const renameInput = page.locator('input[type="text"]').first();
  await renameInput.selectText();
  await renameInput.fill('Alex');
  await renameInput.press('Enter');

  await expect(page.getByTestId('speaker-label').filter({ hasText: 'Alex' })).toBeVisible({
    timeout: 5_000,
  });

  // Reload and verify the rename persisted via the DB
  await page.goto(`/jobs/${jobId}/transcript`);
  await expect(page.getByTestId('segment-text').first()).toBeVisible({ timeout: 10_000 });

  await expect(page.getByTestId('speaker-label').filter({ hasText: 'Alex' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId('speaker-label').filter({ hasText: 'Speaker 1' })).toHaveCount(0);
});
