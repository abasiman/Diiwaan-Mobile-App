// oilpurchasevendorbillsync.ts
// Sync helper: talks to API + updates offline cache.

import api from '@/services/api';
import {
  SupplierDueItem,
  SupplierDueResponse,
  getVendorBillsForOwner,
  getVendorBillsLastSync,
  saveVendorBillsForOwner,
} from './oilpurchasevendorbillsrepo';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Fetch from API and refresh cache. Falls back to cached data if request fails. */
export async function syncVendorBillsFromServer(
  token: string | null,
  ownerId: number
): Promise<SupplierDueItem[]> {
  if (!ownerId) return [];

  if (!token) {
    console.warn('[vendor-bills-sync] No token, returning cache only');
    return getVendorBillsForOwner(ownerId);
  }

  try {
    const res = await api.get<SupplierDueResponse>(
      '/diiwaanvendorpayments/supplier-dues',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        } as any,
        params: { _ts: Date.now() },
      }
    );

    const items = res.data?.items ?? [];
    console.log(
      `[vendor-bills-sync] Server returned ${items.length} items for owner=${ownerId}`
    );
    await saveVendorBillsForOwner(ownerId, items);

    const cached = await getVendorBillsForOwner(ownerId);
    console.log(
      `[vendor-bills-sync] After save, cache has ${cached.length} items for owner=${ownerId}`
    );

    return items;
  } catch (err) {
    console.warn('[vendor-bills-sync] Failed to fetch from server, using cache', err);
    return getVendorBillsForOwner(ownerId);
  }
}


/**
 * Get vendor bills, syncing from server if:
 *  - force = true, OR
 *  - cache is older than maxAgeMs, OR
 *  - cache has never been synced.
 *
 * On fetch error, will fall back to cached data.
 */
export async function getVendorBillsWithSync(options: {
  token: string | null;
  ownerId: number;
  force?: boolean;
  maxAgeMs?: number;
}): Promise<SupplierDueItem[]> {
  const { token, ownerId, force = false, maxAgeMs = DEFAULT_MAX_AGE_MS } = options;

  if (!ownerId) return [];

  if (force) {
    return syncVendorBillsFromServer(token, ownerId);
  }

  const lastSync = await getVendorBillsLastSync(ownerId);
  const now = Date.now();

  if (!lastSync || now - lastSync > maxAgeMs) {
    // Try to fetch fresh; fall back to cache on error.
    try {
      return await syncVendorBillsFromServer(token, ownerId);
    } catch (err) {
      console.warn('[vendor-bills-sync] Error during sync, falling back to cache', err);
      return getVendorBillsForOwner(ownerId);
    }
  }

  // Cache is fresh enough
  return getVendorBillsForOwner(ownerId);
}

/**
 * Simple helper you can call on logout to clean up cache for a user.
 * (Kept here just for convenience re-export if you want to group sync-related helpers.)
 */
// Re-export if you like:
// export { clearVendorBillsForOwner } from './oilpurchasevendorbillsrepo';
