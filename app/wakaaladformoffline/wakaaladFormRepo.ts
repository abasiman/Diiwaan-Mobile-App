// app/dbform/wakaaladFormRepo.ts
import { db } from '../db/db';
import {
  initWakaaladFormDb,
  type WakaaladFormRow,
  type WakaaladFormStatus,
} from './wakaaladFormDb';

export type WakaaladFormCreatePayload = {
  oil_id: number;
  wakaalad_name: string;
  allocate_liters: number;
  date?: string | null;
};

/**
 * Insert a wakaalad form into the local queue for later sync.
 * Returns the local row id (useful if you want to reference it in UI).
 *
 * 🔹 tempWakaaladId is the negative temp wakaalad_id you used in local
 *     wakaalad_sell_options / dropdown. This lets us later map it to the
 *     real server ID and fix any offline oil sales that referenced it.
 */
export function queueWakaaladFormForSync(
  ownerId: number,
  payload: WakaaladFormCreatePayload,
  tempWakaaladId?: number | null
): number {
  if (!ownerId) throw new Error('ownerId is required');
  if (!payload.oil_id) throw new Error('oil_id is required');
  if (!payload.wakaalad_name?.trim()) throw new Error('wakaalad_name is required');

  initWakaaladFormDb();

  const now = new Date().toISOString();
  const res = db.runSync(
    `
      INSERT INTO wakaalad_forms (
        owner_id,
        oil_id,
        wakaalad_name,
        allocate_liters,
        date,
        temp_wakaalad_id,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?);
    `,
    [
      ownerId,
      payload.oil_id,
      payload.wakaalad_name.trim(),
      Number(payload.allocate_liters || 0),
      payload.date ?? null,
      tempWakaaladId ?? null,
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
 * Get pending/failed wakaalad forms for an owner.
 * These are the ones the sync job will try to push.
 */
export function getPendingWakaaladForms(
  ownerId: number,
  limit = 100
): WakaaladFormRow[] {
  if (!ownerId) return [];
  initWakaaladFormDb();

  return db.getAllSync<WakaaladFormRow>(
    `
      SELECT
        id,
        owner_id,
        oil_id,
        wakaalad_name,
        allocate_liters,
        date,
        temp_wakaalad_id,
        status,
        error,
        remote_id,
        created_at,
        updated_at,
        last_attempt_at
      FROM wakaalad_forms
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
export function updateWakaaladFormStatus(
  id: number,
  status: WakaaladFormStatus,
  opts: { error?: string | null; remote_id?: number | null } = {}
) {
  if (!id) return;
  initWakaaladFormDb();

  const now = new Date().toISOString();
  const { error = null, remote_id = null } = opts;

  db.runSync(
    `
      UPDATE wakaalad_forms
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
export function purgeSyncedWakaaladForms(
  ownerId: number,
  olderThanIso?: string
) {
  if (!ownerId) return;
  initWakaaladFormDb();

  const params: any[] = [ownerId];
  let where = `owner_id = ? AND status = 'synced'`;

  if (olderThanIso) {
    where += ` AND datetime(updated_at) < datetime(?)`;
    params.push(olderThanIso);
  }

  db.runSync(
    `
      DELETE FROM wakaalad_forms
      WHERE ${where};
    `,
    params
  );
}
