///extraCostCreateSync.ts
import api from '@/services/api';
import { upsertExtraCostsFromServer } from '../ExtraCostsOffline/extraCostsRepo';
import {
  clearQueuedExtraCost,
  getQueuedExtraCosts,
  recordExtraCostQueueError,
} from './extraCostCreateRepo';

export async function syncPendingOilExtraCosts(token: string, ownerId: number) {
  if (!token || !ownerId) return;

  const queued = getQueuedExtraCosts(ownerId);
  if (!queued.length) return;

  for (const row of queued) {
    try {
      const payload = {
        category: row.category,
        amount: row.amount_usd,
      };

      const res = await api.post(`/diiwaanoil/${row.anchor_id}/extra-costs`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = res?.data ?? {};

      // Upsert into offline "read" DB so UI sees it immediately
      await upsertExtraCostsFromServer(ownerId, [
        {
          id: Number(data.id),
          oil_id: data.oil_id ?? null,
          lot_id: data.lot_id ?? null,
          category: data.category ?? row.category,
          description: data.description ?? null,
          amount: Number(data.amount ?? row.amount_usd),
          total_paid: Number(data.total_paid ?? 0),
          due:
            data.due != null
              ? Number(data.due)
              : Math.max(Number(data.amount ?? row.amount_usd) - Number(data.total_paid ?? 0), 0),
          currency: data.currency ?? null,
          updated_at: data.updated_at || new Date().toISOString(),
        },
      ]);

      clearQueuedExtraCost(ownerId, row.id);
    } catch (e: any) {
      const status = e?.response?.status;
      const message = String(
        e?.response?.data?.detail || e?.message || 'Failed to sync offline extra cost.'
      );

      recordExtraCostQueueError(ownerId, row.id, message);

      // For network / 5xx → stop and retry later
      if (!status || status >= 500) {
        break;
      }

      // For 4xx client errors → drop the bad record and continue
      clearQueuedExtraCost(ownerId, row.id);
    }
  }
}
