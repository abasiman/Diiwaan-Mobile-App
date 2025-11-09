// dbform/wakaaladSync.ts
import api from '@/services/api';
import { upsertWakaaladFromServer, type WakaaladListResponse } from './wakaaladRepo';

type SyncParams = {
  token: string;
  ownerId: number;
  startDate: Date;
  endDate: Date;
};

/**
 * Pull wakaalad list from server for the given date range,
 * store it into local DB, and return the server response.
 */
export async function syncWakaaladFromServer({
  token,
  ownerId,
  startDate,
  endDate,
}: SyncParams): Promise<WakaaladListResponse> {
  const res = await api.get<WakaaladListResponse>('/wakaalad_diiwaan', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    params: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      _ts: Date.now(),
    },
  });

  const data = res.data;
  const items = Array.isArray(data?.items) ? data.items : [];
  await upsertWakaaladFromServer(ownerId, items);

  return data;
}
