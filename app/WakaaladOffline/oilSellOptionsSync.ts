// app/WakaaladOffline/oilSellOptionsSync.ts
import api from '@/services/api';
import {
  upsertOilSellOptionsFromServer,
  type OilSellOption,
} from './oilSellOptionsRepo';

/**
 * Full sync for oil sell-options:
 * - pull /diiwaanoil/sell-options from server
 * - store snapshot into oilselloptions_all
 *
 * Called from GlobalSync in app/layout.tsx:
 *   await run('syncAllOilSellOptions', () =>
 *     syncAllOilSellOptions(ownerId, token)
 *   );
 */
export async function syncAllOilSellOptions(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const headers = { Authorization: `Bearer ${token}` };

  // Assuming this endpoint returns the full list (no pagination in your current usage)
  const res = await api.get<OilSellOption[]>('/diiwaanoil/sell-options', {
    headers,
    params: {
      only_available: true,
      order: 'created_desc',
    },
  });

  const options = Array.isArray(res.data) ? res.data : [];
  if (!options.length) return;

  upsertOilSellOptionsFromServer(options, ownerId);
}
