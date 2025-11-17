// app/ExtraCostsOffline/extraCostsSync.ts
import api from '@/services/api';
import { upsertExtraCostsFromServer } from './extraCostsRepo';

export type ExtraCostServerItem = {
  id: number;
  oil_id?: number | null;
  lot_id?: number | null;
  category?: string | null;
  description?: string | null;
  amount: number;
  total_paid?: number | null;
  due?: number | null;
  currency?: string | null;
  updated_at?: string | null;
};

type NormalizedExtraCost = {
  id: number;
  oil_id: number | null;
  lot_id: number | null;
  category: string | null;
  description: string | null;
  amount: number;
  total_paid: number;
  due: number;
  currency: string | null;
  updated_at: string;
};

/** Internal helper: normalize server payload to our local shape */
function normalizeServerItems(items: ExtraCostServerItem[]): NormalizedExtraCost[] {
  const nowIso = new Date().toISOString();

  return (items || []).map((it) => {
    const amount = Number(it.amount ?? 0);
    const totalPaid = Number(it.total_paid ?? 0);
    const due =
      typeof it.due === 'number'
        ? Number(it.due)
        : Math.max(amount - totalPaid, 0);

    return {
      id: Number(it.id),
      oil_id: it.oil_id ?? null,
      lot_id: it.lot_id ?? null,
      category: it.category ?? null,
      description: it.description ?? null,
      amount,
      total_paid: totalPaid,
      due,
      currency: it.currency ?? null,
      updated_at: it.updated_at || nowIso,
    };
  });
}

/**
 * Fetch extra-costs for a given oil or lot from the server
 * and upsert them into the local offline DB.
 *
 * Uses:
 *   - /diiwaanoil/{oil_id}/extra-costs
 *   - /diiwaanoil/lots/{lot_id}/extra-costs
 */
export async function syncExtraCostsForAnchor(opts: {
  token: string;
  ownerId: number;
  oilId?: number | null;
  lotId?: number | null;
}) {
  const { token, ownerId, oilId, lotId } = opts;
  if (!token || !ownerId || (!oilId && !lotId)) return;

  const url = lotId
    ? `/diiwaanoil/lots/${lotId}/extra-costs`
    : `/diiwaanoil/${oilId}/extra-costs`;

  const res = await api.get<ExtraCostServerItem[]>(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const items = normalizeServerItems(res.data || []).map((row) => ({
    ...row,
    oil_id: lotId ? null : (oilId ?? row.oil_id ?? null),
    lot_id: lotId ? (lotId ?? row.lot_id ?? null) : (row.lot_id ?? null),
  }));

  await upsertExtraCostsFromServer(ownerId, items);
}

/**
 * Global sync helper – currently a no-op because there is no
 * global /diiwaanoil/extra-costs endpoint in the backend.
 */
export async function syncAllExtraCosts(ownerId: number, token: string) {
  if (!token || !ownerId) return;
}
