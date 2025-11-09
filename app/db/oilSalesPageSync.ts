import {
  upsertOilSalesFromServer,
  type OilSaleSummaryResponse,
} from '@/app/db/oilSalesPageRepo';

import api from '@/services/api';
import { syncPendingOilSales } from '../dbform/invocieoilSalesOfflineRepo';

/**
 * Full sync for OilSalesPage: page through /oilsale/summary and
 * persist all rows into oilsales_all.
 *
 * Also flushes any locally queued oil sales before pulling the summary,
 * so offline-created sales are pushed to the server and then pulled back
 * into the main oilsales_all table.
 *
 * Call this from your global sync, e.g. after login or pull-to-refresh.
 */
export async function syncAllOilSales(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const headers = { Authorization: `Bearer ${token}` };

  // First, try to push any pending offline sales.
  try {
    await syncPendingOilSales(token, ownerId);
  } catch (e) {
    // Don't block the rest of the sync if this fails
    console.warn('syncPendingOilSales in syncAllOilSales failed', e);
  }

  const limit = 200;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await api.get<OilSaleSummaryResponse>('/oilsale/summary', {
      headers,
      params: {
        limit,
        offset,
        order: 'created_desc',
      },
    });

    const data = res.data;
    upsertOilSalesFromServer(data, ownerId);

    const returned = data.returned ?? data.items.length;
    hasMore = Boolean(data.has_more) && returned > 0;
    offset += returned;
  }
}
