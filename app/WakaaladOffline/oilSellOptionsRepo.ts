// app/WakaaladOffline/oilSellOptionsRepo.ts

import { db } from '../db/db';

export type OilSellOptionLocal = {
  id: number;
  owner_id: number;
  oil_id: number;
  lot_id?: number | null;
  oil_type: string;
  truck_plate?: string | null;
  in_stock_l: number;
  in_stock_fuusto: number;
  in_stock_caag: number;
  currency?: string | null;
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;
};

/**
 * Call this once on app startup (e.g. in app/layout.tsx useEffect)
 */
export function initOilSellOptionsDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS oil_sell_options (
      id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      oil_id INTEGER NOT NULL,
      lot_id INTEGER,
      oil_type TEXT,
      truck_plate TEXT,
      in_stock_l REAL NOT NULL DEFAULT 0,
      in_stock_fuusto REAL NOT NULL DEFAULT 0,
      in_stock_caag REAL NOT NULL DEFAULT 0,
      currency TEXT,
      liter_price REAL,
      fuusto_price REAL,
      caag_price REAL,
      PRIMARY KEY (id, owner_id)
    );

    CREATE INDEX IF NOT EXISTS idx_oil_sell_options_owner
      ON oil_sell_options(owner_id);
  `);
}

/**
 * Upsert rows coming from /diiwaanoil/sell-options into local SQLite.
 * `rows` should be the raw API items (OilSellOption from backend).
 */
export function upsertOilSellOptionsFromServer(rows: any[], ownerId: number) {
  if (!rows || !rows.length) return;

  db.withTransactionSync(() => {
    for (const r of rows) {
      db.runSync(
        `
        INSERT OR REPLACE INTO oil_sell_options (
          id,
          owner_id,
          oil_id,
          lot_id,
          oil_type,
          truck_plate,
          in_stock_l,
          in_stock_fuusto,
          in_stock_caag,
          currency,
          liter_price,
          fuusto_price,
          caag_price
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
        [
          r.id,
          ownerId,
          r.oil_id ?? r.id,
          r.lot_id ?? null,
          r.oil_type ?? '',
          r.truck_plate ?? null,
          Number(r.in_stock_l ?? 0),
          Number(r.in_stock_fuusto ?? 0),
          Number(r.in_stock_caag ?? 0),
          r.currency ?? null,
          r.liter_price ?? r.sell_price_per_l ?? null,
          r.fuusto_price ?? null,
          r.caag_price ?? null,
        ]
      );
    }
  });
}

/**
 * Read sell options from local DB – used by CreateWakaaladModal
 */
export function getOilSellOptionsLocal(
  ownerId: number,
  opts: { onlyAvailable?: boolean; limit?: number } = {}
): OilSellOptionLocal[] {
  const { onlyAvailable = true, limit = 200 } = opts;

  const where: string[] = ['owner_id = ?'];
  const params: any[] = [ownerId];

  if (onlyAvailable) {
    where.push('in_stock_l > 0');
  }

  params.push(limit);

  const rows = db.getAllSync<OilSellOptionLocal>(
    `
      SELECT
        id,
        owner_id,
        oil_id,
        lot_id,
        oil_type,
        truck_plate,
        in_stock_l,
        in_stock_fuusto,
        in_stock_caag,
        currency,
        liter_price,
        fuusto_price,
        caag_price
      FROM oil_sell_options
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?;
    `,
    params
  );

  return rows;
}

/**
 * Optional helper: adjust local stock after creating a wakaalad
 * (so UI + offline cache stay in sync immediately).
 */
export function applyOilSellOptionStockDelta(
  ownerId: number,
  oilId: number,
  deltaLiters: number
) {
  if (!deltaLiters || !isFinite(deltaLiters)) return;

  const row = db.getFirstSync<OilSellOptionLocal>(
    `
      SELECT
        id,
        owner_id,
        oil_id,
        lot_id,
        oil_type,
        truck_plate,
        in_stock_l,
        in_stock_fuusto,
        in_stock_caag,
        currency,
        liter_price,
        fuusto_price,
        caag_price
      FROM oil_sell_options
      WHERE owner_id = ? AND oil_id = ?
      LIMIT 1;
    `,
    [ownerId, oilId]
  );

  if (!row) return;

  const newStockL = Math.max(0, (row.in_stock_l || 0) + deltaLiters);

  const oilType = (row.oil_type || '').toLowerCase();
  const fuustoCap =
    oilType === 'petrol' ? 240 /* PETROL_FUUSTO_CAPACITY */ : 240 /* DEFAULT_CAPACITY.fuusto */;
  const caagCap = 20;

  const newFuusto = newStockL / fuustoCap;
  const newCaag = newStockL / caagCap;

  db.runSync(
    `
      UPDATE oil_sell_options
      SET
        in_stock_l = ?,
        in_stock_fuusto = ?,
        in_stock_caag = ?
      WHERE owner_id = ? AND oil_id = ?;
    `,
    [newStockL, newFuusto, newCaag, ownerId, oilId]
  );
}
