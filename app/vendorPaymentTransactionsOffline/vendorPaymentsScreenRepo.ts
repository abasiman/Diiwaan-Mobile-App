//vendorPaymentsScreenRepo.ts
import { db } from '../db/db';
import {
  initVendorPaymentsScreenDb,
  VENDOR_PAYMENTS_SCREEN_META_TABLE,
  VENDOR_PAYMENTS_SCREEN_TABLE,
} from './vendorPaymentsScreenDb';





export async function addLocalVendorPayment(
  ownerId: number,
  payment: VendorPaymentWithContext
): Promise<void> {
  if (!ownerId) return;

  // 1) load current cached list
  const existing = await getVendorPaymentsForOwner(ownerId);

  // 2) prepend so newest appears first (created_desc)
  const updated = [payment, ...existing];

  // 3) save snapshot back
  await saveVendorPaymentsForOwner(ownerId, updated);
}
/** Mirror types from VendorPaymentsScreen */

export type ExtraCostSummary = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
};

export type SupplierDueItem = {
  supplier_name: string;
  lot_id?: number | null;
  oil_id?: number | null;
  oil_type?: string | null;
  liters?: number | null;
  truck_plate?: string | null;
  truck_type?: string | null;
  oil_total_landed_cost: number;
  total_extra_cost: number;
  over_all_cost: number;
  total_paid: number;
  amount_due: number;
  date?: string | null;
  last_payment_amount_due_snapshot?: number | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  last_payment_transaction_type?: string | null;
  extra_costs: ExtraCostSummary[];
};

export type VendorPaymentRead = {
  id: number;
  amount: number;
  amount_due: number;
  note?: string | null;
  payment_method?: string | null;
  payment_date: string;
  supplier_name?: string | null;
  lot_id?: number | null;
  oil_id?: number | null;
  extra_cost_id?: number | null;
  created_at: string;
  updated_at: string;
  truck_plate?: string | null;
  truck_type?: string | null;
  transaction_type?: string | null;
  currency?: string | null;
  fx_rate_to_usd?: number | null;
};

export type VendorPaymentWithContext = VendorPaymentRead & {
  supplier_due_context?: SupplierDueItem | null;
  extra_cost_context?: ExtraCostSummary | null;
};

/** ---------- Save / load list for a given owner ---------- */

export async function saveVendorPaymentsForOwner(
  ownerId: number,
  items: VendorPaymentWithContext[]
): Promise<void> {
  if (!ownerId) {
    console.warn('[vp-screen] saveVendorPaymentsForOwner called with no ownerId');
    return;
  }
  initVendorPaymentsScreenDb();

  const now = Date.now();

  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM ${VENDOR_PAYMENTS_SCREEN_TABLE} WHERE owner_id = ?`, [ownerId]);

    items.forEach((item, index) => {
      const json = JSON.stringify(item);
      db.runSync(
        `
        INSERT INTO ${VENDOR_PAYMENTS_SCREEN_TABLE} (
          owner_id,
          payment_index,
          data_json,
          updated_at
        ) VALUES (?, ?, ?, ?);
      `,
        [ownerId, index, json, now]
      );
    });

    db.runSync(
      `
      INSERT OR REPLACE INTO ${VENDOR_PAYMENTS_SCREEN_META_TABLE} (
        owner_id,
        last_sync_ts
      ) VALUES (?, ?);
    `,
      [ownerId, now]
    );
  });

  console.log(
    `[vp-screen] Saved ${items.length} items for owner=${ownerId} at ts=${now}`
  );
}

export async function getVendorPaymentsForOwner(
  ownerId: number
): Promise<VendorPaymentWithContext[]> {
  if (!ownerId) {
    console.warn('[vp-screen] getVendorPaymentsForOwner called with no ownerId');
    return [];
  }
  initVendorPaymentsScreenDb();

  const rows = db.getAllSync<{ data_json: string }>(
    `
    SELECT data_json
    FROM ${VENDOR_PAYMENTS_SCREEN_TABLE}
    WHERE owner_id = ?
    ORDER BY payment_index ASC;
  `,
    [ownerId]
  );

  console.log(
    `[vp-screen] Loaded ${rows.length} cached rows for owner=${ownerId}`
  );

  const out: VendorPaymentWithContext[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data_json);
      out.push(parsed);
    } catch (err) {
      console.warn('[vp-screen] Failed to parse cached row', err);
    }
  }

  console.log(
    `[vp-screen] Parsed ${out.length} cached items for owner=${ownerId}`
  );
  return out;
}

/** Last sync timestamp helpers */

export async function getVendorPaymentsLastSync(
  ownerId: number
): Promise<number | null> {
  if (!ownerId) return null;
  initVendorPaymentsScreenDb();

  const rows = db.getAllSync<{ last_sync_ts: number }>(
    `
    SELECT last_sync_ts
    FROM ${VENDOR_PAYMENTS_SCREEN_META_TABLE}
    WHERE owner_id = ?
    LIMIT 1;
  `,
    [ownerId]
  );

  if (!rows.length) return null;
  const ts = Number(rows[0].last_sync_ts);
  return Number.isFinite(ts) ? ts : null;
}

export async function setVendorPaymentsLastSync(
  ownerId: number,
  ts: number
): Promise<void> {
  if (!ownerId) return;
  initVendorPaymentsScreenDb();

  db.runSync(
    `
    INSERT OR REPLACE INTO ${VENDOR_PAYMENTS_SCREEN_META_TABLE} (
      owner_id,
      last_sync_ts
    ) VALUES (?, ?);
  `,
    [ownerId, ts]
  );
}

/** Clear cache for owner (on logout, etc.) */

export async function clearVendorPaymentsForOwner(ownerId: number): Promise<void> {
  if (!ownerId) return;
  initVendorPaymentsScreenDb();

  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM ${VENDOR_PAYMENTS_SCREEN_TABLE} WHERE owner_id = ?`,
      [ownerId]
    );
    db.runSync(
      `DELETE FROM ${VENDOR_PAYMENTS_SCREEN_META_TABLE} WHERE owner_id = ?`,
      [ownerId]
    );
  });
}

/** Mark cache stale without deleting rows. */
export async function markVendorPaymentsStale(ownerId: number): Promise<void> {
  if (!ownerId) return;
  await setVendorPaymentsLastSync(ownerId, 0);
}
