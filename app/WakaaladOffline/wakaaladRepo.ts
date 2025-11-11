// app/WakaaladOffline/wakaaladRepo.ts
import { listWakaaladRows, upsertWakaaladRows } from './wakaaladOfflineDb';

export type WakaaladRead = {
  id: number;
  oil_id: number;
  wakaalad_name: string;
  oil_type: string;
  original_qty: number;
  wakaal_stock: number; // TOTAL liters in stock
  wakaal_sold: number; // TOTAL liters sold
  date: string;
  is_deleted: boolean;

  // breakdowns (server-calculated, we just store them)
  stock_fuusto: number;
  stock_caag: number;
  stock_liters: number;
  stock_breakdown: string;

  sold_fuusto: number;
  sold_caag: number;
  sold_liters: number;
  sold_breakdown: string;
};

export type WakaaladListResponse = {
  items: WakaaladRead[];
  totals: { count: number; total_stock: number; total_sold: number };
  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;
};

type LocalQueryOpts = {
  ownerId: number;
  startDate?: Date;
  endDate?: Date;
};

/**
 * Upsert server wakaalad items into the local DB for this owner.
 * Called from wakaaladSync.ts after fetching from /wakaalad_diiwaan.
 */
export async function upsertWakaaladFromServer(
  ownerId: number,
  items: WakaaladRead[]
): Promise<void> {
  if (!ownerId || !items || !items.length) return;
  await upsertWakaaladRows(ownerId, items);
}

/**
 * Read wakaalad list from local DB, filtered by date range.
 * Always returns plain WakaaladRead[] for the UI.
 */
export async function getWakaaladLocal({
  ownerId,
  startDate,
  endDate,
}: LocalQueryOpts): Promise<WakaaladRead[]> {
  if (!ownerId) return [];

  const rows = await listWakaaladRows(ownerId, {
    startDateIso: startDate ? startDate.toISOString() : undefined,
    endDateIso: endDate ? endDate.toISOString() : undefined,
  });

  // 🔹 DEDUPE: collapse local shadow (-id) + server (+id) into ONE row, preferring server.
  const byKey = new Map<string, any>();

  for (const row of rows) {
    const key = [
      row.oil_id,
      String(row.wakaalad_name ?? '').trim().toLowerCase(),
      String(row.date ?? '').slice(0, 10), // yyyy-mm-dd
    ].join('|');

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const existingId = Number(existing.id ?? 0);
    const thisId = Number(row.id ?? 0);

    // Prefer positive (server) ID over negative (local shadow)
    if (existingId < 0 && thisId > 0) {
      byKey.set(key, row);
    } else if (thisId > 0 && existingId > 0 && thisId > existingId) {
      // both positive: keep the newer id, just in case
      byKey.set(key, row);
    }
    // else keep existing
  }

  const deduped = Array.from(byKey.values());

  // keep same ordering as before: newest date first, then id desc
  deduped.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return Number(b.id || 0) - Number(a.id || 0);
  });

  return deduped.map(
    (row: any): WakaaladRead => ({
      id: Number(row.id),
      oil_id: Number(row.oil_id),
      wakaalad_name: String(row.wakaalad_name ?? ''),
      oil_type: String(row.oil_type ?? ''),
      original_qty: Number(row.original_qty ?? 0),
      wakaal_stock: Number(row.wakaal_stock ?? 0),
      wakaal_sold: Number(row.wakaal_sold ?? 0),
      date: String(row.date ?? ''),
      is_deleted: !!row.is_deleted,

      stock_fuusto: Number(row.stock_fuusto ?? 0),
      stock_caag: Number(row.stock_caag ?? 0),
      stock_liters: Number(row.stock_liters ?? 0),
      stock_breakdown: String(row.stock_breakdown ?? ''),

      sold_fuusto: Number(row.sold_fuusto ?? 0),
      sold_caag: Number(row.sold_caag ?? 0),
      sold_liters: Number(row.sold_liters ?? 0),
      sold_breakdown: String(row.sold_breakdown ?? ''),
    })
  );
}






export async function applyLocalWakaaladSale(
  ownerId: number,
  wakaaladId: number,
  liters: number
): Promise<void> {
  if (!ownerId || !wakaaladId || !(liters > 0)) return;

  // Load all wakaalad rows for this owner and find the one by ID
  const rows = await listWakaaladRows(ownerId, {} as any);
  const row: any | undefined = rows.find(
    (r: any) => Number(r.id) === Number(wakaaladId)
  );
  if (!row) return; // nothing to update (will be fixed on next sync)

  const currentStock = Number(row.wakaal_stock ?? 0);
  const currentSold = Number(row.wakaal_sold ?? 0);

  const nextStock = Math.max(0, currentStock - liters);
  const nextSold = currentSold + liters;

  const nextRow = {
    ...row,
    wakaal_stock: nextStock,
    wakaal_sold: nextSold,
    stock_liters: nextStock,
    sold_liters: nextSold,
  };

  await upsertWakaaladRows(ownerId, [nextRow]);
}



/**
 * Create a local “shadow” wakaalad row when the user creates a wakaalad OFFLINE.
 * This lets the dashboard show it immediately from the offline wakaalad DB.
 *
 * Returns the local (negative) id used.
 */
export async function insertLocalWakaaladFromForm(params: {
  ownerId: number;
  oil_id: number;
  oil_type: string;
  wakaalad_name: string;
  allocate_liters: number;
  date?: string | Date;
}): Promise<number> {
  const { ownerId, oil_id, oil_type, wakaalad_name, allocate_liters } = params;
  if (!ownerId || !oil_id || !allocate_liters) return -1;

  const d =
    typeof params.date === 'string'
      ? new Date(params.date)
      : params.date instanceof Date
      ? params.date
      : new Date();
  const iso = d.toISOString();

  // Use a negative id so it doesn't collide with real server IDs
  const localId = -Date.now();

  const row: WakaaladRead = {
    id: localId,
    oil_id,
    wakaalad_name,
    oil_type,
    original_qty: allocate_liters,
    wakaal_stock: allocate_liters, // everything is in stock initially
    wakaal_sold: 0,
    date: iso,
    is_deleted: false,

    // breakdowns – simple defaults; server will overwrite on sync
    stock_fuusto: 0,
    stock_caag: 0,
    stock_liters: allocate_liters,
    stock_breakdown: '',

    sold_fuusto: 0,
    sold_caag: 0,
    sold_liters: 0,
    sold_breakdown: '',
  };

  await upsertWakaaladRows(ownerId, [row]);
  return localId;
}

/**
 * Apply an EDIT action locally so the dashboard reflects it immediately.
 * This mirrors the PATCH body you send to /wakaalad_diiwaan/{id}.
 *
 * You can ALSO queue the same payload in your wakaaladactionsofflinerep
 * when offline or on network error.
 */
export async function applyLocalWakaaladEdit(
  ownerId: number,
  current: WakaaladRead,
  payload: { wakaalad_name?: string; date?: string; set_total_liters?: number }
): Promise<void> {
  if (!ownerId || !current) return;

  const next: WakaaladRead = { ...current };

  if (typeof payload.wakaalad_name === 'string' && payload.wakaalad_name.trim().length) {
    next.wakaalad_name = payload.wakaalad_name.trim();
  }

  if (typeof payload.date === 'string') {
    next.date = payload.date;
  }

  if (typeof payload.set_total_liters === 'number') {
    const total = payload.set_total_liters;
    const sold = Number(current.wakaal_sold || 0);
    const stock = Math.max(total - sold, 0);

    next.original_qty = total;
    next.wakaal_stock = stock;
    next.wakaal_sold = sold;

    // simple derived fields – server will overwrite on next sync
    next.stock_liters = stock;
    next.sold_liters = sold;
  }

  await upsertWakaaladRows(ownerId, [next]);
}

/**
 * Mark a wakaalad as deleted in the local DB (soft delete),
 * so it disappears from the dashboard even while offline.
 *
 * You can also queue a DELETE action separately for later sync.
 */
export async function applyLocalWakaaladDelete(
  ownerId: number,
  current: WakaaladRead
): Promise<void> {
  if (!ownerId || !current) return;
  const next: WakaaladRead = { ...current, is_deleted: true };
  await upsertWakaaladRows(ownerId, [next]);
}

/**
 * Apply a RESTOCK locally (increase total & stock liters).
 * This is a simple approximation; the server will recompute breakdowns on sync.
 *
 * You still send the real RESTOCK POST body (with from_oil_id, liters, date)
 * when online or from your wakaaladactionssync worker.
 */
export async function applyLocalWakaaladRestock(
  ownerId: number,
  current: WakaaladRead,
  liters: number
): Promise<void> {
  if (!ownerId || !current || !(liters > 0)) return;

  const next: WakaaladRead = { ...current };
  const currentOriginal = Number(current.original_qty || 0);
  const currentStock = Number(current.wakaal_stock || 0);

  next.original_qty = currentOriginal + liters;
  next.wakaal_stock = currentStock + liters;

  // simple derived field; server will overwrite on sync
  next.stock_liters = next.wakaal_stock;

  await upsertWakaaladRows(ownerId, [next]);
}
