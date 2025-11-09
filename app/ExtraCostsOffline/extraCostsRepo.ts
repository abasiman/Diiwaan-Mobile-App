// app/ExtraCostsOffline/extraCostsRepo.ts
import {
  deleteExtraCostRow,
  listExtraCostRows,
  upsertExtraCostRows,
} from './extraCostsDb';

export type ExtraCostRead = {
  id: number;
  oil_id?: number | null;
  lot_id?: number | null;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
  currency?: string | null;
};

type LocalQueryOpts = {
  ownerId: number;
  oilId?: number | null;
  lotId?: number | null;
};

type UpsertFromServerItem = {
  id: number;
  oil_id?: number | null;
  lot_id?: number | null;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid: number;
  due: number;
  currency?: string | null;
  updated_at?: string | null;
};

/** Upsert batch from server (or single updates) into local DB. */
export async function upsertExtraCostsFromServer(
  ownerId: number,
  items: UpsertFromServerItem[]
): Promise<void> {
  if (!ownerId || !items.length) return;

  const upserts = items.map((it) => ({
    id: Number(it.id),
    oil_id: it.oil_id ?? null,
    lot_id: it.lot_id ?? null,
    category: it.category ?? null,
    description: it.description ?? null,
    amount: Number(it.amount ?? 0),
    total_paid: Number(it.total_paid ?? 0),
    due:
      typeof it.due === 'number'
        ? Number(it.due)
        : Math.max(Number(it.amount ?? 0) - Number(it.total_paid ?? 0), 0),
    currency: it.currency ?? null,
    updated_at: it.updated_at || new Date().toISOString(),
  }));

  await upsertExtraCostRows(ownerId, upserts);
}

/** Local read for a given oil or lot. */
export async function getExtraCostsLocal(opts: LocalQueryOpts): Promise<ExtraCostRead[]> {
  if (!opts.ownerId) return [];
  const rows = await listExtraCostRows(opts.ownerId, {
    oilId: opts.oilId ?? null,
    lotId: opts.lotId ?? null,
  });

  return rows.map(
    (row): ExtraCostRead => ({
      id: Number(row.id),
      oil_id: row.oil_id != null ? Number(row.oil_id) : null,
      lot_id: row.lot_id != null ? Number(row.lot_id) : null,
      category: row.category ?? null,
      description: row.description ?? null,
      amount: Number(row.amount ?? 0),
      total_paid: Number(row.total_paid ?? 0),
      due:
        row.due != null
          ? Number(row.due)
          : Math.max(Number(row.amount ?? 0) - Number(row.total_paid ?? 0), 0),
      currency: row.currency ?? null,
    })
  );
}

/** Remove a single extra cost from local cache (after DELETE succeeds). */
export async function removeExtraCostLocal(ownerId: number, id: number): Promise<void> {
  if (!ownerId || !id) return;
  await deleteExtraCostRow(ownerId, id);
}

/**
 * Create a local-only extra cost row so it appears offline
 * immediately (used when queueing create while offline).
 */
export async function createExtraCostLocal(args: {
  ownerId: number;
  oilId?: number | null;
  lotId?: number | null;
  category: string;
  description?: string | null;
  amount: number;
  currency?: string | null;
}): Promise<void> {
  const { ownerId, oilId, lotId, category, description, amount, currency } = args;
  if (!ownerId) return;
  if (!category.trim() || !(amount > 0)) return;

  const now = new Date().toISOString();

  // Use a negative ID to clearly mark local-only rows
  const localId = -Math.abs(Date.now());

  await upsertExtraCostRows(ownerId, [
    {
      id: localId,
      oil_id: oilId ?? null,
      lot_id: lotId ?? null,
      category: category.trim(),
      description: description ?? null,
      amount: Number(amount || 0),
      total_paid: 0,
      due: Number(amount || 0),
      currency: currency ?? null,
      updated_at: now,
    },
  ]);
}
