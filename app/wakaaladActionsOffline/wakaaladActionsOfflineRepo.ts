// app/WakaaladOffline/wakaaladActionsOfflineRepo.ts
import {
    WakaaladActionQueueRow,
    WakaaladActionType,
    deleteWakaaladActionRow,
    insertWakaaladActionRow,
    listWakaaladActionRows,
    setWakaaladActionRowError,
} from './wakaaladActionsOfflineDb';

export type WakaaladEditPayload = {
  wakaalad_name?: string;
  date?: string;
  set_total_liters?: number;
};

export type WakaaladDeletePayload = Record<string, never>;

export type WakaaladRestockPayload = {
  from_oil_id: number;
  liters: number;
  date?: string;
};

export type WakaaladActionPayload =
  | WakaaladEditPayload
  | WakaaladDeletePayload
  | WakaaladRestockPayload;

export type WakaaladActionQueued = {
  id: number;
  owner_id: number;
  wakaalad_id: number;
  action_type: WakaaladActionType;
  payload: WakaaladActionPayload;
  created_at: string;
  last_error: string | null;
};

/** Low–level: queue any wakaalad action for later sync. */
export function queueWakaaladActionForSync(
  ownerId: number,
  wakaaladId: number,
  actionType: WakaaladActionType,
  payload: WakaaladActionPayload
): void {
  if (!ownerId || !wakaaladId) return;
  const payloadStr = JSON.stringify(payload ?? {});
  insertWakaaladActionRow({
    ownerId,
    wakaaladId,
    actionType,
    payload: payloadStr,
  });
}

/** Convenience: queue EDIT action. */
export function queueWakaaladEditForSync(
  ownerId: number,
  wakaaladId: number,
  payload: WakaaladEditPayload
): void {
  queueWakaaladActionForSync(ownerId, wakaaladId, 'edit', payload);
}

/** Convenience: queue DELETE action. */
export function queueWakaaladDeleteForSync(
  ownerId: number,
  wakaaladId: number
): void {
  queueWakaaladActionForSync(ownerId, wakaaladId, 'delete', {});
}

/** Convenience: queue RESTOCK action. */
export function queueWakaaladRestockForSync(
  ownerId: number,
  wakaaladId: number,
  payload: WakaaladRestockPayload
): void {
  queueWakaaladActionForSync(ownerId, wakaaladId, 'restock', payload);
}

/** Used by sync worker – returns parsed payload objects. */
export function getQueuedWakaaladActions(ownerId: number): WakaaladActionQueued[] {
  if (!ownerId) return [];
  const rows = listWakaaladActionRows(ownerId) as WakaaladActionQueueRow[];

  return rows.map((row) => {
    let parsed: WakaaladActionPayload = {};
    try {
      parsed = (row as any).payload
        ? JSON.parse((row as any).payload)
        : {};
    } catch {
      parsed = {};
    }

    return {
      id: row.id,
      owner_id: row.owner_id,
      wakaalad_id: row.wakaalad_id,
      action_type: row.action_type,
      payload: parsed,
      created_at: row.created_at,
      last_error: row.last_error ?? null,
    };
  });
}

export function clearQueuedWakaaladAction(ownerId: number, id: number): void {
  if (!ownerId || !id) return;
  deleteWakaaladActionRow(ownerId, id);
}

export function recordWakaaladActionQueueError(
  ownerId: number,
  id: number,
  message: string
): void {
  if (!ownerId || !id) return;
  setWakaaladActionRowError(ownerId, id, message);
}
