//vendorPaymentDb.ts

import { db } from '../db/db';

export const VENDOR_PAYMENTS_TABLE = 'vendor_payments';

// 👇 add these so oilpurchasevendorbillsrepo.ts can import them
export const VENDOR_BILLS_TABLE = 'vendor_bills';
export const VENDOR_BILLS_META_TABLE = 'vendor_bills_meta';

let _initialized = false;

export function initVendorPaymentDb() {
  if (_initialized) return;

  // --- Main vendor payments table (mirror of DiiwaanVendorPayment) ---
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${VENDOR_PAYMENTS_TABLE} (
      id              INTEGER PRIMARY KEY,
      owner_id        INTEGER NOT NULL,

      amount          REAL    NOT NULL,
      amount_due      REAL    NOT NULL DEFAULT 0.0,
      note            TEXT,

      payment_date    TEXT    NOT NULL,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL,

      truck_plate     TEXT,
      truck_type      TEXT,

      extra_cost_id   INTEGER,
      transaction_type TEXT,

      payment_method  TEXT,
      supplier_name   TEXT    NOT NULL,

      oil_id          INTEGER,
      lot_id          INTEGER,

      -- offline-only flags
      dirty           INTEGER NOT NULL DEFAULT 0,   -- 1 = needs sync
      deleted         INTEGER NOT NULL DEFAULT 0,   -- soft delete

      -- mirrors backend ck_vendorpay_amount_and_due_valid
      CHECK (
        (amount >= 0 AND amount_due >= 0)
        AND ((amount > 0) OR (amount_due > 0))
      )
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_owner_date
    ON ${VENDOR_PAYMENTS_TABLE} (owner_id, payment_date);
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_owner_supplier
    ON ${VENDOR_PAYMENTS_TABLE} (owner_id, supplier_name);
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_owner_oil
    ON ${VENDOR_PAYMENTS_TABLE} (owner_id, oil_id);
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_payment_method
    ON ${VENDOR_PAYMENTS_TABLE} (payment_method);
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_amount_due
    ON ${VENDOR_PAYMENTS_TABLE} (amount_due);
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_created_at
    ON ${VENDOR_PAYMENTS_TABLE} (created_at);
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendorpay_updated_at
    ON ${VENDOR_PAYMENTS_TABLE} (updated_at);
  `);

  // --- Offline vendor bills cache (JSON blob per bill) ---
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${VENDOR_BILLS_TABLE} (
      id          INTEGER PRIMARY KEY,
      owner_id    INTEGER NOT NULL,
      bill_index  INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_vendor_bills_owner
      ON ${VENDOR_BILLS_TABLE}(owner_id);
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${VENDOR_BILLS_META_TABLE} (
      owner_id     INTEGER PRIMARY KEY NOT NULL,
      last_sync_ts INTEGER
    );
  `);

  _initialized = true;
}
