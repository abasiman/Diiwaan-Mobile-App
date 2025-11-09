// app/WakaaladMovementOffline/wakaaladMovementScreenRepo.ts
import { db } from '../db/db';
import {
    initWakaaladMovementScreenDb,
    WAKAALAD_MOVEMENT_SCREEN_META_TABLE,
    WAKAALAD_MOVEMENT_SCREEN_TABLE,
} from './wakaaladMovementScreenDb';

/** Mirror types from wakaaladmovement.tsx */

export type OilType = 'diesel' | 'petrol' | 'kerosene' | 'jet' | 'hfo' | 'crude' | 'lube';
export type MovementType = 'restock' | 'adjustment_in' | 'adjustment_out' | 'sale';

export type WakaaladMovementRead = {
  id: number;
  owner_id: number;
  wakaalad_id: number;
  oil_id?: number | null;

  wakaalad_name: string;
  oil_type: OilType | string;
  movement_type: MovementType | string;
  liters: number;
  note?: string | null;

  movement_date: string; // ISO
  created_at: string;    // ISO
};

/** ---------- Save / load list for a given owner ---------- */

export async function saveWakaaladMovementsForOwner(
  ownerId: number,
  items: WakaaladMovementRead[]
): Promise<void> {
  if (!ownerId) {
    console.warn('[wm-screen] saveWakaaladMovementsForOwner called with no ownerId');
    return;
  }
  initWakaaladMovementScreenDb();

  const now = Date.now();

  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM ${WAKAALAD_MOVEMENT_SCREEN_TABLE} WHERE owner_id = ?`, [ownerId]);

    items.forEach((item, index) => {
      const json = JSON.stringify(item);
      db.runSync(
        `
        INSERT INTO ${WAKAALAD_MOVEMENT_SCREEN_TABLE} (
          owner_id,
          movement_index,
          data_json,
          updated_at
        ) VALUES (?, ?, ?, ?);
      `,
        [ownerId, index, json, now]
      );
    });

    db.runSync(
      `
      INSERT OR REPLACE INTO ${WAKAALAD_MOVEMENT_SCREEN_META_TABLE} (
        owner_id,
        last_sync_ts
      ) VALUES (?, ?);
    `,
      [ownerId, now]
    );
  });

  console.log(`[wm-screen] Saved ${items.length} items for owner=${ownerId} at ts=${now}`);
}

export async function getWakaaladMovementsForOwner(
  ownerId: number
): Promise<WakaaladMovementRead[]> {
  if (!ownerId) {
    console.warn('[wm-screen] getWakaaladMovementsForOwner called with no ownerId');
    return [];
  }
  initWakaaladMovementScreenDb();

  const rows = db.getAllSync<{ data_json: string }>(
    `
    SELECT data_json
    FROM ${WAKAALAD_MOVEMENT_SCREEN_TABLE}
    WHERE owner_id = ?
    ORDER BY movement_index ASC;
  `,
    [ownerId]
  );

  console.log(`[wm-screen] Loaded ${rows.length} cached rows for owner=${ownerId}`);

  const out: WakaaladMovementRead[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data_json);
      out.push(parsed);
    } catch (err) {
      console.warn('[wm-screen] Failed to parse cached row', err);
    }
  }

  console.log(`[wm-screen] Parsed ${out.length} cached items for owner=${ownerId}`);
  return out;
}

/** Last sync timestamp helpers */

export async function getWakaaladMovementsLastSync(
  ownerId: number
): Promise<number | null> {
  if (!ownerId) return null;
  initWakaaladMovementScreenDb();

  const rows = db.getAllSync<{ last_sync_ts: number }>(
    `
    SELECT last_sync_ts
    FROM ${WAKAALAD_MOVEMENT_SCREEN_META_TABLE}
    WHERE owner_id = ?
    LIMIT 1;
  `,
    [ownerId]
  );

  if (!rows.length) return null;
  const ts = Number(rows[0].last_sync_ts);
  return Number.isFinite(ts) ? ts : null;
}

export async function setWakaaladMovementsLastSync(
  ownerId: number,
  ts: number
): Promise<void> {
  if (!ownerId) return;
  initWakaaladMovementScreenDb();

  db.runSync(
    `
    INSERT OR REPLACE INTO ${WAKAALAD_MOVEMENT_SCREEN_META_TABLE} (
      owner_id,
      last_sync_ts
    ) VALUES (?, ?);
  `,
    [ownerId, ts]
  );
}

/** Clear cache for owner (on logout, etc.) */

export async function clearWakaaladMovementsForOwner(ownerId: number): Promise<void> {
  if (!ownerId) return;
  initWakaaladMovementScreenDb();

  db.withTransactionSync(() => {
    db.runSync(
      `DELETE FROM ${WAKAALAD_MOVEMENT_SCREEN_TABLE} WHERE owner_id = ?`,
      [ownerId]
    );
    db.runSync(
      `DELETE FROM ${WAKAALAD_MOVEMENT_SCREEN_META_TABLE} WHERE owner_id = ?`,
      [ownerId]
    );
  });
}

/** Mark cache stale without deleting rows. */
export async function markWakaaladMovementsStale(ownerId: number): Promise<void> {
  if (!ownerId) return;
  await setWakaaladMovementsLastSync(ownerId, 0);
}
