import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { resetDb, getJobCount } from '../helpers/testDb.js';

const TXT_PATH = path.resolve(process.cwd(), 'e2e/fixtures/invalid-file.txt');

test.beforeEach(() => {
  resetDb();
});

test('rejects unsupported file type', async ({ page }) => {
  await page.goto('/');

  // Wait for the file input to be present (renders only when no file is selected)
  const fileInput = page.getByTestId('file-input');
  await expect(fileInput).toBeAttached({ timeout: 5_000 });
  await fileInput.setInputFiles(TXT_PATH);

  // Button becomes enabled once a file is chosen and speech API is reachable
  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('upload-btn').click();

  // Inline error message should appear (Flask returns 400 for .txt)
  await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 10_000 });
  const errorText = await page.getByTestId('upload-error').textContent();
  expect(errorText?.toLowerCase()).toMatch(/unsupported|invalid|format/);

  // Page stays on /
  expect(page.url()).toMatch(/\/$/);

  // No job was created in the DB
  expect(getJobCount()).toBe(0);
});

test('rejects file exceeding size limit', async ({ page }) => {
  await page.goto('/');

  // Playwright caps in-memory buffers at 50 MB — write to disk instead
  const hugePath = path.join(os.tmpdir(), 'e2e-huge-upload.mp3');
  writeFileSync(hugePath, Buffer.alloc(101 * 1024 * 1024, 0));

  const fileInput = page.getByTestId('file-input');
  await expect(fileInput).toBeAttached({ timeout: 5_000 });
  await fileInput.setInputFiles(hugePath);

  // Upload button becomes enabled once a file is chosen
  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('upload-btn').click();

  // Client-side size guard fires immediately (no server round-trip)
  await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 5_000 });
  const errorText = await page.getByTestId('upload-error').textContent();
  expect(errorText?.toLowerCase()).toMatch(/large|size|maximum/);

  // No navigation away from /
  expect(page.url()).toMatch(/\/$/);
});

test('shows validation error and re-enables upload after failure', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await expect(fileInput).toBeAttached({ timeout: 5_000 });
  await fileInput.setInputFiles(TXT_PATH);

  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('upload-btn').click();

  // Error message appears
  await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 10_000 });

  // Upload button returns to enabled state (user can retry without refreshing)
  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 5_000 });
  await expect(page.getByTestId('upload-btn')).toHaveText(/Upload/i);
});
