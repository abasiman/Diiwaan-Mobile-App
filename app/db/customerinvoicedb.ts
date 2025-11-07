//db/customerinvoicedb.ts
import { db } from './db';

/**
 * Oilsale table for invoices (customer-specific view uses this).
 * Mirrors backend OilSaleRead fields that the UI actually uses.
 */
export function initCustomerInvoiceDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS oilsales (
      id               INTEGER PRIMARY KEY,
      owner_id         INTEGER NOT NULL,

      customer         TEXT,
      customer_contact TEXT,

      oil_id           INTEGER NOT NULL,
      oil_type         TEXT NOT NULL,

      unit_type        TEXT NOT NULL,   -- 'liters' | 'fuusto' | 'caag' | 'lot'
      unit_qty         INTEGER NOT NULL,
      unit_capacity_l  REAL,
      liters_sold      REAL NOT NULL,

      currency         TEXT NOT NULL,   -- 3-letter
      price_per_l      REAL,
      subtotal_native  REAL,
      discount_native  REAL,
      tax_native       REAL,
      total_native     REAL,
      fx_rate_to_usd   REAL,
      total_usd        REAL,

      payment_status   TEXT NOT NULL,   -- 'unpaid' | 'partial' | 'paid'
      payment_method   TEXT,
      paid_native      REAL,
      note             TEXT,

      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,

      dirty            INTEGER NOT NULL DEFAULT 0,  -- 1 = needs sync
      deleted          INTEGER NOT NULL DEFAULT 0   -- 1 = soft deleted
    );
  `);
}
