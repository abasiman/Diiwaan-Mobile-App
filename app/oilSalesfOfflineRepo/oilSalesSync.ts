// app/OilSalesOffline/oilSalesSync.ts

import api from '@/services/api';
import { upsertOilSalesFromServer } from './oilSalesRepo';

type SyncOilSalesParams = {
  token: string;
  ownerId: number;
  fromDate?: string; // ISO string
  toDate?: string;   // ISO string
};

/**
 * Fetch oil sales from the server and return a flat array of sale rows.
 * Uses GET /oilsale/summary and pulls data.items.
 */
async function fetchOilSalesFromServer({
  token,
  ownerId,
  fromDate,
  toDate,
}: SyncOilSalesParams): Promise<any[]> {
  const limit = 200;
  let offset = 0;
  const allItems: any[] = [];

  // Base params for your FastAPI /oilsale/summary
  const baseParams: Record<string, any> = {
    // owner_id is actually taken from the token in your backend, but
    // sending it as a query param doesn’t hurt if you like the symmetry.
    owner_id: ownerId,
    limit,
  };

  // Your /oilsale/summary uses start / end for date filtering
  if (fromDate) baseParams.start = fromDate;
  if (toDate) baseParams.end = toDate;

  while (true) {
    const params = { ...baseParams, offset };

    const res = await api.get('/oilsale/summary', {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    const data = res.data;
    const pageItems = Array.isArray(data?.items) ? data.items : [];
    allItems.push(...pageItems);

    const hasMore = Boolean(data?.has_more);
    if (!hasMore) break;

    offset += limit;
  }

  return allItems;
}

/**
 * Full sync: load from API and upsert into local SQLite.
 */
export async function syncOilSales(params: SyncOilSalesParams) {
  try {
    const rows = await fetchOilSalesFromServer(params);
    await upsertOilSalesFromServer(rows, params.ownerId);
  } catch (err) {
    console.warn('[syncOilSales] failed', err);
    throw err;
  }
}
