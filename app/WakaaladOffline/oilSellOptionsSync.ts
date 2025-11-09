// app/WakaaladOffline/oilSellOptionsSync.ts

import api from '@/services/api';
import { upsertOilSellOptionsFromServer } from './oilSellOptionsRepo';

/**
 * Shape of /diiwaanoil/sell-options items coming from the backend.
 * (We keep this loose enough to match what upsertOilSellOptionsFromServer expects.)
 */
export type OilSellOptionRemote = {
  id: number;
  oil_id: number;
  lot_id?: number | null;
  oil_type: string;
  truck_plate?: string | null;
  in_stock_l: number;
  in_stock_fuusto: number;
  in_stock_caag: number;
  currency?: string | null;
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;

  // backend sometimes uses this instead of liter_price
  sell_price_per_l?: number | null;
};

/**
 * Full sync for /diiwaanoil/sell-options → local SQLite.
 *
 * Call this from your global sync / RootLayout after login, or on pull-to-refresh.
 */
export async function syncAllOilSellOptions(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const res = await api.get<OilSellOptionRemote[]>('/diiwaanoil/sell-options', {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      only_available: true,    // or false if you ever want *all* lots
      order: 'created_desc',
      limit: 1000,             // same idea as wakaalad sell-options sync
    },
  });

  const rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) return;

  upsertOilSellOptionsFromServer(rows, ownerId);
}
