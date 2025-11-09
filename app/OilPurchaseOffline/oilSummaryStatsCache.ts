// app/OilPurchaseOffline/oilSummaryStatsCache.ts
import { db } from '../db/db';
import { initVendorPaymentDb } from './vendorPaymentDb';

const OIL_SUMMARY_CACHE_TABLE = 'oil_summary_cache';
const WAKAALAD_STATS_CACHE_TABLE = 'wakaalad_stats_cache';

let _tablesInit = false;

function ensureTables() {
  if (_tablesInit) return;
  initVendorPaymentDb();

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${OIL_SUMMARY_CACHE_TABLE} (
      owner_id   INTEGER PRIMARY KEY NOT NULL,
      data_json  TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${WAKAALAD_STATS_CACHE_TABLE} (
      owner_id   INTEGER PRIMARY KEY NOT NULL,
      data_json  TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  _tablesInit = true;
}

export async function saveOilSummaryCache(
  ownerId: number,
  data: any
): Promise<void> {
  if (!ownerId) return;
  ensureTables();
  const ts = Date.now();
  db.runSync(
    `
      INSERT OR REPLACE INTO ${OIL_SUMMARY_CACHE_TABLE} (
        owner_id, data_json, updated_at
      ) VALUES (?, ?, ?);
    `,
    [ownerId, JSON.stringify(data), ts]
  );
}

export async function getOilSummaryCache(
  ownerId: number
): Promise<any | null> {
  if (!ownerId) return null;
  ensureTables();
  const rows = db.getAllSync<{ data_json: string }>(
    `
      SELECT data_json
      FROM ${OIL_SUMMARY_CACHE_TABLE}
      WHERE owner_id = ?
      LIMIT 1;
    `,
    [ownerId]
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].data_json);
  } catch (e) {
    console.warn('[oilSummaryStatsCache] parse oil summary failed', e);
    return null;
  }
}

export async function saveWakaaladStatsCache(
  ownerId: number,
  data: any
): Promise<void> {
  if (!ownerId) return;
  ensureTables();
  const ts = Date.now();
  db.runSync(
    `
      INSERT OR REPLACE INTO ${WAKAALAD_STATS_CACHE_TABLE} (
        owner_id, data_json, updated_at
      ) VALUES (?, ?, ?);
    `,
    [ownerId, JSON.stringify(data), ts]
  );
}

export async function getWakaaladStatsCache(
  ownerId: number
): Promise<any | null> {
  if (!ownerId) return null;
  ensureTables();
  const rows = db.getAllSync<{ data_json: string }>(
    `
      SELECT data_json
      FROM ${WAKAALAD_STATS_CACHE_TABLE}
      WHERE owner_id = ?
      LIMIT 1;
    `,
    [ownerId]
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].data_json);
  } catch (e) {
    console.warn('[oilSummaryStatsCache] parse wakaalad stats failed', e);
    return null;
  }
}
