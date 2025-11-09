// app/db/wakaaladSellOptionsSync.ts

import api from '@/services/api';
import { upsertWakaaladSellOptionsFromServer, type WakaaladSellOption, } from './wakaaladSellOptionsRepo';

/**
 * Full sync for wakaalad sell options.
 *
 * Call this from your global sync (after login, pull-to-refresh, etc).
 */
export async function syncAllWakaaladSellOptions(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const headers = { Authorization: `Bearer ${token}` };

  // /wakaalad_diiwaan/sell-options returns a simple List[WakaaladSellOption],
  // no paging, so we just pull once with a large enough limit.
  const res = await api.get<WakaaladSellOption[]>('/wakaalad_diiwaan/sell-options', {
    headers,
    params: {
      only_available: true,      // or false if you want all
      order: 'created_desc',
      limit: 1000,               // max defined in endpoint
    },
  });

  const items = res.data ?? [];
  upsertWakaaladSellOptionsFromServer(ownerId, items);
}
