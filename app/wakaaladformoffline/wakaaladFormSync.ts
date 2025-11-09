// app/dbform/wakaaladFormSync.ts
import api from '@/services/api';
import {
    getPendingWakaaladForms,
    updateWakaaladFormStatus,
    type WakaaladFormCreatePayload,
} from './wakaaladFormRepo';

/**
 * Pushes all pending/failed wakaalad forms for a given owner to the backend.
 *
 * Call this:
 *  - when the app comes online (NetInfo)
 *  - after login
 *  - on pull-to-refresh, if you want
 */
export async function syncPendingWakaaladForms(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const pending = getPendingWakaaladForms(ownerId, 100);
  if (!pending.length) return;

  const headers = { Authorization: `Bearer ${token}` };

  for (const row of pending) {
    try {
      // mark as syncing
      updateWakaaladFormStatus(row.id, 'syncing');

      const payload: WakaaladFormCreatePayload = {
        oil_id: row.oil_id,
        wakaalad_name: row.wakaalad_name,
        allocate_liters: row.allocate_liters,
        date: row.date ?? undefined,
      };

      const res = await api.post('/wakaalad_diiwaan', payload, { headers });
      const remoteId = Number(res?.data?.id ?? 0) || null;

      updateWakaaladFormStatus(row.id, 'synced', {
        remote_id: remoteId ?? undefined,
        error: null,
      });
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Failed to sync wakaalad form';

      updateWakaaladFormStatus(row.id, 'failed', {
        error: String(msg),
      });
      // continue with next row
    }
  }
}
