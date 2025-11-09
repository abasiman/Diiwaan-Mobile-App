// app/db/meProfileRepo.ts
import { db } from '../db/db';
import { initMeProfileDb } from './meProfileDb';

export type MeProfile = {
  id: number;
  username: string;
  email: string | null;
  company_name: string | null;
  phone_number: string | null;
};

function ensureDb() {
  initMeProfileDb();
}

export function upsertMeFromServer(me: MeProfile) {
  ensureDb();
  const now = new Date().toISOString();

  db.runSync(
    `
    INSERT INTO me_profile (id, username, email, company_name, phone_number, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username     = excluded.username,
      email        = excluded.email,
      company_name = excluded.company_name,
      phone_number = excluded.phone_number,
      updated_at   = excluded.updated_at;
  `,
    [
      me.id,
      me.username,
      me.email,
      me.company_name,
      me.phone_number,
      now,
    ]
  );
}

export function getMeLocal(userId: number): MeProfile | null {
  if (!userId) return null;
  ensureDb();

  const rows = db.getAllSync<MeProfile>(
    `
    SELECT id, username, email, company_name, phone_number
    FROM me_profile
    WHERE id = ?
    LIMIT 1;
  `,
    [userId]
  );

  return rows[0] ?? null;
}
