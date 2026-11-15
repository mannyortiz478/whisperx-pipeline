import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { resetDb, getJobCount } from '../helpers/testDb.js';

const TXT_PATH = path.resolve(process.cwd(), 'e2e/fixtures/invalid-file.txt');
const MP3_PATH = path.resolve(process.cwd(), 'e2e/fixtures/sample-short.mp3');

test.beforeEach(() => {
  resetDb();
});

test('rejects unsupported file type', async ({ page }) => {
  await page.goto('/');

  // Wait for the file input to be present (renders only when no file is selected)
  const fileInput = page.getByTestId('file-input');
  await expect(fileInput).toBeAttached({ timeout: 5_000 });
  await fileInput.setInputFiles(TXT_PATH);

  // Client-side validation rejects the file on selection: inline error, button stays disabled
  await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 5_000 });
  const errorText = await page.getByTestId('upload-error').textContent();
  expect(errorText?.toLowerCase()).toMatch(/unsupported|invalid|format/);
  await expect(page.getByTestId('upload-btn')).toBeDisabled();

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

  // Client-side size guard fires on selection (no server round-trip)
  await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 5_000 });
  const errorText = await page.getByTestId('upload-error').textContent();
  expect(errorText?.toLowerCase()).toMatch(/large|size|maximum/);
  await expect(page.getByTestId('upload-btn')).toBeDisabled();

  // No navigation away from /
  expect(page.url()).toMatch(/\/$/);
});

test('shows validation error and re-enables upload after choosing a valid file', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await expect(fileInput).toBeAttached({ timeout: 5_000 });
  await fileInput.setInputFiles(TXT_PATH);

  // Error message appears and upload is blocked
  await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('upload-btn')).toBeDisabled();

  // Choosing a valid file clears the error and re-enables upload (no page refresh needed)
  await fileInput.setInputFiles(MP3_PATH);
  await expect(page.getByTestId('upload-error')).toBeHidden();
  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId('upload-btn')).toHaveText(/Upload/i);
});
