// app/OilPurchaseOffline/oilSummaryStatsSync.ts
import api from '@/services/api';
import {
    saveOilSummaryCache,
    saveWakaaladStatsCache,
} from './oilSummaryStatsCache';

// You can import these types from VendorBillsScreen if you export them there;
// or just use `any` if you don't care about typing strictly.
type SummaryResponse = any;
type WakaaladStatsResponse = any;

export async function syncOilSummaryAndWakaaladStats(
  token: string | null,
  ownerId: number
): Promise<void> {
  if (!ownerId || !token) {
    console.warn('[oilSummaryStatsSync] no ownerId or token, skipping');
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  } as any;

  try {
    const [summaryRes, wakaaladRes] = await Promise.all([
      api.get<SummaryResponse>('/diiwaanoil/summary', { headers }),
      api.get<WakaaladStatsResponse>('/wakaalad_diiwaan/stats/summary', { headers }),
    ]);

    await saveOilSummaryCache(ownerId, summaryRes.data);
    await saveWakaaladStatsCache(ownerId, wakaaladRes.data);

    console.log(
      '[oilSummaryStatsSync] synced oil summary + wakaalad stats for owner',
      ownerId
    );
  } catch (err) {
    console.warn('[oilSummaryStatsSync] failed to sync KPI stats', err);
  }
}
