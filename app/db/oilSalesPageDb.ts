// app/db/oilSalesPageDb.ts
import { db } from './db';

/**
 * Master oilsales table for the main OilSalesPage (all sales).
 * This is separate from the customer-invoices oilsales table so we
 * don't clash with that schema.
 */
export function initOilSalesPageDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS oilsales_all (
      id                 INTEGER PRIMARY KEY,
      owner_id           INTEGER NOT NULL,

      customer           TEXT,
      customer_contact   TEXT,

      sale_type          TEXT NOT NULL,   -- 'invoice' | 'cashsale'

      oil_id             INTEGER NOT NULL,
      oil_type           TEXT NOT NULL,

      truck_plate        TEXT,
      truck_type         TEXT,
      truck_plate_extra  TEXT,

      unit_type          TEXT NOT NULL,   -- 'liters' | 'fuusto' | 'caag' | 'lot'
      unit_qty           INTEGER NOT NULL,
      unit_capacity_l    REAL,
      liters_sold        REAL NOT NULL,

      currency           TEXT NOT NULL,
      price_per_l        REAL,
      price_per_unit_type REAL,
      subtotal_native    REAL,
      discount_native    REAL,
      tax_native         REAL,
      total_native       REAL,
      fx_rate_to_usd     REAL,
      total_usd          REAL,

      payment_status     TEXT NOT NULL,   -- 'unpaid' | 'partial' | 'paid'
      payment_method     TEXT,
      paid_native        REAL,
      note               TEXT,

      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL,

      dirty              INTEGER NOT NULL DEFAULT 0,  -- 1 = needs sync
      deleted            INTEGER NOT NULL DEFAULT 0   -- soft delete
    );
  `);
}
