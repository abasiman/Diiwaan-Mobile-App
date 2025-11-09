// High-level repository for offline vendor bills caching.

import { db } from '../db/db';
import {
  initVendorPaymentDb,
  VENDOR_BILLS_META_TABLE,
  VENDOR_BILLS_TABLE,
} from './vendorPaymentDb';

/** ---------- Types (mirror the screen types) ---------- */

export type ExtraCostSummary = {
  id: number;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
  oil_id?: number | null;
};

export type OilDueLine = {
  oil_id: number;
  oil_type?: string | null;
  liters?: number | null;
  sold_l: number;
  in_stock_l: number;

  oil_total_landed_cost: number;
  total_extra_cost: number;
  over_all_cost: number;
  total_paid: number;
  amount_due: number;

  extra_costs: ExtraCostSummary[];
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
  over_all_cost?: number;
  total_paid: number;
  amount_due: number;

  child_oils?: OilDueLine[];

  extra_costs: ExtraCostSummary[];
  date?: string | null;

  /** Local FK → oil modal form row (for offline link to real oil ids later) */
  local_oil_form_id?: number | null;
};

export type SupplierDueResponse = { items: SupplierDueItem[] };

/** For linking offline bills to real oil ids after sync. */
export type RemoteOilInfo = {
  lot_id?: number | null;
  oil_ids?: number[];
};

/** ---------- Repo functions ---------- */

/**
 * Append a single local vendor bill to the cached list for an owner.
 * Used when creating a bill offline (e.g. from oilmodal).
 */
export async function addLocalVendorBill(
  ownerId: number,
  bill: SupplierDueItem
): Promise<void> {
  if (!ownerId) return;

  const existing = await getVendorBillsForOwner(ownerId);
  const updated = [...existing, bill];
  await saveVendorBillsForOwner(ownerId, updated);
}

/**
 * Replace all cached vendor bills for an owner with the provided items.
 * This is used after a full sync from the API.
 */
export async function saveVendorBillsForOwner(
  ownerId: number,
  items: SupplierDueItem[]
): Promise<void> {
  if (!ownerId) {
    console.warn('[vendor-bills] saveVendorBillsForOwner called with no ownerId');
    return;
  }
  initVendorPaymentDb();

  const now = Date.now();

  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM ${VENDOR_BILLS_TABLE} WHERE owner_id = ?`,
      [ownerId],
    );

    items.forEach((item, index) => {
      const json = JSON.stringify(item);
      db.runSync(
        `
        INSERT INTO ${VENDOR_BILLS_TABLE} (
          owner_id,
          bill_index,
          data_json,
          updated_at
        ) VALUES (?, ?, ?, ?);
      `,
        [ownerId, index, json, now],
      );
    });

    db.runSync(
      `
      INSERT OR REPLACE INTO ${VENDOR_BILLS_META_TABLE} (
        owner_id,
        last_sync_ts
      ) VALUES (?, ?);
    `,
      [ownerId, now],
    );
  });

  console.log(
    `[vendor-bills] Saved ${items.length} items for owner=${ownerId} at ts=${now}`,
  );
}

/**
 * Read all cached vendor bills for an owner (ordered by bill_index ASC).
 */
export async function getVendorBillsForOwner(
  ownerId: number
): Promise<SupplierDueItem[]> {
  if (!ownerId) {
    console.warn('[vendor-bills] getVendorBillsForOwner called with no ownerId');
    return [];
  }
  initVendorPaymentDb();

  const rows = db.getAllSync<{ data_json: string }>(
    `
    SELECT data_json
    FROM ${VENDOR_BILLS_TABLE}
    WHERE owner_id = ?
    ORDER BY bill_index ASC;
  `,
    [ownerId],
  );

  console.log(
    `[vendor-bills] Loaded ${rows.length} cached rows for owner=${ownerId}`,
  );

  const out: SupplierDueItem[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data_json);
      out.push(parsed);
    } catch (err) {
      console.warn('[vendor-bills] Failed to parse cached row', err);
    }
  }
  console.log(
    `[vendor-bills] Parsed ${out.length} cached items for owner=${ownerId}`,
  );
  return out;
}

/** Get last successful sync timestamp for an owner (ms since epoch) or null. */
export async function getVendorBillsLastSync(
  ownerId: number
): Promise<number | null> {
  if (!ownerId) return null;
  initVendorPaymentDb();

  const rows = db.getAllSync<{ last_sync_ts: number }>(
    `
    SELECT last_sync_ts
    FROM ${VENDOR_BILLS_META_TABLE}
    WHERE owner_id = ?
    LIMIT 1;
  `,
    [ownerId],
  );

  if (!rows.length) return null;
  const ts = Number(rows[0].last_sync_ts);
  return Number.isFinite(ts) ? ts : null;
}

/** Manually set last sync timestamp. */
export async function setVendorBillsLastSync(
  ownerId: number,
  ts: number
): Promise<void> {
  if (!ownerId) return;
  initVendorPaymentDb();

  db.runSync(
    `
    INSERT OR REPLACE INTO ${VENDOR_BILLS_META_TABLE} (
      owner_id,
      last_sync_ts
    ) VALUES (?, ?);
  `,
    [ownerId, ts],
  );
}

/** Clear cached vendor bills + meta for an owner (used on logout, etc.). */
export async function clearVendorBillsForOwner(ownerId: number): Promise<void> {
  if (!ownerId) return;
  initVendorPaymentDb();

  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM ${VENDOR_BILLS_TABLE} WHERE owner_id = ?`,
      [ownerId],
    );
    db.runSync(
      `DELETE FROM ${VENDOR_BILLS_META_TABLE} WHERE owner_id = ?`,
      [ownerId],
    );
  });
}

/** Convenience helper: mark cache stale without deleting rows. */
export async function markVendorBillsStale(ownerId: number): Promise<void> {
  if (!ownerId) return;
  await setVendorBillsLastSync(ownerId, 0);
}

/**
 * After an offline oil form is synced and we have real oil ids + lot id,
 * patch the cached vendor bills that were created from that form.
 */
export async function linkVendorBillsToOil(
  ownerId: number,
  localFormId: number,
  remote: RemoteOilInfo,
): Promise<void> {
  if (!ownerId || !localFormId) return;

  const bills = await getVendorBillsForOwner(ownerId);
  if (!bills.length) return;

  const oilIds = remote.oil_ids || [];
  const lotId = remote.lot_id ?? null;

  const updated: SupplierDueItem[] = bills.map((b) => {
    const billAny = b as SupplierDueItem & { local_oil_form_id?: number | null };
    if (billAny.local_oil_form_id !== localFormId) return b;

    const clone: SupplierDueItem & { local_oil_form_id?: number | null } = {
      ...billAny,
    };

    // Set lot id for this bill if we have one.
    if (lotId !== null) {
      clone.lot_id = lotId;
    }

    // If this is a single-oil bill (no child_oils), attach the single oil id.
    if (oilIds.length === 1 && (!clone.child_oils || clone.child_oils.length === 0)) {
      clone.oil_id = oilIds[0];
      return clone;
    }

    // If this is a BOTH bill (with child_oils), align children by index.
    if (clone.child_oils && clone.child_oils.length && oilIds.length === clone.child_oils.length) {
      clone.child_oils = clone.child_oils.map((c, idx) => ({
        ...c,
        oil_id: oilIds[idx] ?? c.oil_id,
      }));
    }

    return clone;
  });

  await saveVendorBillsForOwner(ownerId, updated);
}
