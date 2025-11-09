// app/db/incomeStatementDb.ts
import { db } from "../db/db";

export function initIncomeStatementDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tenant_income_statements (
      owner_id             INTEGER NOT NULL,
      start_iso            TEXT,          -- may be NULL for as-of only
      end_iso              TEXT,          -- may be NULL in theory, usually set
      truck_plate_filter   TEXT NOT NULL, -- '' for "All Trucks"

      label                TEXT,          -- e.g. "Year 2025", "Month 2025-03"
      summary_json         TEXT NOT NULL, -- JSON.stringify(AccountSummary)
      trucks_json          TEXT,          -- JSON.stringify(AccountTruckPlate[])
      updated_at           TEXT NOT NULL,

      PRIMARY KEY (owner_id, start_iso, end_iso, truck_plate_filter)
    );
  `);
}
