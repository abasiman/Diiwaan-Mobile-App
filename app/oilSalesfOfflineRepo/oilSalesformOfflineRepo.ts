// app/oilSalesfOfflineRepo/oilSalesformOfflineRepo.ts
import api from '@/services/api';
import { deleteCustomerInvoiceLocal } from '../db/CustomerInvoicesPagerepo';
import { db } from '../db/db'; // ✅ shared DB instance (openDatabaseSync)
import { registerOfflineOilInvoiceDelta } from '../offlineincomestatement/incomeStatementRepo';
import { getRealWakaaladId } from '../wakaaladformoffline/wakaaladIdMapRepo';
import { deleteLocalOilSale, upsertOilSalesFromServer } from './oilSalesRepo';
// Make sure this matches all possible unit types in your app
export type SaleUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';
export type SaleType = 'cashsale' | 'invoice';
// --- Internal helpers wired to sync SQLite API ---

type TxLike = {
  executeSql: (sql: string, params?: any[]) => void;
};

function runTx(fn: (tx: TxLike) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      (db as any).withTransactionSync(() => {
        const tx: TxLike = {
          executeSql: (sql: string, params: any[] = []) => {
            (db as any).runSync(sql, params);
          },
        };

        fn(tx);
      });

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const rows = (db as any).getAllSync(sql, params) as T[];
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Row stored in the queue table.
 */
export type QueuedOilSaleRow = {
  id: number;
  owner_id: number;
  payload_json: string;
  temp_local_id: number | null;
  created_at: string;
};

export type QueueOilSalePayload = {
  oil_id: number;
  wakaalad_id: number;
  unit_type: SaleUnitType;
  unit_qty?: number;
  liters_sold?: number;
  price_per_l?: number;
  customer?: string;
  customer_contact?: string;
  currency?: string;
  fx_rate_to_usd?: number;
  sale_type: SaleType;
  payment_method?: string;
};

/**
 * ✅ Only CREATE TABLE IF NOT EXISTS.
 * ❌ Do NOT DROP the table here, otherwise you wipe the queue.
 */
export async function initOilSalesOfflineDb() {
  await runTx((tx) => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS oil_sales_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        temp_local_id INTEGER,
        created_at TEXT NOT NULL
      );`,
      []
    );
  });
}

export async function queueOilSaleOffline({
  ownerId,
  payload,
  tempLocalId,
}: {
  ownerId: number;
  payload: QueueOilSalePayload;
  tempLocalId?: number;
}) {
  await initOilSalesOfflineDb();
  const nowIso = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);

  await runTx((tx) => {
    tx.executeSql(
      `INSERT INTO oil_sales_queue (
        owner_id, payload_json, temp_local_id, created_at
      ) VALUES (?, ?, ?, ?);`,
      [ownerId, payloadJson, tempLocalId ?? null, nowIso]
    );
  });

  console.log('[OilSalesQueue] queued offline sale', {
    ownerId,
    tempLocalId: tempLocalId ?? null,
    payload,
  });

  // ⭐ NEW: register sale delta so income statement includes it offline
try {
  if (ownerId && (payload.sale_type === 'cashsale' || payload.sale_type === 'invoice')) {
    const rawCur = (payload.currency || 'USD').toUpperCase();
    const currency: 'USD' | 'SOS' =
      rawCur === 'SOS' ? 'SOS' : 'USD';

    const price = payload.price_per_l ?? 0;

    // Simple total: liters_sold for 'liters', unit_qty for other units.
    let qty = 0;
    if (payload.unit_type === 'liters') {
      qty = payload.liters_sold ?? 0;
    } else {
      qty = payload.unit_qty ?? 0;
    }

    const totalNative = qty * price;

    let totalUsd = 0;
    if (currency === 'USD') {
      totalUsd = totalNative;
    } else if (payload.fx_rate_to_usd && totalNative) {
      totalUsd = totalNative * payload.fx_rate_to_usd;
    }

    if (totalNative || totalUsd) {
      registerOfflineOilInvoiceDelta({
        ownerId,
        createdAt: nowIso,          // same timestamp as queue insert
        truckPlate: null,           // hook in truck plate if/when you add it
        currency,
        totalNative,
        totalUsd,
        saleType: payload.sale_type // <── 🔹 use actual sale type
      });
    }
  }
} catch (err) {
  console.warn(
    '[OilSalesQueue] failed to register offline income delta for sale',
    err
  );
}

}


async function getQueuedOilSales(ownerId: number): Promise<QueuedOilSaleRow[]> {
  await initOilSalesOfflineDb();
  const rows = await query<QueuedOilSaleRow>(
    `SELECT * FROM oil_sales_queue WHERE owner_id = ? ORDER BY id ASC`,
    [ownerId]
  );
  console.log('[OilSalesQueue] getQueuedOilSales rows =', rows.length);
  return rows;
}

async function deleteQueuedOilSaleById(id: number) {
  await runTx((tx) => {
    tx.executeSql(`DELETE FROM oil_sales_queue WHERE id = ?`, [id]);
  });
}

export async function getQueuedOilSalesCount(ownerId: number): Promise<number> {
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM oil_sales_queue WHERE owner_id = ?`,
    [ownerId]
  );
  return rows[0]?.c ?? 0;
}

export async function syncQueuedOilSales(ownerId: number, token: string) {
  await initOilSalesOfflineDb();
  const rows = await getQueuedOilSales(ownerId);

  console.log('[OilSalesQueue] syncQueuedOilSales START', {
    ownerId,
    count: rows.length,
  });

  if (!rows.length) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    let payload: QueueOilSalePayload | null = null;

    try {
      payload = JSON.parse(row.payload_json) as QueueOilSalePayload;
    } catch (e) {
      console.warn('Invalid payload_json in oil_sales_queue row', row.id, e);
      failed += 1;
      await deleteQueuedOilSaleById(row.id);
      continue;
    }

    // 🔹 Resolve temp wakaalad_id (negative) → real ID
    if (payload.wakaalad_id && payload.wakaalad_id < 0) {
      const realId = getRealWakaaladId(ownerId, payload.wakaalad_id);

      if (!realId) {
        console.warn(
          'Queued oil sale still references temp wakaalad_id with no mapping yet',
          {
            queueId: row.id,
            tempWakaaladId: payload.wakaalad_id,
          }
        );
        // Skip for now but keep in queue
        continue;
      }

      payload.wakaalad_id = realId;

      const updatedJson = JSON.stringify(payload);
      await runTx((tx) => {
        tx.executeSql(
          `UPDATE oil_sales_queue SET payload_json = ? WHERE id = ?`,
          [updatedJson, row.id]
        );
      });
    }

    try {
      console.log('[OilSalesQueue] POST /oilsale', {
        queueId: row.id,
        payload,
      });

      const res = await api.post('/oilsale', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Insert synced sale into local oil_sales table
      await upsertOilSalesFromServer([res.data], ownerId);

      // If we had a temporary local sale row, remove it
      if (row.temp_local_id != null) {
        try {
          await deleteLocalOilSale(ownerId, row.temp_local_id);
        } catch (e) {
          console.warn(
            'Failed to delete local temp oil sale',
            row.temp_local_id,
            e
          );
        }



         // 🔹 NEW: also clean the temp invoice row from customer-invoices DB
        try {
          deleteCustomerInvoiceLocal(ownerId, row.temp_local_id);
        } catch (e) {
          console.warn(
            'Failed to delete local temp customer invoice sale',
            {
              ownerId,
              tempLocalId: row.temp_local_id,
            },
            e
          );
        }
      }

      // Remove from queue
      await deleteQueuedOilSaleById(row.id);

      synced += 1;
    } catch (e: any) {
      console.warn(
        'Failed to sync queued oil sale',
        row.id,
        e?.response?.data || e?.message || e
      );
      failed += 1;

      if (
        e?.message?.includes('Network') ||
        e?.message?.includes('Network request failed')
      ) {
        break;
      }
    }
  }

  const remaining = await getQueuedOilSalesCount(ownerId);

  console.log('[OilSalesQueue] syncQueuedOilSales DONE', {
    ownerId,
    synced,
    failed,
    remaining,
  });

  return { synced, failed, remaining };
}

// 🔁 Wrapper so layout.tsx can call syncPendingOilSales(token, ownerId)
export async function syncPendingOilSales(token: string, ownerId: number) {
  return syncQueuedOilSales(ownerId, token);
}
