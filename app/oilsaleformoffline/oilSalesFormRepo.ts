// app/oilsaleformoffline/oilSaleFormRepo.ts
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
};

/**
 * Insert an oil sale form into the local queue for later sync.
 * Returns the local row id.
 */
export async function queueOilSaleForSync(
  ownerId: number,
  payload: OilSaleFormCreatePayload
): Promise<number> {
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
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
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
      now,
      now,
    ]
  ) as any;

  const lastId =
    res?.lastInsertRowid ??
    res?.lastInsertRowId ??
    res?.insertId ??
    0;

  return Number(lastId) || 0;
}

/**
 * Get pending/failed oil sale forms for an owner.
 */
export function getPendingOilSaleForms(
  ownerId: number,
  limit = 100
): OilSaleFormRow[] {
  if (!ownerId) return [];
  initOilSaleFormDb();

  return db.getAllSync<OilSaleFormRow>(
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
        status,
        error,
        remote_id,
        created_at,
        updated_at,
        last_attempt_at
      FROM oil_sale_forms
      WHERE owner_id = ?
        AND status IN ('pending', 'failed')
      ORDER BY datetime(created_at) ASC
      LIMIT ?;
    `,
    [ownerId, limit]
  );
}

/**
 * Internal helper to update status/error/remote_id.
 */
export function updateOilSaleFormStatus(
  id: number,
  status: OilSaleFormStatus,
  opts: { error?: string | null; remote_id?: number | null } = {}
) {
  if (!id) return;
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
}

/**
 * Optional: purge old synced rows to keep DB small.
 */
export function purgeSyncedOilSaleForms(ownerId: number, olderThanIso?: string) {
  if (!ownerId) return;
  initOilSaleFormDb();

  const params: any[] = [ownerId];
  let where = `owner_id = ? AND status = 'synced'`;

  if (olderThanIso) {
    where += ` AND datetime(updated_at) < datetime(?)`;
    params.push(olderThanIso);
  }

  db.runSync(
    `
      DELETE FROM oil_sale_forms
      WHERE ${where};
    `,
    params
  );
}