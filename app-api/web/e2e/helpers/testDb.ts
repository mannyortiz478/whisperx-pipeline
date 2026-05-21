import Database from 'better-sqlite3';
import path from 'path';

// Resolve DB path relative to the web/ package root (where `npx playwright test` runs)
const DB_PATH = path.resolve(process.cwd(), '../../shared/pipeline.db');

function open() {
  return new Database(DB_PATH);
}

/** Wipe all rows in dependency order so the next test starts clean. */
export function resetDb() {
  const db = open();
  try {
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM action_items').run();
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM speakers').run();
    db.prepare('DELETE FROM jobs').run();
    db.pragma('foreign_keys = ON');
  } finally {
    db.close();
  }
}

export function getJob(jobId: string) {
  const db = open();
  try {
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

export function getSpeakers(jobId: string) {
  const db = open();
  try {
    return db.prepare('SELECT * FROM speakers WHERE job_id = ?').all(jobId) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

export function getSegments(jobId: string) {
  const db = open();
  try {
    return db.prepare('SELECT * FROM segments WHERE job_id = ?').all(jobId) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

export function getJobCount() {
  const db = open();
  try {
    const row = db.prepare('SELECT COUNT(*) as n FROM jobs').get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}
