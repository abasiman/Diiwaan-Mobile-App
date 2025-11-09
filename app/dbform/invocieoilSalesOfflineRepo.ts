// app/db/oilSalesOfflineRepo.ts
import { applyLocalCustomerBalanceDeltaByName } from '@/app/db/customerRepo';
import {
  upsertOilSalesFromServer,
  type OilSaleRead as OilSalePageRead,
} from '@/app/db/oilSalesPageRepo';
import {
  getWakaaladSellOptionsLocal,
  type WakaaladSellOption,
} from '@/app/dbform/wakaaladSellOptionsRepo';
import api from '@/services/api';
import { db } from '../db/db';

type SaleUnitType = 'liters' | 'fuusto' | 'caag';
type SaleType = 'cashsale' | 'invoice';

export type CreateSalePayload = {
  oil_id: number;
  wakaalad_id: number;
  unit_type: SaleUnitType;
  unit_qty?: number;
  liters_sold?: number;
  price_per_l?: number;
  customer?: string | null;
  customer_contact?: string | null;
  currency?: string;
  fx_rate_to_usd?: number;
  sale_type: SaleType;
};

type SyncStatus = 'pending' | 'synced' | 'failed';

type QueueRow = {
  local_id: number;
  owner_id: number;
  payload_json: string;
  sync_status: SyncStatus;
  last_error?: string | null;
  created_at: string;
};

const DEFAULT_FUUSTO_L = 240;
const DEFAULT_CAAG_L = 20;

function ensureQueueTable() {
  // safe to call many times
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS oil_sale_queue (
      local_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL,
      payload_json TEXT    NOT NULL,
      sync_status  TEXT    NOT NULL DEFAULT 'pending',
      last_error   TEXT,
      created_at   TEXT    NOT NULL
    );
    `,
    []
  );
}

function capacityL(unit: SaleUnitType, opt?: WakaaladSellOption): number {
  if (unit === 'fuusto') return opt?.fuusto_capacity_l ?? DEFAULT_FUUSTO_L;
  if (unit === 'caag') return opt?.caag_capacity_l ?? DEFAULT_CAAG_L;
  return 1;
}

function billableFuustoL(opt?: WakaaladSellOption): number {
  const physical = capacityL('fuusto', opt);
  const isPetrol = (opt?.oil_type || '').toLowerCase() === 'petrol';
  return isPetrol ? Math.max(0, physical - 10) : physical;
}

/**
 * Extended shape used by the sales page to show pending offline rows.
 * These look like normal OilSaleRead rows but have a negative id and
 * carry the original local_id + pending flag.
 */
export type PendingOilSaleLocal = OilSalePageRead & {
  pending: true;
  local_id: number;
};

/**
 * Helper to compute total_usd from a CreateSalePayload so we can:
 * - show pending rows, and
 * - bump customer balance locally for offline invoice sales.
 */
function computeOfflineTotalsForPayload(
  ownerId: number,
  payload: CreateSalePayload
): {
  currency: string;
  liters_sold: number;
  total_native: number;
  total_usd: number | null;
} {
  let opt: WakaaladSellOption | undefined;
  try {
    const options = getWakaaladSellOptionsLocal(ownerId, {
      onlyAvailable: false,
      limit: 500,
    });
    opt =
      options.find(
        (o) =>
          o.wakaalad_id === payload.wakaalad_id &&
          o.oil_id === payload.oil_id
      ) ??
      options.find((o) => o.oil_id === payload.oil_id);
  } catch {
    opt = undefined;
  }

  const currency = (payload.currency || opt?.currency || 'USD').toUpperCase();
  const unit_type = payload.unit_type;
  const unit_qty =
    payload.unit_qty ?? (unit_type === 'liters' ? payload.liters_sold ?? 0 : 0);

  let liters_sold = payload.liters_sold ?? 0;
  if (!liters_sold) {
    if (unit_type === 'fuusto') {
      liters_sold = (unit_qty || 0) * billableFuustoL(opt);
    } else if (unit_type === 'caag') {
      liters_sold = (unit_qty || 0) * capacityL('caag', opt);
    } else if (unit_type === 'liters') {
      liters_sold = unit_qty;
    }
  }

  const price_per_l = payload.price_per_l ?? 0;
  const subtotal_native = liters_sold * price_per_l;
  const total_native = subtotal_native;

  let total_usd: number | null = null;
  const fx = payload.fx_rate_to_usd;
  if (currency === 'USD') {
    total_usd = total_native;
  } else if (fx && fx > 0) {
    total_usd = total_native / fx;
  }

  return { currency, liters_sold, total_native, total_usd };
}

/**
 * Store a sale locally to be synced later.
 * ALSO: if this is an invoice sale with a customer, bump that customer's
 * local balance immediately so CustomersList reflects it while offline.
 */
export async function queueOilSaleForSync(
  ownerId: number,
  payload: CreateSalePayload
): Promise<void> {
  ensureQueueTable();
  const createdAt = new Date().toISOString();
  const json = JSON.stringify(payload);

  // 1) Queue the sale
  db.runSync(
    `
      INSERT INTO oil_sale_queue (owner_id, payload_json, sync_status, created_at)
      VALUES (?, ?, 'pending', ?);
    `,
    [ownerId, json, createdAt]
  );

  // 2) Offline customer balance bump (INVOICE only)
  try {
    if (payload.sale_type === 'invoice' && payload.customer) {
      const { total_native, total_usd, currency } =
        computeOfflineTotalsForPayload(ownerId, payload);

      // Outstanding portion in USD
      const deltaUsd =
        total_usd != null
          ? total_usd
          : currency === 'USD'
          ? total_native
          : 0;

      if (deltaUsd && isFinite(deltaUsd) && deltaUsd > 0) {
        applyLocalCustomerBalanceDeltaByName(
          ownerId,
          payload.customer,
          deltaUsd
        );
      }
    }
  } catch {
    // Don't block queuing if balance bump fails; customers will be corrected
    // by the next full sync from server.
  }
}

/**
 * Try to push all pending sales to the server.
 * Call this whenever we go online.
 */


// app/dbform/invocieoilSalesOfflineRepo.ts



let syncingOilSales = false;

export async function syncPendingOilSales(
  token: string,
  ownerId: number
): Promise<void> {
  // 🔐 prevent overlapping syncs (GlobalSync + OfflineOilSaleSync + forms)
  if (syncingOilSales) return;
  syncingOilSales = true;

  try {
    ensureQueueTable();

    const rows = db.getAllSync<QueueRow>(
      `
        SELECT local_id, owner_id, payload_json, sync_status, last_error, created_at
        FROM oil_sale_queue
        WHERE owner_id = ?
          AND sync_status = 'pending'
        ORDER BY local_id ASC;
      `,
      [ownerId]
    );

    if (!rows.length) return;

    const authHeader = { Authorization: `Bearer ${token}` };

    for (const row of rows) {
      let payload: CreateSalePayload;

      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        db.runSync(
          `
            UPDATE oil_sale_queue
            SET sync_status = 'failed', last_error = ?
            WHERE local_id = ?;
          `,
          ['Invalid JSON payload', row.local_id]
        );
        continue;
      }

      try {
        const res = await api.post<OilSalePageRead>('/oilsale', payload, {
          headers: authHeader,
        });

        // Upsert the created sale into the main oilsales_all table so it
        // appears in local queries even if we go offline again.
        upsertOilSalesFromServer({ items: [res.data] }, ownerId);

        db.runSync(
          `
            UPDATE oil_sale_queue
            SET sync_status = 'synced', last_error = NULL
            WHERE local_id = ?;
          `,
          [row.local_id]
        );
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Sync failed';
        db.runSync(
          `
            UPDATE oil_sale_queue
            SET sync_status = 'failed', last_error = ?
            WHERE local_id = ?;
          `,
          [String(msg), row.local_id]
        );
        // optional: break on first failure to avoid hammering server
        break;
      }
    }
  } finally {
    syncingOilSales = false;
  }
}

/**
 * Return pending (offline) sales as OilSaleRead-shaped rows so the
 * sales page can render them alongside normal rows with an "Offline"
 * badge. Only rows with sync_status = 'pending' are returned.
 */
export function getPendingOilSalesLocalForDisplay(
  ownerId: number,
  opts?: { startISO?: string; endISO?: string; limit?: number }
): PendingOilSaleLocal[] {
  ensureQueueTable();
  if (!ownerId) return [];

  const where: string[] = ['owner_id = ?', "sync_status = 'pending'"];
  const params: any[] = [ownerId];

  if (opts?.startISO) {
    where.push('datetime(created_at) >= datetime(?)');
    params.push(opts.startISO);
  }
  if (opts?.endISO) {
    where.push('datetime(created_at) < datetime(?)');
    params.push(opts.endISO);
  }

  const limit = opts?.limit ?? 200;

  const rows = db.getAllSync<QueueRow>(
    `
      SELECT local_id, owner_id, payload_json, sync_status, last_error, created_at
      FROM oil_sale_queue
      WHERE ${where.join(' AND ')}
      ORDER BY datetime(created_at) DESC, local_id DESC
      LIMIT ? OFFSET 0;
    `,
    [...params, limit]
  );

  if (!rows.length) return [];

  // Preload wakaalad/oil info so we can show oil_type, plate, etc.
  let options: WakaaladSellOption[] = [];
  try {
    options = getWakaaladSellOptionsLocal(ownerId, {
      onlyAvailable: false,
      limit: 500,
    });
  } catch {
    options = [];
  }

  const findOpt = (
    wakaaladId: number,
    oilId: number
  ): WakaaladSellOption | undefined =>
    options.find(
      (o) => o.wakaalad_id === wakaaladId && o.oil_id === oilId
    ) ?? options.find((o) => o.oil_id === oilId);

  const results: PendingOilSaleLocal[] = [];

  for (const row of rows) {
    let payload: CreateSalePayload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      continue;
    }

    const opt = findOpt(payload.wakaalad_id, payload.oil_id);
    const oilType = opt?.oil_type ?? 'Pending sale';
    const truckPlate = opt?.truck_plate ?? null;
    const currency = (
      payload.currency || opt?.currency || 'USD'
    ).toUpperCase();

    const unit_type = payload.unit_type;
    const unit_qty =
      payload.unit_qty ??
      (unit_type === 'liters' ? payload.liters_sold ?? 0 : 0);

    let liters_sold = payload.liters_sold ?? 0;
    if (!liters_sold) {
      if (unit_type === 'fuusto') {
        liters_sold = (unit_qty || 0) * billableFuustoL(opt);
      } else if (unit_type === 'caag') {
        liters_sold = (unit_qty || 0) * capacityL('caag', opt);
      } else if (unit_type === 'liters') {
        liters_sold = unit_qty;
      }
    }

    const price_per_l = payload.price_per_l ?? 0;
    const subtotal_native = liters_sold * price_per_l;
    const total_native = subtotal_native;

    let total_usd: number | null = null;
    const fx = payload.fx_rate_to_usd;
    if (currency === 'USD') {
      total_usd = total_native;
    } else if (fx && fx > 0) {
      total_usd = total_native / fx;
    }

    const timestamp = row.created_at || new Date().toISOString();

    const base: OilSalePageRead = {
      id: -row.local_id, // negative id to avoid clashing with server ids
      owner_id: row.owner_id,
      oil_id: payload.oil_id,

      customer: payload.customer ?? null,
      customer_contact: payload.customer_contact ?? null,

      sale_type: payload.sale_type,
      oil_type: oilType,

      truck_plate: truckPlate,
      truck_type: null,
      truck_plate_extra: null,

      unit_type,
      unit_qty,
      unit_capacity_l: null,
      liters_sold,

      currency,
      price_per_l,
      price_per_unit_type: null,
      subtotal_native,
      discount_native: null,
      tax_native: null,
      total_native,
      fx_rate_to_usd: fx ?? null,
      total_usd,

      payment_status: 'unpaid',
      payment_method: null,
      paid_native: null,
      note: 'Offline sale (pending sync)',

      created_at: timestamp,
      updated_at: timestamp,
    };

    results.push({ ...base, pending: true, local_id: row.local_id });
  }

  return results;
}

/**
 * Optional helper: clear old synced rows (housekeeping).
 */
export async function pruneSyncedOilSales(
  maxAgeDays = 7
): Promise<void> {
  ensureQueueTable();
  const cutoff = new Date(
    Date.now() - maxAgeDays * 86400000
  ).toISOString();

  db.runSync(
    `
      DELETE FROM oil_sale_queue
      WHERE sync_status = 'synced'
        AND created_at < ?;
    `,
    [cutoff]
  );
}
