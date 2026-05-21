/**
 * Tests the browser-side upload + status-polling + transcript flow.
 * Uses Playwright route interception so the real speech API is never invoked.
 * Flask's /upload is intercepted to return a fake job_id immediately.
 * Flask's /status/* is intercepted to return pre-defined fixture data.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { resetDb } from '../helpers/testDb.js';

const MP3_PATH = path.resolve(process.cwd(), 'e2e/fixtures/sample-short.mp3');
const FAKE_JOB = 'job_e2e_upload_01';

const MOCK_DONE_RESPONSE = {
  status: 'done',
  progress: 100,
  message: 'Complete!',
  filename: 'sample-short.mp3',
  result: {
    job_id: FAKE_JOB,
    language: 'en',
    duration: 12.5,
    speaker_count: 2,
    segment_count: 3,
    speakers: [
      { speaker_id: 'SP_00', original_label: 'SPEAKER_00', display_name: 'Speaker 1' },
      { speaker_id: 'SP_01', original_label: 'SPEAKER_01', display_name: 'Speaker 2' },
    ],
    transcript: [
      { segment_id: 's1', speaker: 'Speaker 1', speaker_id: 'SP_00', start: 0.52, end: 4.10, text: 'Thanks everyone for joining today.', timestamp: '00:00' },
      { segment_id: 's2', speaker: 'Speaker 2', speaker_id: 'SP_01', start: 4.50, end: 8.91, text: 'Happy to be here, let us get started.', timestamp: '04:30' },
      { segment_id: 's3', speaker: 'Speaker 1', speaker_id: 'SP_00', start: 9.10, end: 12.50, text: 'I will follow up on the report by Friday.', timestamp: '09:06' },
    ],
    action_items: [],
    full_text: 'Thanks everyone for joining today. Happy to be here, let us get started. I will follow up on the report by Friday.',
  },
};

test.beforeEach(() => {
  resetDb();
});

test('uploads a valid MP3 and completes transcription', async ({ page }) => {
  // Intercept /upload → return fake job_id (no real Flask upload)
  await page.route('**/upload', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: FAKE_JOB }) }),
  );

  // Intercept /status/* → return processing once, then done with fixture data
  let statusCalls = 0;
  await page.route(`**/status/${FAKE_JOB}`, (route) => {
    statusCalls++;
    const body =
      statusCalls < 2
        ? { status: 'processing', progress: 50, message: 'Transcribing audio...', filename: 'sample-short.mp3' }
        : MOCK_DONE_RESPONSE;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/');

  // Wait for speech API health indicator (real or mocked — any "Ready" text works)
  await expect(page.getByTestId('speech-api-status')).toHaveText('Speech API: Ready', {
    timeout: 15_000,
  });

  // Set the file on the hidden input
  await page.getByTestId('file-input').setInputFiles(MP3_PATH);

  // Upload button becomes enabled once a file is selected and API is healthy
  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 5_000 });
  await page.getByTestId('upload-btn').click();

  // Should navigate to /jobs/:jobId (status page)
  await page.waitForURL(`**/${FAKE_JOB}`, { timeout: 15_000 });

  // Status page shows filename
  await expect(page.getByText('sample-short.mp3')).toBeVisible({ timeout: 10_000 });

  // Some progress indicator should appear
  await expect(page.locator('[class*="pulse"], [class*="progress"], .animate-spin').first()).toBeVisible({
    timeout: 5_000,
  });

  // Auto-navigate to transcript page (triggered by status = "done")
  await page.waitForURL(`**/jobs/${FAKE_JOB}/transcript`, { timeout: 15_000 });

  // Transcript segments are visible
  await expect(page.getByTestId('segment-text').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Thanks everyone for joining today.')).toBeVisible();

  // Speaker labels are visible
  await expect(page.getByTestId('speaker-label').first()).toBeVisible();

  // Audio player element is in the DOM
  await expect(page.locator('audio')).toBeAttached();
});

test('shows upload progress during file upload', async ({ page }) => {
  // Slow the upload response by 800ms so progress bar has time to appear
  await page.route('**/upload', async (route) => {
    await page.waitForTimeout(800);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: FAKE_JOB }) });
  });

  await page.goto('/');
  await expect(page.getByTestId('speech-api-status')).toHaveText('Speech API: Ready', {
    timeout: 15_000,
  });

  await page.getByTestId('file-input').setInputFiles(MP3_PATH);
  await expect(page.getByTestId('upload-btn')).toBeEnabled({ timeout: 5_000 });

  // Click upload — progress bar should appear while the request is in-flight
  await page.getByTestId('upload-btn').click();

  await expect(page.getByTestId('upload-progress')).toBeVisible({ timeout: 5_000 });

  // Discard any in-flight route callbacks so their delayed responses don't
  // cause a "Test ended" error after the test function returns.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
