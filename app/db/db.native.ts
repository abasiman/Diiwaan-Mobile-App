// app/db/db.native.ts
import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('diiwaan.db');

export function initDb() {
  db.execSync(`
    PRAGMA foreign_keys = ON;

    -- Tenants (very minimal mirror of DiiwaanUser just for owner_id context)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      company_name TEXT,
      username TEXT,
      role TEXT,
      status TEXT,
      updated_at TEXT
    );

    -- Customers (mirror of Macaamiil)
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      status TEXT NOT NULL,
      amount_due REAL NOT NULL DEFAULT 0,
      amount_due_usd REAL DEFAULT 0,
      amount_due_native REAL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}
