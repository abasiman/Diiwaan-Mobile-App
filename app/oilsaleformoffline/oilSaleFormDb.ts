// app/oilsaleformoffline/oilSaleFormDb.ts
import { db } from '../db/db';

export type OilSaleFormStatus = 'pending' | 'syncing' | 'failed' | 'synced';
export type OilSaleFormUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';
export type OilSaleFormSaleType = 'cashsale' | 'invoice';

export type OilSaleFormRow = {
  id: number; // local row id
  owner_id: number;
  oil_id: number;
  wakaalad_id: number;

  unit_type: OilSaleFormUnitType;
  unit_qty?: number | null;
  liters_sold?: number | null;
  price_per_l?: number | null;

  customer?: string | null;
  customer_contact?: string | null;
  currency?: string | null;
  fx_rate_to_usd?: number | null;

  sale_type: OilSaleFormSaleType;
  payment_method?: 'cash' | 'bank' | null;

  // NEW
  oil_type?: string | null;
  truck_plate?: string | null;

  status: OilSaleFormStatus;
  error?: string | null;
  remote_id?: number | null;

  created_at: string;
  updated_at: string;
  last_attempt_at?: string | null;
};

/**
 * Call once on app startup (RootLayout) to ensure the table exists.
 */
export function initOilSaleFormDb() {
  // Base table (new installs get full schema)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS oil_sale_forms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id         INTEGER NOT NULL,
      oil_id           INTEGER NOT NULL,
      wakaalad_id      INTEGER NOT NULL,

      unit_type        TEXT    NOT NULL,
      unit_qty         REAL,
      liters_sold      REAL,
      price_per_l      REAL,

      customer         TEXT,
      customer_contact TEXT,
      currency         TEXT,
      fx_rate_to_usd   REAL,

      sale_type        TEXT    NOT NULL,
      payment_method   TEXT,

      oil_type         TEXT,
      truck_plate      TEXT,

      status           TEXT    NOT NULL DEFAULT 'pending', -- pending|syncing|failed|synced
      error            TEXT,
      remote_id        INTEGER,

      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL,
      last_attempt_at  TEXT
    );
  `);

  // Migration for older DBs that don't have oil_type/truck_plate yet
  try {
    db.execSync(`SELECT oil_type, truck_plate FROM oil_sale_forms LIMIT 1;`);
  } catch {
    try {
      db.execSync(`ALTER TABLE oil_sale_forms ADD COLUMN oil_type TEXT;`);
    } catch {}
    try {
      db.execSync(`ALTER TABLE oil_sale_forms ADD COLUMN truck_plate TEXT;`);
    } catch {}
  }

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_oil_sale_forms_owner_status
      ON oil_sale_forms(owner_id, status);

    CREATE INDEX IF NOT EXISTS idx_oil_sale_forms_owner_created
      ON oil_sale_forms(owner_id, datetime(created_at) DESC);
  `);
}
