// app/db/meProfileDb.ts
import { db } from "../db/db";

export function initMeProfileDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS me_profile (
      id           INTEGER PRIMARY KEY,
      username     TEXT NOT NULL,
      email        TEXT,
      company_name TEXT,
      phone_number TEXT,
      updated_at   TEXT NOT NULL
    );
  `);
}
