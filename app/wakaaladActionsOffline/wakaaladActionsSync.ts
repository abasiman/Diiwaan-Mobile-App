// app/WakaaladOffline/wakaaladActionsSync.ts
import api from '@/services/api';
import type { WakaaladActionQueued } from './wakaaladActionsOfflineRepo';
import {
    clearQueuedWakaaladAction,
    getQueuedWakaaladActions,
    recordWakaaladActionQueueError,
} from './wakaaladActionsOfflineRepo';

/**
 * Push queued wakaalad edit/delete/restock actions when online.
 */
export async function syncPendingWakaaladActions(
  token: string,
  ownerId: number
): Promise<void> {
  if (!token || !ownerId) return;

  const queued: WakaaladActionQueued[] = getQueuedWakaaladActions(ownerId);
  if (!queued.length) return;

  const headers = { Authorization: `Bearer ${token}` };

  for (const row of queued) {
    const { id, wakaalad_id, action_type, payload } = row as any;

    let body: any = {};
    try {
      body = payload ? JSON.parse(payload) : {};
    } catch {
      body = {};
    }

    try {
      if (action_type === 'edit') {
        await api.patch(`/wakaalad_diiwaan/${wakaalad_id}`, body, { headers });
      } else if (action_type === 'delete') {
        await api.delete(`/wakaalad_diiwaan/${wakaalad_id}`, { headers });
      } else if (action_type === 'restock') {
        await api.post(`/wakaalad_diiwaan/${wakaalad_id}/restock`, body, { headers });
      } else {
        // unknown action type → drop
        clearQueuedWakaaladAction(ownerId, id);
        continue;
      }

      // success → remove from queue
      clearQueuedWakaaladAction(ownerId, id);
    } catch (e: any) {
      const status = e?.response?.status;
      const message = String(
        e?.response?.data?.detail || e?.message || 'Failed to sync wakaalad action.'
      );

      recordWakaaladActionQueueError(ownerId, id, message);

      // no status or 5xx → stop & retry later
      if (!status || status >= 500) {
        break;
      }

      // 4xx → drop this bad record and continue
      clearQueuedWakaaladAction(ownerId, id);
    }
  }
}
