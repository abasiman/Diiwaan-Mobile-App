// app/oilsalesdashboarddb.ts

import { db } from '../db/db';

const TABLE_NAME = 'oil_sales_dashboard';

/**
 * Call once at app startup (RootLayout) to ensure table + index exist.
 */
export function initOilSalesDashboardDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY NOT NULL,
      owner_id INTEGER NOT NULL,
      created_at TEXT,
      oil_type TEXT,
      customer TEXT,
      customer_contact TEXT,
      truck_plate TEXT,
      currency TEXT,
      unit_type TEXT,
      unit_qty REAL,
      liters_sold REAL,
      price_per_unit_type REAL,
      price_per_l REAL,
      fx_rate_to_usd REAL,
      total_native REAL,
      total_usd REAL,
      tax_native REAL,
      discount_native REAL,
      payment_method TEXT,
      payment_status TEXT,
      note TEXT
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_oil_sales_dashboard_owner_date
    ON ${TABLE_NAME} (owner_id, created_at);
  `);
}

/**
 * Upsert oil sale rows for a given owner into local SQLite.
 * `items` are server-shaped summary records from /oilsale/summary.
 */
export function upsertOilSalesRows(ownerId: number, items: any[]): void {
  if (!items || !items.length) return;

  db.withTransactionSync(() => {
    for (const it of items) {
      db.runSync(
        `
        INSERT INTO ${TABLE_NAME} (
          id,
          owner_id,
          created_at,
          oil_type,
          customer,
          customer_contact,
          truck_plate,
          currency,
          unit_type,
          unit_qty,
          liters_sold,
          price_per_unit_type,
          price_per_l,
          fx_rate_to_usd,
          total_native,
          total_usd,
          tax_native,
          discount_native,
          payment_method,
          payment_status,
          note
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id            = excluded.owner_id,
          created_at          = excluded.created_at,
          oil_type            = excluded.oil_type,
          customer            = excluded.customer,
          customer_contact    = excluded.customer_contact,
          truck_plate         = excluded.truck_plate,
          currency            = excluded.currency,
          unit_type           = excluded.unit_type,
          unit_qty            = excluded.unit_qty,
          liters_sold         = excluded.liters_sold,
          price_per_unit_type = excluded.price_per_unit_type,
          price_per_l         = excluded.price_per_l,
          fx_rate_to_usd      = excluded.fx_rate_to_usd,
          total_native        = excluded.total_native,
          total_usd           = excluded.total_usd,
          tax_native          = excluded.tax_native,
          discount_native     = excluded.discount_native,
          payment_method      = excluded.payment_method,
          payment_status      = excluded.payment_status,
          note                = excluded.note;
      `,
        [
          it.id,
          ownerId,
          it.created_at ?? null,
          it.oil_type ?? '',
          it.customer ?? '',
          it.customer_contact ?? '',
          it.truck_plate ?? '',
          it.currency ?? '',
          it.unit_type ?? '',
          it.unit_qty ?? 0,
          it.liters_sold ?? 0,
          it.price_per_unit_type ?? null,
          it.price_per_l ?? null,
          it.fx_rate_to_usd ?? null,
          it.total_native ?? 0,
          it.total_usd ?? null,
          it.tax_native ?? 0,
          it.discount_native ?? 0,
          it.payment_method ?? '',
          it.payment_status ?? '',
          it.note ?? '',
        ]
      );
    }
  });
}

/**
 * Read oil sales rows for an owner in a date range from local SQLite.
 */
export function listOilSalesRows(
  ownerId: number,
  opts: { fromISO?: string; toISO?: string; limit?: number }
): any[] {
  const { fromISO, toISO, limit } = opts || {};

  const params: any[] = [ownerId];
  let where = 'WHERE owner_id = ?';

  if (fromISO) {
    where += ' AND created_at >= ?';
    params.push(fromISO);
  }
  if (toISO) {
    where += ' AND created_at <= ?';
    params.push(toISO);
  }

  let limitSql = '';
  if (typeof limit === 'number' && limit > 0) {
    limitSql = 'LIMIT ?';
    params.push(limit);
  }

  const rows = db.getAllSync<any>(
    `
    SELECT
      id,
      owner_id,
      created_at,
      oil_type,
      customer,
      customer_contact,
      truck_plate,
      currency,
      unit_type,
      unit_qty,
      liters_sold,
      price_per_unit_type,
      price_per_l,
      fx_rate_to_usd,
      total_native,
      total_usd,
      tax_native,
      discount_native,
      payment_method,
      payment_status,
      note
    FROM ${TABLE_NAME}
    ${where}
    ORDER BY created_at DESC, id DESC
    ${limitSql};
  `,
    params
  );

  return rows;
}
