// app/db/paymentOfflineRepo.ts
import api from '@/services/api';
import { db } from '../db/db.native';

export type PaymentQueueStatus = 'pending' | 'synced' | 'failed';

export type PaymentQueueRow = {
  local_id: number;
  owner_id: number;
  payload_json: string;
  sync_status: PaymentQueueStatus;
  last_error?: string | null;
  created_at: string;
};

export type CreatePaymentPayload = {
  amount: number;
  customer_id: number;
  payment_method: string;
};

/**
 * Create the local queue table (idempotent).
 */
export function ensurePaymentQueueTable() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS payment_queue (
      local_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL,
      payload_json TEXT    NOT NULL,
      sync_status  TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'synced' | 'failed'
      last_error   TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Init helper to call once on app startup.
 */
export function initPaymentOfflineDb() {
  ensurePaymentQueueTable();
}

/**
 * Enqueue a payment to be synced later.
 */
export function queuePaymentForSync(
  ownerId: number,
  payload: CreatePaymentPayload
) {
  if (!ownerId) throw new Error('ownerId is required to queue payment');
  ensurePaymentQueueTable();

  db.runSync(
    `
      INSERT INTO payment_queue (owner_id, payload_json, sync_status)
      VALUES (?, ?, 'pending');
    `,
    [ownerId, JSON.stringify(payload)]
  );
}

/** Optional helper if you ever want to inspect queue from UI */
export function getPendingPaymentsLocal(ownerId: number, limit = 200) {
  ensurePaymentQueueTable();
  return db.getAllSync<PaymentQueueRow>(
    `
      SELECT local_id, owner_id, payload_json, sync_status, last_error, created_at
      FROM payment_queue
      WHERE owner_id = ?
        AND sync_status = 'pending'
      ORDER BY local_id ASC
      LIMIT ?;
    `,
    [ownerId, limit]
  );
}

/* ---------- sync with in-memory guard ---------- */

let syncingPayments = false;

/**
 * Push all pending payments for this owner to the server.
 * Call from GlobalSync / connectivity watcher:
 *   await syncPendingPayments(token, ownerId)
 */
export async function syncPendingPayments(
  token: string,
  ownerId: number
): Promise<void> {
  if (syncingPayments) return;
  syncingPayments = true;

  try {
    ensurePaymentQueueTable();

    const rows = db.getAllSync<PaymentQueueRow>(
      `
        SELECT local_id, owner_id, payload_json, sync_status, last_error, created_at
        FROM payment_queue
        WHERE owner_id = ?
          AND sync_status = 'pending'
        ORDER BY local_id ASC;
      `,
      [ownerId]
    );

    if (!rows.length) return;

    const headers = { Authorization: `Bearer ${token}` };

    for (const row of rows) {
      let payload: CreatePaymentPayload;

      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        db.runSync(
          `
            UPDATE payment_queue
            SET sync_status = 'failed', last_error = ?
            WHERE local_id = ?;
          `,
          ['Invalid JSON payload', row.local_id]
        );
        continue;
      }

      try {
        await api.post('/diiwaanpayments', payload, { headers });

        db.runSync(
          `
            UPDATE payment_queue
            SET sync_status = 'synced', last_error = NULL
            WHERE local_id = ?;
          `,
          [row.local_id]
        );

        // OPTIONAL: also refresh local customer KPIs here if you want.
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Sync failed';
        db.runSync(
          `
            UPDATE payment_queue
            SET sync_status = 'failed', last_error = ?
            WHERE local_id = ?;
          `,
          [String(msg), row.local_id]
        );
        // stop on first hard failure to avoid hammering the server
        break;
      }
    }
  } finally {
    syncingPayments = false;
  }
}
