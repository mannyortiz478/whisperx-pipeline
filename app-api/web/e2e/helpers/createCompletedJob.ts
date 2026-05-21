/**
 * Seeds a completed job directly into SQLite and navigates to its transcript page.
 * No speech API (real or mock) is required — data comes straight from the DB.
 * Used by tests 02-05 for deterministic, fast setup.
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), '../../shared/pipeline.db');
const OUTPUT_ROOT = path.resolve(process.cwd(), '../../shared/outputs');

export async function createCompletedJob(page: Page): Promise<string> {
  const ts    = Date.now();
  const jobId = `job_e2e_${ts}`;
  const spk1  = `spk_${ts}_00`;
  const spk2  = `spk_${ts}_01`;
  const seg1  = `seg_${ts}_0`;
  const seg2  = `seg_${ts}_1`;
  const seg3  = `seg_${ts}_2`;
  const ai1   = `ai_${ts}_0`;
  const now   = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // ── Seed the SQLite DB ──────────────────────────────────────────────────────
  const db = new Database(DB_PATH);
  try {
    db.pragma('foreign_keys = OFF');

    db.prepare(
      `INSERT INTO jobs (id, filename, filepath, status, transcription_model, language, duration, created_at, completed_at)
       VALUES (?, 'sample-short.mp3', '/tmp/e2e_dummy.mp3', 'completed', 'base', 'en', 12.5, ?, ?)`
    ).run(jobId, now, now);

    db.prepare(
      `INSERT INTO speakers (id, job_id, original_label, display_name, updated_at)
       VALUES (?, ?, 'SPEAKER_00', 'Speaker 1', ?)`
    ).run(spk1, jobId, now);

    db.prepare(
      `INSERT INTO speakers (id, job_id, original_label, display_name, updated_at)
       VALUES (?, ?, 'SPEAKER_01', 'Speaker 2', ?)`
    ).run(spk2, jobId, now);

    db.prepare(
      `INSERT INTO segments (id, job_id, speaker_id, start, end, text, original_text, confidence, updated_at)
       VALUES (?, ?, ?, 0.52, 4.10, 'Thanks everyone for joining today.', 'Thanks everyone for joining today.', 0.94, ?)`
    ).run(seg1, jobId, spk1, now);

    db.prepare(
      `INSERT INTO segments (id, job_id, speaker_id, start, end, text, original_text, confidence, updated_at)
       VALUES (?, ?, ?, 4.50, 8.91, 'Happy to be here, let us get started.', 'Happy to be here, let us get started.', 0.91, ?)`
    ).run(seg2, jobId, spk2, now);

    db.prepare(
      `INSERT INTO segments (id, job_id, speaker_id, start, end, text, original_text, confidence, updated_at)
       VALUES (?, ?, ?, 9.10, 12.50, 'I will follow up on the report by Friday.', 'I will follow up on the report by Friday.', 0.89, ?)`
    ).run(seg3, jobId, spk1, now);

    db.prepare(
      `INSERT INTO action_items (id, job_id, text, assignee, priority, timestamp, due_date)
       VALUES (?, ?, 'Follow up on the report by Friday', 'Speaker 1', 'medium', '00:09', NULL)`
    ).run(ai1, jobId);
  } finally {
    db.pragma('foreign_keys = ON');
    db.close();
  }

  // ── Create output directory + transcript.txt (needed by TXT export route) ──
  const outDir = path.join(OUTPUT_ROOT, jobId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'transcript.txt'),
    '[00:00] Speaker 1: Thanks everyone for joining today.\n' +
    '[04:30] Speaker 2: Happy to be here, let us get started.\n' +
    '[09:06] Speaker 1: I will follow up on the report by Friday.\n',
  );

  // ── Navigate to the transcript page (Flask reads from the seeded DB) ────────
  await page.goto(`/jobs/${jobId}/transcript`);
  await expect(page.getByTestId('segment-text').first()).toBeVisible({ timeout: 10_000 });

  return jobId;
}
