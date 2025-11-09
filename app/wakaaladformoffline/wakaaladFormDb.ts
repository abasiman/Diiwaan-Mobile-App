// app/dbform/wakaaladFormDb.ts
import { db } from '../db/db';

export type WakaaladFormStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export type WakaaladFormRow = {
  id: number;                // local row id
  owner_id: number;
  oil_id: number;
  wakaalad_name: string;
  allocate_liters: number;
  date?: string | null;

  status: WakaaladFormStatus;
  error?: string | null;
  remote_id?: number | null;

  created_at: string;
  updated_at: string;
  last_attempt_at?: string | null;
};

/**
 * Call once on app startup (RootLayout) to ensure the table exists.
 */
export function initWakaaladFormDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS wakaalad_forms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id         INTEGER NOT NULL,
      oil_id           INTEGER NOT NULL,
      wakaalad_name    TEXT    NOT NULL,
      allocate_liters  REAL    NOT NULL,
      date             TEXT,

      status           TEXT    NOT NULL DEFAULT 'pending', -- pending|syncing|failed|synced
      error            TEXT,
      remote_id        INTEGER,

      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL,
      last_attempt_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wakaalad_forms_owner_status
      ON wakaalad_forms(owner_id, status);

    CREATE INDEX IF NOT EXISTS idx_wakaalad_forms_owner_created
      ON wakaalad_forms(owner_id, datetime(created_at) DESC);
  `);
}
