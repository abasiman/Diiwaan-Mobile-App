// app/wakaaladformoffline/wakaaladIdMapRepo.ts
import { db } from '../db/db';

type WakaaladIdMapRow = {
  owner_id: number;
  temp_id: number;
  real_id: number;
};

function ensureMapTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS wakaalad_id_map (
      owner_id INTEGER NOT NULL,
      temp_id  INTEGER NOT NULL,
      real_id  INTEGER NOT NULL,
      PRIMARY KEY (owner_id, temp_id)
    );
    `,
    []
  );
}

export function saveWakaaladIdMapping(
  ownerId: number,
  tempId: number,
  realId: number
) {
  if (!ownerId || !tempId || !realId) return;
  ensureMapTable();

  db.runSync(
    `
      INSERT INTO wakaalad_id_map (owner_id, temp_id, real_id)
      VALUES (?, ?, ?)
      ON CONFLICT(owner_id, temp_id) DO UPDATE SET
        real_id = excluded.real_id;
    `,
    [ownerId, tempId, realId]
  );
}

export function getRealWakaaladId(
  ownerId: number,
  tempId: number
): number | null {
  if (!ownerId || !tempId) return null;
  ensureMapTable();

  const rows = db.getAllSync<{ real_id: number }>(
    `
      SELECT real_id
      FROM wakaalad_id_map
      WHERE owner_id = ? AND temp_id = ?
      LIMIT 1;
    `,
    [ownerId, tempId]
  );

  return rows[0]?.real_id ?? null;
}
