// app/OilCreateOffline/oilModalRepo.ts
import { db } from '../db/db';
import {
    initOilModalDb,
    type OilModalMode,
    type OilModalRow,
    type OilModalStatus,
} from './oilModalDb';

export type OilModalQueuePayload = {
  mode: OilModalMode;
  payload: any;         // body for POST /diiwaanoil
  truck_rent: number;
  depot_cost: number;
  tax: number;
  currency: string;
};

export function queueOilModalForSync(
  ownerId: number,
  data: OilModalQueuePayload
): number {
  if (!ownerId) throw new Error('ownerId is required');
  if (!data?.payload) throw new Error('payload is required');
  if (!data.mode) throw new Error('mode is required');

  initOilModalDb();

  const now = new Date().toISOString();
  const res = db.runSync(
    `
      INSERT INTO oil_modal_forms (
        owner_id,
        mode,
        payload_json,
        truck_rent,
        depot_cost,
        tax,
        currency,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
    `,
    [
      ownerId,
      data.mode,
      JSON.stringify(data.payload),
      Number(data.truck_rent || 0),
      Number(data.depot_cost || 0),
      Number(data.tax || 0),
      data.currency || 'USD',
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

export function getPendingOilModalForms(
  ownerId: number,
  limit = 100
): OilModalRow[] {
  if (!ownerId) return [];
  initOilModalDb();

  return db.getAllSync<OilModalRow>(
    `
      SELECT
        id,
        owner_id,
        mode,
        payload_json,
        truck_rent,
        depot_cost,
        tax,
        currency,
        status,
        error,
        remote_ids,
        created_at,
        updated_at,
        last_attempt_at
      FROM oil_modal_forms
      WHERE owner_id = ?
        AND status IN ('pending', 'failed')
      ORDER BY datetime(created_at) ASC
      LIMIT ?;
    `,
    [ownerId, limit]
  );
}

export function updateOilModalFormStatus(
  id: number,
  status: OilModalStatus,
  opts: { error?: string | null; remote_ids?: string | null } = {}
) {
  if (!id) return;
  initOilModalDb();

  const now = new Date().toISOString();
  const { error = null, remote_ids = null } = opts;

  db.runSync(
    `
      UPDATE oil_modal_forms
      SET
        status          = ?,
        error           = ?,
        remote_ids      = COALESCE(?, remote_ids),
        updated_at      = ?,
        last_attempt_at = ?
      WHERE id = ?;
    `,
    [status, error, remote_ids, now, now, id]
  );
}

export function purgeSyncedOilModalForms(ownerId: number, olderThanIso?: string) {
  if (!ownerId) return;
  initOilModalDb();

  const params: any[] = [ownerId];
  let where = `owner_id = ? AND status = 'synced'`;

  if (olderThanIso) {
    where += ` AND datetime(updated_at) < datetime(?)`;
    params.push(olderThanIso);
  }

  db.runSync(
    `
      DELETE FROM oil_modal_forms
      WHERE ${where};
    `,
    params
  );
}
