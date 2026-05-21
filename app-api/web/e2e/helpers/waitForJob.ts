import type { Page } from '@playwright/test';

/**
 * Polls GET /status/:jobId every second until the status is "done" or "error".
 * Throws if the job does not complete within `timeout` ms.
 * Returns the final status string.
 */
export async function waitForJobCompletion(
  page: Page,
  jobId: string,
  timeout = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const res  = await page.request.get(`/status/${jobId}`);
    const body = await res.json();
    const s: string = body.status;

    if (s === 'done' || s === 'error') return s;

    await page.waitForTimeout(1000);
  }

  throw new Error(`waitForJobCompletion: job ${jobId} did not complete within ${timeout}ms`);
}
