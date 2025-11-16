// app/db/oilSalesRepo.ts

// ❌ no expo-sqlite import here
// import * as SQLite from 'expo-sqlite';

import { db } from '../db/db';

type OilUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';

// We are using the shared sync `db` (openDatabaseSync)
// Wrap it so the rest of the code can still call tx.executeSql / query(...)

type TxLike = {
  executeSql: (sql: string, params?: any[]) => void;
};

function runTx(fn: (tx: TxLike) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Use the sync transaction API
      (db as any).withTransactionSync(() => {
        const tx: TxLike = {
          executeSql: (sql: string, params: any[] = []) => {
            // For DDL / INSERT / UPDATE / DELETE
            (db as any).runSync(sql, params);
          },
        };

        fn(tx);
      });

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const rows = (db as any).getAllSync(sql, params) as T[];
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}


/** Shape of one row in local oil sales table. */
export type LocalOilSaleRow = {
  id: number;
  owner_id: number;
  oil_id: number | null;
  wakaalad_id: number | null;
  oil_type: string | null;
  truck_plate: string | null;
  customer: string | null;
  customer_contact: string | null;
  unit_type: OilUnitType;
  unit_qty: number | null;
  liters_sold: number | null;
  price_per_unit_type: number | null;
  price_per_l: number | null;
  subtotal_native: number | null;
  discount_native: number | null;
  tax_native: number | null;
  total_native: number | null;
  total_usd: number | null;
  currency: string | null;
  fx_rate_to_usd: number | null;
  payment_status: string | null;
  payment_method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Create table + indexes (idempotent). Call once before using repo. */
export async function ensureOilSalesTable() {
  await runTx((tx) => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS oil_sales (
        id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        oil_id INTEGER,
        wakaalad_id INTEGER,
        oil_type TEXT,
        truck_plate TEXT,
        customer TEXT,
        customer_contact TEXT,
        unit_type TEXT NOT NULL,
        unit_qty REAL,
        liters_sold REAL,
        price_per_unit_type REAL,
        price_per_l REAL,
        subtotal_native REAL,
        discount_native REAL,
        tax_native REAL,
        total_native REAL,
        total_usd REAL,
        currency TEXT,
        fx_rate_to_usd REAL,
        payment_status TEXT,
        payment_method TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (id, owner_id)
      );`,
      []
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_oil_sales_owner_created
       ON oil_sales(owner_id, datetime(created_at) DESC);`,
      []
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_oil_sales_owner_plate
       ON oil_sales(owner_id, truck_plate);`,
      []
    );
  });
}

/**
 * Upsert list of sales coming from server into local table.
 * `rows` can be the objects you get from `/oilsale` or `/oilsale/summary`.
 */
export async function upsertOilSalesFromServer(rows: any[], ownerId: number) {
  if (!rows || !rows.length) return;
  await ensureOilSalesTable();

  await runTx((tx) => {
    for (const raw of rows) {
      const id = Number(raw.id);
      if (!id || Number.isNaN(id)) continue;

      const unitType: OilUnitType =
        (raw.unit_type as OilUnitType) || 'liters';

      tx.executeSql(
  `INSERT OR REPLACE INTO oil_sales (
    id,
    owner_id,
    oil_id,
    wakaalad_id,
    oil_type,
    truck_plate,
    customer,
    customer_contact,
    unit_type,
    unit_qty,
    liters_sold,
    price_per_unit_type,
    price_per_l,
    subtotal_native,
    discount_native,
    tax_native,
    total_native,
    total_usd,
    currency,
    fx_rate_to_usd,
    payment_status,
    payment_method,
    note,
    created_at,
    updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [
    id,
    ownerId,
    raw.oil_id ?? null,
    raw.wakaalad_id ?? null,
    raw.oil_type ?? null,
    raw.truck_plate ?? null,
    raw.customer ?? null,
    raw.customer_contact ?? null,
    unitType,
    raw.unit_qty ?? null,
    raw.liters_sold ?? null,
    raw.price_per_unit_type ?? null,
    raw.price_per_l ?? null,
    raw.subtotal_native ?? null,
    raw.discount_native ?? null,
    raw.tax_native ?? null,
    raw.total_native ?? null,
    raw.total_usd ?? null,
    raw.currency ?? null,
    raw.fx_rate_to_usd ?? null,
    raw.payment_status ?? null,
    raw.payment_method ?? null,
    raw.note ?? null,
    raw.created_at ?? new Date().toISOString(),
    raw.updated_at ?? null,
  ]
);

    }
  });
}

/**
 * Load sales from local DB for given owner + date range.
 */
export async function getOilSalesLocal(opts: {
  ownerId: number;
  startDateIso?: string;
  endDateIso?: string;
  limit?: number;
  offset?: number;
}): Promise<LocalOilSaleRow[]> {
  const { ownerId, startDateIso, endDateIso, limit = 1000, offset = 0 } = opts;
  await ensureOilSalesTable();

  const where: string[] = ['owner_id = ?'];
  const params: any[] = [ownerId];

  if (startDateIso) {
    where.push('datetime(created_at) >= datetime(?)');
    params.push(startDateIso);
  }
  if (endDateIso) {
    where.push('datetime(created_at) <= datetime(?)');
    params.push(endDateIso);
  }

  const sql = `
    SELECT *
    FROM oil_sales
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(created_at) DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  return await query<LocalOilSaleRow>(sql, params);
}

/** Remove local copy after a successful delete on server. */
export async function deleteLocalOilSale(ownerId: number, id: number) {
  await ensureOilSalesTable();
  await runTx((tx) => {
    tx.executeSql(
      'DELETE FROM oil_sales WHERE owner_id = ? AND id = ?',
      [ownerId, id]
    );
  });
}

export async function initOilSalesDb() {
  await ensureOilSalesTable();
}
