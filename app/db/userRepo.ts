// db/userRepo.ts
import { db } from './db';

export type LocalUser = {
  id: number;
  username: string;
  company_name?: string | null;
  role?: string | null;
  status?: string | null;
};

/**
 * Ensure the logged-in tenant exists in the local SQLite `users` table.
 * Call this after login / refreshProfile.
 */
export function upsertLocalUser(user: LocalUser) {
  db.runSync(
    `
    INSERT INTO users (id, company_name, username, role, status, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      company_name = excluded.company_name,
      username     = excluded.username,
      role         = excluded.role,
      status       = excluded.status,
      updated_at   = excluded.updated_at;
  `,
    [
      user.id,
      user.company_name ?? null,
      user.username,
      user.role ?? null,
      user.status ?? null,
    ]
  );
}
