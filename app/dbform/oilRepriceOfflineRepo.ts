// app/dbform/oilRepriceOfflineRepo.ts
import api from '@/services/api';
import { db } from '../db/db';

type SyncStatus = 'pending' | 'synced' | 'failed';

type QueueRow = {
  local_id: number;
  owner_id: number;
  oil_id: number;
  payload_json: string;
  sync_status: SyncStatus;
  last_error?: string | null;
  created_at: string;
};

function ensureQueueTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS oil_reprice_queue (
      local_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL,
      oil_id       INTEGER NOT NULL,
      payload_json TEXT    NOT NULL,
      sync_status  TEXT    NOT NULL DEFAULT 'pending',
      last_error   TEXT,
      created_at   TEXT    NOT NULL
    );
    `,
    []
  );
}

/**
 * Queue a reprice operation to sync later.
 * payload is the SAME object you send to /diiwaanoil/:oilId/reprice
 * e.g. { sell_price_per_l: 1.2345 } or { sell_price_per_fuusto: 300 }
 */
export async function queueOilRepriceForSync(
  ownerId: number,
  oilId: number,
  payload: Record<string, number>
): Promise<void> {
  if (!ownerId || !oilId) return;
  ensureQueueTable();

  const createdAt = new Date().toISOString();
  const json = JSON.stringify(payload);

  db.runSync(
    `
      INSERT INTO oil_reprice_queue (owner_id, oil_id, payload_json, sync_status, created_at)
      VALUES (?, ?, ?, 'pending', ?);
    `,
    [ownerId, oilId, json, createdAt]
  );
}

/**
 * Push all pending reprices to the server for one owner.
 */
export async function syncPendingOilReprices(
  token: string,
  ownerId: number
): Promise<void> {
  ensureQueueTable();
  if (!token || !ownerId) return;

  const rows = db.getAllSync<QueueRow>(
    `
      SELECT local_id, owner_id, oil_id, payload_json, sync_status, last_error, created_at
      FROM oil_reprice_queue
      WHERE owner_id = ?
        AND sync_status = 'pending'
      ORDER BY local_id ASC;
    `,
    [ownerId]
  );

  if (!rows.length) return;

  const authHeader = { Authorization: `Bearer ${token}` };

  for (const row of rows) {
    let payload: Record<string, number>;

    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      db.runSync(
        `
          UPDATE oil_reprice_queue
          SET sync_status = 'failed', last_error = ?
          WHERE local_id = ?;
        `,
        ['Invalid JSON payload', row.local_id]
      );
      continue;
    }

    try {
      await api.post(`/diiwaanoil/${row.oil_id}/reprice`, payload, {
        headers: authHeader,
      });

      db.runSync(
        `
          UPDATE oil_reprice_queue
          SET sync_status = 'synced', last_error = NULL
          WHERE local_id = ?;
        `,
        [row.local_id]
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Sync failed';
      db.runSync(
        `
          UPDATE oil_reprice_queue
          SET sync_status = 'failed', last_error = ?
          WHERE local_id = ?;
        `,
        [String(msg), row.local_id]
      );
      // optional: stop on first failure
      break;
    }
  }
}

/**
 * Optional housekeeping: clear old synced rows.
 */
export async function pruneSyncedOilReprices(
  maxAgeDays = 7
): Promise<void> {
  ensureQueueTable();
  const cutoff = new Date(
    Date.now() - maxAgeDays * 86400000
  ).toISOString();

  db.runSync(
    `
      DELETE FROM oil_reprice_queue
      WHERE sync_status = 'synced'
        AND created_at < ?;
    `,
    [cutoff]
  );
}
