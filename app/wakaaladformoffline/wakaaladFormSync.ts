// app/dbform/wakaaladFormSync.ts
import api from '@/services/api';
import {
  getPendingWakaaladForms,
  updateWakaaladFormStatus,
  type WakaaladFormCreatePayload,
} from './wakaaladFormRepo';

import { saveWakaaladIdMapping } from '../wakaaladformoffline/wakaaladIdMapRepo';

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

      // 🔹 If this wakaalad was created offline with a temp (negative) id,
      //     persist the mapping temp_id -> real_id for this owner.
      if (remoteId && row.temp_wakaalad_id && row.temp_wakaalad_id < 0) {
        saveWakaaladIdMapping(ownerId, row.temp_wakaalad_id, remoteId);
      }

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
