// app/WakaaladOffline/oilSellOptionsDb.ts
import { db } from '../db/db';

export function initOilSellOptionsDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS oilselloptions_all (
      id                  INTEGER PRIMARY KEY,      -- sell-option id
      owner_id            INTEGER NOT NULL,

      oil_id              INTEGER NOT NULL,
      lot_id              INTEGER,
      oil_type            TEXT NOT NULL,
      truck_plate         TEXT,

      in_stock_l          REAL NOT NULL DEFAULT 0,
      in_stock_fuusto     REAL NOT NULL DEFAULT 0,
      in_stock_caag       REAL NOT NULL DEFAULT 0,

      currency            TEXT,
      liter_price         REAL,
      fuusto_price        REAL,
      caag_price          REAL,

      created_at          TEXT,
      updated_at          TEXT,

      dirty               INTEGER NOT NULL DEFAULT 0,  -- 1 = needs sync (if you ever push up)
      deleted             INTEGER NOT NULL DEFAULT 0   -- soft delete flag
    );

    CREATE INDEX IF NOT EXISTS idx_oilselloptions_owner
      ON oilselloptions_all (owner_id, deleted);

    CREATE INDEX IF NOT EXISTS idx_oilselloptions_oil
      ON oilselloptions_all (owner_id, oil_id, deleted);

    CREATE INDEX IF NOT EXISTS idx_oilselloptions_created
      ON oilselloptions_all (owner_id, datetime(created_at) DESC);
  `);
}
