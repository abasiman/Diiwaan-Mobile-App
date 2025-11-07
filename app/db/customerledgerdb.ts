// app/db/customerledgerdb.ts
import { db } from './db';

/**
 * Payments / ledger table for offline customer ledger view.
 * Mirrors backend fields that the UI actually uses.
 */
export function initCustomerLedgerDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS payments (
      id               INTEGER PRIMARY KEY,
      owner_id         INTEGER NOT NULL,

      customer_id      INTEGER,
      customer_name    TEXT NOT NULL,

      transaction_type TEXT NOT NULL,     -- 'debit' | 'credit'
      amount           REAL NOT NULL,
      note             TEXT,
      payment_method   TEXT,
      payment_date     TEXT NOT NULL,     -- ISO
      created_at       TEXT NOT NULL,     -- ISO
      invoice_id       INTEGER,

      dirty            INTEGER NOT NULL DEFAULT 0,  -- 1 = needs sync
      deleted          INTEGER NOT NULL DEFAULT 0   -- soft delete
    );
  `);
}
