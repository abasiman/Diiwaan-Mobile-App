// dbform/wakaaladOfflineDb.ts
import { db } from '../db/db';

const TABLE_NAME = 'wakaalad_offline';

/**
 * Call once at app startup (e.g. in RootLayout) to ensure table + index exist.
 */
export function initWakaaladDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY NOT NULL,
      owner_id INTEGER NOT NULL,
      oil_id INTEGER NOT NULL,
      wakaalad_name TEXT,
      oil_type TEXT,
      original_qty REAL,
      wakaal_stock REAL,
      wakaal_sold REAL,
      date TEXT,
      is_deleted INTEGER DEFAULT 0,
      stock_fuusto REAL,
      stock_caag REAL,
      stock_liters REAL,
      stock_breakdown TEXT,
      sold_fuusto REAL,
      sold_caag REAL,
      sold_liters REAL,
      sold_breakdown TEXT
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_wakaalad_owner_date
    ON ${TABLE_NAME} (owner_id, date);
  `);
}

/**
 * Upsert wakaalad rows for a given owner into local SQLite.
 * `items` are server-shaped wakaalad records.
 */
export function upsertWakaaladRows(ownerId: number, items: any[]): void {
  if (!items || !items.length) return;

  db.withTransactionSync(() => {
    for (const it of items) {
      db.runSync(
        `
        INSERT INTO ${TABLE_NAME} (
          id,
          owner_id,
          oil_id,
          wakaalad_name,
          oil_type,
          original_qty,
          wakaal_stock,
          wakaal_sold,
          date,
          is_deleted,
          stock_fuusto,
          stock_caag,
          stock_liters,
          stock_breakdown,
          sold_fuusto,
          sold_caag,
          sold_liters,
          sold_breakdown
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id        = excluded.owner_id,
          oil_id          = excluded.oil_id,
          wakaalad_name   = excluded.wakaalad_name,
          oil_type        = excluded.oil_type,
          original_qty    = excluded.original_qty,
          wakaal_stock    = excluded.wakaal_stock,
          wakaal_sold     = excluded.wakaal_sold,
          date            = excluded.date,
          is_deleted      = excluded.is_deleted,
          stock_fuusto    = excluded.stock_fuusto,
          stock_caag      = excluded.stock_caag,
          stock_liters    = excluded.stock_liters,
          stock_breakdown = excluded.stock_breakdown,
          sold_fuusto     = excluded.sold_fuusto,
          sold_caag       = excluded.sold_caag,
          sold_liters     = excluded.sold_liters,
          sold_breakdown  = excluded.sold_breakdown;
      `,
        [
          it.id,
          ownerId,
          it.oil_id,
          it.wakaalad_name ?? '',
          it.oil_type ?? '',
          it.original_qty ?? 0,
          it.wakaal_stock ?? 0,
          it.wakaal_sold ?? 0,
          it.date ?? null,
          it.is_deleted ? 1 : 0,
          it.stock_fuusto ?? 0,
          it.stock_caag ?? 0,
          it.stock_liters ?? 0,
          it.stock_breakdown ?? '',
          it.sold_fuusto ?? 0,
          it.sold_caag ?? 0,
          it.sold_liters ?? 0,
          it.sold_breakdown ?? '',
        ]
      );
    }
  });
}

/**
 * Read wakaalad rows for an owner in a date range from local SQLite.
 */
export function listWakaaladRows(
  ownerId: number,
  opts: { startDateIso?: string; endDateIso?: string }
): any[] {
  const { startDateIso, endDateIso } = opts || {};

  const params: any[] = [ownerId];
  let where = 'WHERE owner_id = ? AND is_deleted = 0';

  if (startDateIso) {
    where += ' AND date >= ?';
    params.push(startDateIso);
  }
  if (endDateIso) {
    where += ' AND date <= ?';
    params.push(endDateIso);
  }

  const rows = db.getAllSync<any>(
    `
    SELECT
      id,
      owner_id,
      oil_id,
      wakaalad_name,
      oil_type,
      original_qty,
      wakaal_stock,
      wakaal_sold,
      date,
      is_deleted,
      stock_fuusto,
      stock_caag,
      stock_liters,
      stock_breakdown,
      sold_fuusto,
      sold_caag,
      sold_liters,
      sold_breakdown
    FROM ${TABLE_NAME}
    ${where}
    ORDER BY date DESC, id DESC;
  `,
    params
  );

  return rows;
}
