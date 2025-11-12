// app/oilsaleformoffline/oilSalesFormRepo.ts
import { db } from '../db/db';
import {
  initOilSaleFormDb,
  type OilSaleFormRow,
  type OilSaleFormSaleType,
  type OilSaleFormStatus,
  type OilSaleFormUnitType,
} from './oilSaleFormDb';

export type OilSaleFormCreatePayload = {
  oil_id: number;
  wakaalad_id: number;
  unit_type: OilSaleFormUnitType;
  unit_qty?: number;
  liters_sold?: number;
  price_per_l?: number;
  customer?: string | null;
  customer_contact?: string | null;
  currency?: string;
  fx_rate_to_usd?: number;
  sale_type: OilSaleFormSaleType;
  payment_method?: 'cash' | 'bank';

  // keep these in the queue row
  oil_type?: string | null;
  truck_plate?: string | null;
};

/**
 * Insert an oil sale form into the local queue for later sync.
 * Returns the local row id.
 */
export async function queueOilSaleForSync(
  ownerId: number,
  payload: OilSaleFormCreatePayload
): Promise<number> {
  console.log('[OilSaleQueue] queueOilSaleForSync called', {
    ownerId,
    oil_id: payload.oil_id,
    wakaalad_id: payload.wakaalad_id,
    unit_type: payload.unit_type,
    sale_type: payload.sale_type,
  });

  if (!ownerId) throw new Error('ownerId is required');
  if (!payload.oil_id) throw new Error('oil_id is required');
  if (!payload.wakaalad_id) throw new Error('wakaalad_id is required');
  if (!payload.unit_type) throw new Error('unit_type is required');
  if (!payload.sale_type) throw new Error('sale_type is required');

  initOilSaleFormDb();

  const now = new Date().toISOString();

  const res = db.runSync(
    `
      INSERT INTO oil_sale_forms (
        owner_id,
        oil_id,
        wakaalad_id,
        unit_type,
        unit_qty,
        liters_sold,
        price_per_l,
        customer,
        customer_contact,
        currency,
        fx_rate_to_usd,
        sale_type,
        payment_method,
        oil_type,
        truck_plate,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
    `,
    [
      ownerId,
      payload.oil_id,
      payload.wakaalad_id,
      payload.unit_type,
      payload.unit_qty ?? null,
      payload.liters_sold ?? null,
      payload.price_per_l ?? null,
      payload.customer ?? null,
      payload.customer_contact ?? null,
      payload.currency ?? null,
      payload.fx_rate_to_usd ?? null,
      payload.sale_type,
      payload.payment_method ?? null,
      payload.oil_type ?? null,
      payload.truck_plate ?? null,
      now,
      now,
    ]
  ) as any;

  const lastId =
    res?.lastInsertRowid ??
    res?.lastInsertRowId ??
    res?.insertId ??
    0;

  const idNum = Number(lastId) || 0;
  console.log('[OilSaleQueue] inserted local oil_sale_forms row', { lastId, idNum });

  return idNum;
}

/**
 * Get pending/failed oil sale forms for an owner.
 */
export function getPendingOilSaleForms(
  ownerId: number,
  limit = 100
): OilSaleFormRow[] {
  if (!ownerId) {
    console.log('[OilFormRepo] getPendingOilSaleForms → ownerId missing (0 rows)');
    return [];
  }
  initOilSaleFormDb();

  const rows = db.getAllSync<OilSaleFormRow>(
    `
      SELECT
        id,
        owner_id,
        oil_id,
        wakaalad_id,
        unit_type,
        unit_qty,
        liters_sold,
        price_per_l,
        customer,
        customer_contact,
        currency,
        fx_rate_to_usd,
        sale_type,
        payment_method,
        oil_type,
        truck_plate,
        status,
        error,
        remote_id,
        created_at,
        updated_at,
        last_attempt_at
      FROM oil_sale_forms
      WHERE owner_id = ?
        AND status IN ('pending','failed','syncing')
      ORDER BY datetime(created_at) ASC
      LIMIT ?;
    `,
    [ownerId, limit]
  ) as OilSaleFormRow[];

  const counts = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { total: 0 } as Record<string, number>
  );

  console.log('[OilFormRepo] getPendingOilSaleForms →', {
    ownerId,
    limit,
    count: rows.length,
    byStatus: counts,
  });

  return rows;
}

/**
 * Internal helper to update status/error/remote_id.
 */
export function updateOilSaleFormStatus(
  id: number,
  status: OilSaleFormStatus,
  opts: { error?: string | null; remote_id?: number | null } = {}
) {
  if (!id) {
    console.warn('[OilFormRepo] updateOilSaleFormStatus → missing id');
    return;
  }
  initOilSaleFormDb();

  const now = new Date().toISOString();
  const { error = null, remote_id = null } = opts;

  db.runSync(
    `
      UPDATE oil_sale_forms
      SET
        status          = ?,
        error           = ?,
        remote_id       = COALESCE(?, remote_id),
        updated_at      = ?,
        last_attempt_at = ?
      WHERE id = ?;
    `,
    [status, error, remote_id, now, now, id]
  );

  console.log('[OilFormRepo] updateOilSaleFormStatus → updated', {
    id,
    status,
    hasError: !!error,
    remote_id,
  });
}

/**
 * Optional: purge old synced rows to keep DB small.
 */
export function purgeSyncedOilSaleForms(ownerId: number, olderThanIso?: string) {
  if (!ownerId) {
    console.log('[OilFormRepo] purgeSyncedOilSaleForms → ownerId missing (no-op)');
    return;
  }
  initOilSaleFormDb();

  const params: any[] = [ownerId];
  let where = `owner_id = ? AND status = 'synced'`;

  if (olderThanIso) {
    where += ` AND datetime(updated_at) < datetime(?)`;
    params.push(olderThanIso);
  }

  const res = db.runSync(
    `
      DELETE FROM oil_sale_forms
      WHERE ${where};
    `,
    params
  ) as any;

  const changes = res?.changes ?? res?.rowsAffected ?? res?.rowCount ?? 0;
  console.log('[OilFormRepo] purgeSyncedOilSaleForms → done', {
    ownerId,
    olderThanIso: olderThanIso ?? null,
    deleted: changes,
  });
}
