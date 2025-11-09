// app/WakaaladMovementOffline/wakaaladMovementScreenDb.ts
import { db } from '../db/db';

export const WAKAALAD_MOVEMENT_SCREEN_TABLE = 'wakaalad_movement_screen';
export const WAKAALAD_MOVEMENT_SCREEN_META_TABLE = 'wakaalad_movement_screen_meta';

let _initialized = false;

export function initWakaaladMovementScreenDb() {
  if (_initialized) return;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${WAKAALAD_MOVEMENT_SCREEN_TABLE} (
      id              INTEGER PRIMARY KEY,
      owner_id        INTEGER NOT NULL,
      movement_index  INTEGER NOT NULL,
      data_json       TEXT    NOT NULL,
      updated_at      INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_wm_screen_owner
      ON ${WAKAALAD_MOVEMENT_SCREEN_TABLE}(owner_id);
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${WAKAALAD_MOVEMENT_SCREEN_META_TABLE} (
      owner_id     INTEGER PRIMARY KEY NOT NULL,
      last_sync_ts INTEGER
    );
  `);

  _initialized = true;
}
