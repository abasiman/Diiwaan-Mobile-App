// app/OilCreateOffline/oilModalDb.ts
import { db } from '../db/db';

export type OilModalStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export type OilModalMode = 'single' | 'both';

export type OilModalRow = {
  id: number;
  owner_id: number;
  mode: OilModalMode;
  payload_json: string;  // JSON body for POST /diiwaanoil

  truck_rent: number;
  depot_cost: number;
  tax: number;
  currency: string;

  status: OilModalStatus;
  error?: string | null;
  remote_ids?: string | null; // JSON array or single id

  created_at: string;
  updated_at: string;
  last_attempt_at?: string | null;
};

export function initOilModalDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS oil_modal_forms (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id       INTEGER NOT NULL,
      mode           TEXT    NOT NULL,         -- 'single' | 'both'
      payload_json   TEXT    NOT NULL,

      truck_rent     REAL    NOT NULL DEFAULT 0,
      depot_cost     REAL    NOT NULL DEFAULT 0,
      tax            REAL    NOT NULL DEFAULT 0,
      currency       TEXT    NOT NULL,

      status         TEXT    NOT NULL DEFAULT 'pending', -- pending|syncing|failed|synced
      error          TEXT,
      remote_ids     TEXT,

      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL,
      last_attempt_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_oil_modal_owner_status
      ON oil_modal_forms(owner_id, status);

    CREATE INDEX IF NOT EXISTS idx_oil_modal_owner_created
      ON oil_modal_forms(owner_id, datetime(created_at) DESC);
  `);
}
