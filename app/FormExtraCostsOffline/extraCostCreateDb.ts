// /extraCostCreateDb.ts
import { db } from '../db/db';

export type ExtraCostCreateRow = {
  id: number; // local queue row id
  owner_id: number;
  anchor_id: number; // oil or lot id (same anchor used in /diiwaanoil/{anchor_id}/extra-costs)
  category: string;
  amount_usd: number;
  currency_key: string | null;
  exchange_to_usd: number | null;
  per_barrel: number | null;
  qty_barrel: number | null;
  created_at: string;
  last_error: string | null;
};

export function initExtraCostCreateDb() {
  ensureTable();
}

function ensureTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS oil_extra_costs_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id        INTEGER NOT NULL,
      anchor_id       INTEGER NOT NULL,
      category        TEXT    NOT NULL,
      amount_usd      REAL    NOT NULL,
      currency_key    TEXT,
      exchange_to_usd REAL,
      per_barrel      REAL,
      qty_barrel      REAL,
      created_at      TEXT    NOT NULL,
      last_error      TEXT
    );
    `,
    []
  );

  db.runSync(
    `CREATE INDEX IF NOT EXISTS idx_oil_extra_costs_queue_owner ON oil_extra_costs_queue(owner_id);`,
    []
  );
}

export function insertQueuedExtraCost(args: {
  ownerId: number;
  anchorId: number;
  category: string;
  amountUsd: number;
  currencyKey?: string | null;
  exchangeToUsd?: number | null;
  perBarrel?: number | null;
  qtyBarrel?: number | null;
}): void {
  ensureTable();
  const now = new Date().toISOString();
  db.runSync(
    `
    INSERT INTO oil_extra_costs_queue (
      owner_id, anchor_id,
      category, amount_usd,
      currency_key, exchange_to_usd,
      per_barrel, qty_barrel,
      created_at, last_error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);
    `,
    [
      args.ownerId,
      args.anchorId,
      args.category,
      args.amountUsd,
      args.currencyKey ?? null,
      args.exchangeToUsd ?? null,
      args.perBarrel ?? null,
      args.qtyBarrel ?? null,
      now,
    ]
  );
}

export function listQueuedExtraCosts(ownerId: number): ExtraCostCreateRow[] {
  ensureTable();
  return db.getAllSync<ExtraCostCreateRow>(
    `
    SELECT
      id,
      owner_id,
      anchor_id,
      category,
      amount_usd,
      currency_key,
      exchange_to_usd,
      per_barrel,
      qty_barrel,
      created_at,
      last_error
    FROM oil_extra_costs_queue
    WHERE owner_id = ?
    ORDER BY id ASC;
    `,
    [ownerId]
  );
}

export function deleteQueuedExtraCost(ownerId: number, id: number): void {
  ensureTable();
  db.runSync(`DELETE FROM oil_extra_costs_queue WHERE owner_id = ? AND id = ?`, [ownerId, id]);
}

export function setQueuedExtraCostError(ownerId: number, id: number, message: string): void {
  ensureTable();
  db.runSync(
    `
    UPDATE oil_extra_costs_queue
    SET last_error = ?
    WHERE owner_id = ? AND id = ?;
    `,
    [message, ownerId, id]
  );
}
