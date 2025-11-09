// app/WakaaladOffline/wakaaladActionsOfflineDb.ts
import { db } from '../db/db';

export type WakaaladActionType = 'edit' | 'delete' | 'restock';

export type WakaaladActionQueueRow = {
  id: number; // local queue row id
  owner_id: number;
  wakaalad_id: number;
  action_type: WakaaladActionType;
  payload: string; // JSON string
  created_at: string;
  last_error: string | null;
};

export function initWakaaladActionsOfflineDb() {
  ensureTable();
}

function ensureTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS wakaalad_actions_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL,
      wakaalad_id  INTEGER NOT NULL,
      action_type  TEXT    NOT NULL,
      payload      TEXT    NOT NULL,
      created_at   TEXT    NOT NULL,
      last_error   TEXT
    );
    `,
    []
  );

  db.runSync(
    `
    CREATE INDEX IF NOT EXISTS idx_wakaalad_actions_owner
      ON wakaalad_actions_queue(owner_id);
    `,
    []
  );
}

export function insertWakaaladActionRow(args: {
  ownerId: number;
  wakaaladId: number;
  actionType: WakaaladActionType;
  payload: string;
}): void {
  ensureTable();
  const now = new Date().toISOString();
  db.runSync(
    `
    INSERT INTO wakaalad_actions_queue (
      owner_id,
      wakaalad_id,
      action_type,
      payload,
      created_at,
      last_error
    )
    VALUES (?, ?, ?, ?, ?, NULL);
    `,
    [args.ownerId, args.wakaaladId, args.actionType, args.payload, now]
  );
}

export function listWakaaladActionRows(ownerId: number): WakaaladActionQueueRow[] {
  ensureTable();
  return db.getAllSync<WakaaladActionQueueRow>(
    `
    SELECT
      id,
      owner_id,
      wakaalad_id,
      action_type,
      payload,
      created_at,
      last_error
    FROM wakaalad_actions_queue
    WHERE owner_id = ?
    ORDER BY id ASC;
    `,
    [ownerId]
  );
}

export function deleteWakaaladActionRow(ownerId: number, id: number): void {
  ensureTable();
  db.runSync(
    `DELETE FROM wakaalad_actions_queue WHERE owner_id = ? AND id = ?;`,
    [ownerId, id]
  );
}

export function setWakaaladActionRowError(
  ownerId: number,
  id: number,
  message: string
): void {
  ensureTable();
  db.runSync(
    `
    UPDATE wakaalad_actions_queue
    SET last_error = ?
    WHERE owner_id = ? AND id = ?;
    `,
    [message, ownerId, id]
  );
}
