//vendorPaymentsScreenSync.ts
import api from '@/services/api';
import {
  VendorPaymentWithContext,
  getVendorPaymentsForOwner,
  getVendorPaymentsLastSync,
  saveVendorPaymentsForOwner,
} from './vendorPaymentsScreenRepo';

type VendorPaymentListResponse = {
  items: VendorPaymentWithContext[];
};

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Fetch from API and refresh cache. Falls back to cached data if request fails. */
export async function syncVendorPaymentsScreenFromServer(params: {
  token: string | null;
  ownerId: number;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<VendorPaymentWithContext[]> {
  const { token, ownerId, fromDate, toDate, limit = 1000 } = params;

  if (!ownerId) return [];

  if (!token) {
    console.warn('[vp-screen-sync] No token, returning cache only');
    return getVendorPaymentsForOwner(ownerId);
  }

  try {
    const res = await api.get<VendorPaymentListResponse>(
      '/diiwaanvendorpayments',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        } as any,
        params: {
          order: 'created_desc',
          from_date: fromDate,
          to_date: toDate,
          limit,
          offset: 0,
          _ts: Date.now(),
        },
      }
    );

    const items = res.data?.items ?? [];
    console.log(
      `[vp-screen-sync] Server returned ${items.length} items for owner=${ownerId}`
    );
    await saveVendorPaymentsForOwner(ownerId, items);

    const cached = await getVendorPaymentsForOwner(ownerId);
    console.log(
      `[vp-screen-sync] After save, cache has ${cached.length} items for owner=${ownerId}`
    );

    return items;
  } catch (err) {
    console.warn('[vp-screen-sync] Failed to fetch from server, using cache', err);
    return getVendorPaymentsForOwner(ownerId);
  }
}

/**
 * Get vendor payments for screen, syncing from server if:
 *  - force = true, OR
 *  - cache is older than maxAgeMs, OR
 *  - cache has never been synced.
 *
 * On fetch error, will fall back to cached data.
 */
export async function getVendorPaymentsScreenWithSync(options: {
  token: string | null;
  ownerId: number;
  fromDate?: string;
  toDate?: string;
  force?: boolean;
  maxAgeMs?: number;
}): Promise<VendorPaymentWithContext[]> {
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
    return syncVendorPaymentsScreenFromServer({ token, ownerId, fromDate, toDate });
  }

  const lastSync = await getVendorPaymentsLastSync(ownerId);
  const now = Date.now();

  if (!lastSync || now - lastSync > maxAgeMs) {
    try {
      return await syncVendorPaymentsScreenFromServer({ token, ownerId, fromDate, toDate });
    } catch (err) {
      console.warn('[vp-screen-sync] Error during sync, falling back to cache', err);
      return getVendorPaymentsForOwner(ownerId);
    }
  }

  // Cache is fresh enough
  return getVendorPaymentsForOwner(ownerId);
}
