// app/WakaaladOffline/oilSellOptionsRepo.ts
import { db } from '../db/db';
import { initOilSellOptionsDb } from './oilSellOptionsDb';

export type OilSellOption = {
  id: number;
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
  created_at?: string | null;
  updated_at?: string | null;
};

type OilSellOptionRow = OilSellOption & {
  owner_id: number;
  dirty: number;
  deleted: number;
};

function ensureDb() {
  initOilSellOptionsDb();
}

/**
 * Upsert options from server into local oilselloptions_all table.
 * Called from:
 *  - global sync (syncAllOilSellOptions)
 *  - CreateWakaaladModal ONLINE fetch
 */
export function upsertOilSellOptionsFromServer(
  options: OilSellOption[],
  ownerId: number
) {
  if (!options?.length || !ownerId) return;
  ensureDb();

  db.withTransactionSync(() => {
    for (const o of options) {
      db.runSync(
        `
        INSERT INTO oilselloptions_all (
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
          caag_price,
          created_at,
          updated_at,
          dirty,
          deleted
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          0, 0
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id        = excluded.owner_id,
          oil_id          = excluded.oil_id,
          lot_id          = excluded.lot_id,
          oil_type        = excluded.oil_type,
          truck_plate     = excluded.truck_plate,
          in_stock_l      = excluded.in_stock_l,
          in_stock_fuusto = excluded.in_stock_fuusto,
          in_stock_caag   = excluded.in_stock_caag,
          currency        = excluded.currency,
          liter_price     = excluded.liter_price,
          fuusto_price    = excluded.fuusto_price,
          caag_price      = excluded.caag_price,
          created_at      = COALESCE(excluded.created_at, created_at),
          updated_at      = COALESCE(excluded.updated_at, updated_at),
          dirty           = 0,
          deleted         = 0;
        `,
        [
          o.id,
          ownerId,
          o.oil_id,
          o.lot_id ?? null,
          o.oil_type,
          o.truck_plate ?? null,
          o.in_stock_l ?? 0,
          o.in_stock_fuusto ?? 0,
          o.in_stock_caag ?? 0,
          o.currency ?? null,
          o.liter_price ?? null,
          o.fuusto_price ?? null,
          o.caag_price ?? null,
          o.created_at ?? null,
          o.updated_at ?? null,
        ]
      );
    }
  });
}

/**
 * What CreateWakaaladModal uses offline.
 * Filters by owner_id (and deleted=0), optional "onlyAvailable".
 */
export function getOilSellOptionsLocal(
  ownerId: number,
  opts?: { onlyAvailable?: boolean; limit?: number }
): OilSellOption[] {
  ensureDb();

  const limit = opts?.limit ?? 200;
  const params: any[] = [ownerId];
  const where: string[] = ['owner_id = ? AND deleted = 0'];

  if (opts?.onlyAvailable) {
    where.push('(in_stock_l > 0 OR in_stock_fuusto > 0 OR in_stock_caag > 0)');
  }

  const sql = `
    SELECT *
    FROM oilselloptions_all
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET 0;
  `;

  const rows = db.getAllSync<OilSellOptionRow>(sql, [...params, limit]);
  return rows.map((r) => {
    const { owner_id, dirty, deleted, ...rest } = r;
    return rest;
  });
}

/**
 * Adjust stock (in liters) when a wakaalad is created.
 *
 * NOTE: this uses oil_id (NOT the option id), matching how CreateWakaaladModal calls it:
 *   applyOilSellOptionStockDelta(user.id, selected.oil_id ?? selected.id, -allocLiters);
 */
export function applyOilSellOptionStockDelta(
  ownerId: number,
  oilId: number,
  deltaLiters: number
) {
  ensureDb();

  db.runSync(
    `
    UPDATE oilselloptions_all
    SET
      in_stock_l = in_stock_l + ?,
      dirty      = 1
    WHERE owner_id = ? AND oil_id = ? AND deleted = 0;
  `,
    [deltaLiters, ownerId, oilId]
  );
}

// re-export init so layout.tsx import keeps working
export { initOilSellOptionsDb } from './oilSellOptionsDb';

