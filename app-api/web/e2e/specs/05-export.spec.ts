import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resetDb } from '../helpers/testDb.js';
import { createCompletedJob } from '../helpers/createCompletedJob.js';

test.beforeEach(() => {
  resetDb();
});

test('exports TXT file', async ({ page }) => {
  await createCompletedJob(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-txt').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.txt$/);

  const filePath = await download.path();
  const content  = readFileSync(filePath!, 'utf-8');

  expect(content).toMatch(/Speaker (1|2)/);
  expect(content).toContain('Thanks everyone');
});

test('exports DOCX file', async ({ page }) => {
  await createCompletedJob(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-docx').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.docx$/);

  const filePath = await download.path();
  const bytes    = readFileSync(filePath!);
  // DOCX is a ZIP archive — magic bytes PK (0x50 0x4B)
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
  expect(bytes.length).toBeGreaterThan(1000);
});

test('exports PDF file', async ({ page }) => {
  await createCompletedJob(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-pdf').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const filePath = await download.path();
  const bytes    = readFileSync(filePath!);
  // PDF magic bytes: %PDF
  const magic = bytes.slice(0, 4).toString('ascii');
  expect(magic).toBe('%PDF');
});

test('export without timestamps omits timestamps', async ({ page }) => {
  await createCompletedJob(page);

  // Turn the timestamp toggle OFF
  await page.getByTestId('timestamps-toggle').click();
  await page.waitForTimeout(100); // let React state update

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-txt').click(),
  ]);

  const filePath = await download.path();
  const content  = readFileSync(filePath!, 'utf-8');

  // No "[MM:SS]" timestamp pattern in the output
  expect(content).not.toMatch(/\[\d{2}:\d{2}/);

  // Speaker names and transcript text still present
  expect(content).toMatch(/Speaker (1|2)/);
  expect(content).toContain('Thanks everyone');
});
