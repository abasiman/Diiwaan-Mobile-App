// /vendorPaymentsScreenDb.ts
import { db } from '../db/db';

export const VENDOR_PAYMENTS_SCREEN_TABLE = 'vendor_payments_screen';
export const VENDOR_PAYMENTS_SCREEN_META_TABLE = 'vendor_payments_screen_meta';

let _initialized = false;

export function initVendorPaymentsScreenDb() {
  if (_initialized) return;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${VENDOR_PAYMENTS_SCREEN_TABLE} (
      id             INTEGER PRIMARY KEY,
      owner_id       INTEGER NOT NULL,
      payment_index  INTEGER NOT NULL,
      data_json      TEXT    NOT NULL,
      updated_at     INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vp_screen_owner
      ON ${VENDOR_PAYMENTS_SCREEN_TABLE}(owner_id);
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${VENDOR_PAYMENTS_SCREEN_META_TABLE} (
      owner_id     INTEGER PRIMARY KEY NOT NULL,
      last_sync_ts INTEGER
    );
  `);

  _initialized = true;
}
