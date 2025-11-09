// app/dbform/oilSaleReverseOfflineRepo.ts
import api from '@/services/api';
import { db } from '../db/db';

type SyncStatus = 'pending' | 'synced' | 'failed';

type ReverseQueueRow = {
  local_id: number;
  owner_id: number;
  sale_id: number;
  liters: number;
  note?: string | null;
  sync_status: SyncStatus;
  last_error?: string | null;
  created_at: string;
};

function ensureReverseQueueTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS oil_sale_reverse_queue (
      local_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL,
      sale_id      INTEGER NOT NULL,
      liters       REAL    NOT NULL,
      note         TEXT,
      sync_status  TEXT    NOT NULL DEFAULT 'pending',
      last_error   TEXT,
      created_at   TEXT    NOT NULL
    );
    `,
    []
  );
}

/**
 * Queue a reverse operation for later sync.
 * (Optionally you can add optimistic local updates here.)
 */
export async function queueOilSaleReverseForSync(
  ownerId: number,
  saleId: number,
  liters: number,
  note?: string
): Promise<void> {
  if (!ownerId || !saleId) return;
  const cleanLiters = Number(liters);
  if (!cleanLiters || !isFinite(cleanLiters) || cleanLiters <= 0) return;

  ensureReverseQueueTable();
  const createdAt = new Date().toISOString();

  db.runSync(
    `
      INSERT INTO oil_sale_reverse_queue (
        owner_id, sale_id, liters, note, sync_status, created_at
      )
      VALUES (?, ?, ?, ?, 'pending', ?);
    `,
    [ownerId, saleId, cleanLiters, note ?? null, createdAt]
  );

  // 🔸 If you want, add optimistic local updates here:
  //  - adjust local oilsales / wakaalad stock immediately
}

/**
 * Push all pending reversals to the backend.
 * Call from a global "came online" effect.
 */
export async function syncPendingOilSaleReversals(
  token: string,
  ownerId: number
): Promise<void> {
  if (!token || !ownerId) return;

  ensureReverseQueueTable();

  const rows = db.getAllSync<ReverseQueueRow>(
    `
      SELECT local_id, owner_id, sale_id, liters, note, sync_status, last_error, created_at
      FROM oil_sale_reverse_queue
      WHERE owner_id = ?
        AND sync_status = 'pending'
      ORDER BY local_id ASC;
    `,
    [ownerId]
  );

  if (!rows.length) return;

  const authHeader = { Authorization: `Bearer ${token}` };

  for (const row of rows) {
    try {
      await api.post(
        `/oilsale/${row.sale_id}/reverse`,
        { liters: row.liters, note: row.note ?? undefined },
        { headers: authHeader }
      );

      db.runSync(
        `
          UPDATE oil_sale_reverse_queue
          SET sync_status = 'synced', last_error = NULL
          WHERE local_id = ?;
        `,
        [row.local_id]
      );
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Reverse sync failed';

      db.runSync(
        `
          UPDATE oil_sale_reverse_queue
          SET sync_status = 'failed', last_error = ?
          WHERE local_id = ?;
        `,
        [String(msg), row.local_id]
      );

      // stop on first error to avoid hammering the server
      break;
    }
  }
}

/**
 * Optional: clean up old synced reverse records.
 */
export async function pruneSyncedOilSaleReversals(
  maxAgeDays = 7
): Promise<void> {
  ensureReverseQueueTable();
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

  db.runSync(
    `
      DELETE FROM oil_sale_reverse_queue
      WHERE sync_status = 'synced'
        AND created_at < ?;
    `,
    [cutoff]
  );
}
