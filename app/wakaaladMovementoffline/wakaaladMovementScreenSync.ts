// app/WakaaladMovementOffline/wakaaladMovementScreenSync.ts
import api from '@/services/api';
import {
    WakaaladMovementRead,
    getWakaaladMovementsForOwner,
    getWakaaladMovementsLastSync,
    saveWakaaladMovementsForOwner,
} from './wakaaladMovementScreenRepo';

type WakaaladMovementsListResponse = {
  items: WakaaladMovementRead[];
};

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Fetch from API and refresh cache. Falls back to cached data if request fails. */
export async function syncWakaaladMovementScreenFromServer(params: {
  token: string | null;
  ownerId: number;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<WakaaladMovementRead[]> {
  const { token, ownerId, fromDate, toDate, limit = 1000 } = params;

  if (!ownerId) return [];

  if (!token) {
    console.warn('[wm-screen-sync] No token, returning cache only');
    return getWakaaladMovementsForOwner(ownerId);
  }

  try {
    const res = await api.get<WakaaladMovementsListResponse>(
      '/wakaalad_diiwaan/movements',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        } as any,
        params: {
          start: fromDate,
          end: toDate,
          limit,
          offset: 0,
          order: 'date_desc',
          _ts: Date.now(),
        },
      }
    );

    const items = res.data?.items ?? [];
    console.log(`[wm-screen-sync] Server returned ${items.length} items for owner=${ownerId}`);
    await saveWakaaladMovementsForOwner(ownerId, items);

    const cached = await getWakaaladMovementsForOwner(ownerId);
    console.log(
      `[wm-screen-sync] After save, cache has ${cached.length} items for owner=${ownerId}`
    );

    return items;
  } catch (err) {
    console.warn('[wm-screen-sync] Failed to fetch from server, using cache', err);
    return getWakaaladMovementsForOwner(ownerId);
  }
}

/**
 * Get wakaalad movements for screen, syncing from server if:
 *  - force = true, OR
 *  - cache is older than maxAgeMs, OR
 *  - cache has never been synced.
 *
 * On fetch error, will fall back to cached data.
 */
export async function getWakaaladMovementScreenWithSync(options: {
  token: string | null;
  ownerId: number;
  fromDate?: string;
  toDate?: string;
  force?: boolean;
  maxAgeMs?: number;
}): Promise<WakaaladMovementRead[]> {
  const {
    token,
    ownerId,
    fromDate,
    toDate,
    force = false,
    maxAgeMs = DEFAULT_MAX_AGE_MS,
  } = options;

  if (!ownerId) return [];

  if (force) {
    return syncWakaaladMovementScreenFromServer({ token, ownerId, fromDate, toDate });
  }

  const lastSync = await getWakaaladMovementsLastSync(ownerId);
  const now = Date.now();

  if (!lastSync || now - lastSync > maxAgeMs) {
    try {
      return await syncWakaaladMovementScreenFromServer({ token, ownerId, fromDate, toDate });
    } catch (err) {
      console.warn('[wm-screen-sync] Error during sync, falling back to cache', err);
      return getWakaaladMovementsForOwner(ownerId);
    }
  }

  // Cache is fresh enough
  return getWakaaladMovementsForOwner(ownerId);
}
