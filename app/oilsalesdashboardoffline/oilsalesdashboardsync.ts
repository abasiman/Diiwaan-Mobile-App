// app/oilsalesdashboardsync.ts
import api from '@/services/api';
import {
    upsertOilSalesFromServer,
    type OilSaleSummaryResponse,
} from './oilsalesdashboardrepo';

type SyncParams = {
  token: string;
  ownerId: number;
  startDate: Date;
  endDate: Date;
};

/**
 * Pull /oilsale/summary for date range, cache in local DB, return server response.
 * Mirrors the call you had inline in OilSalesPage.
 */
export async function syncOilSalesSummaryFromServer({
  token,
  ownerId,
  startDate,
  endDate,
}: SyncParams): Promise<OilSaleSummaryResponse> {
  // YYYY-MM-DD strings
  const startApi = startDate.toISOString().slice(0, 10);
  const endPlus = new Date(endDate.getTime());
  endPlus.setDate(endPlus.getDate() + 1); // inclusive end-of-day
  const endApi = endPlus.toISOString().slice(0, 10);

  const res = await api.get<OilSaleSummaryResponse>('/oilsale/summary', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    params: {
      limit: 200,
      order: 'created_desc',
      start: `${startApi}T00:00:00`,
      end: `${endApi}T00:00:00`,
      _ts: Date.now(),
    },
  });

  const data = res.data;
  await upsertOilSalesFromServer(ownerId, data);
  return data;
}
