// app/dbform/wakaaladFormDb.ts
import { db } from '../db/db';

export type WakaaladFormStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type WakaaladFormRow = {
  id: number;
  owner_id: number;
  oil_id: number;
  wakaalad_name: string;
  allocate_liters: number;
  date: string | null;
  temp_wakaalad_id: number | null; // 🔹 new column
  status: WakaaladFormStatus;
  error: string | null;
  remote_id: number | null;
  created_at: string;
  updated_at: string;
  last_attempt_at: string | null;
};

export function initWakaaladFormDb() {
  // 1) Ensure table exists (new installs will get the full schema)
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS wakaalad_forms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id         INTEGER NOT NULL,
      oil_id           INTEGER NOT NULL,
      wakaalad_name    TEXT    NOT NULL,
      allocate_liters  REAL    NOT NULL,
      date             TEXT,
      temp_wakaalad_id INTEGER,
      status           TEXT    NOT NULL,
      error            TEXT,
      remote_id        INTEGER,
      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL,
      last_attempt_at  TEXT
    );
    `,
    []
  );

  // 2) Migration for existing DBs that don't have temp_wakaalad_id yet
  const cols = db.getAllSync<{ name: string }>(
    `PRAGMA table_info(wakaalad_forms);`,
    []
  );

  const hasTempCol = cols.some((c) => c.name === 'temp_wakaalad_id');

  if (!hasTempCol) {
    // old schema → add column
    db.runSync(
      `ALTER TABLE wakaalad_forms ADD COLUMN temp_wakaalad_id INTEGER;`,
      []
    );
  }
}
