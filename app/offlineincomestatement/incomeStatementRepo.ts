// app/db/incomeStatementRepo.ts
import { db } from '../db/db';
import { initIncomeStatementDb } from './incomeStatementDb';

/* ─────────────────── Shared types (same as screen) ─────────────────── */

export type AccountType = 'ar' | 'ap' | 'revenue' | 'cash' | 'inventory';

export type AccountBalance = {
  account_type: AccountType;
  balance_native: number;
  balance_usd: number;
};

export type AccountSummary = {
  per_account: AccountBalance[];

  ar_native: number; ap_native: number; revenue_native: number; cash_native: number; inventory_native: number;
  ar_usd: number;    ap_usd: number;    revenue_usd: number;    cash_usd: number;    inventory_usd: number;

  oil_asset_native: number;
  oil_asset_usd: number;
  cogs_native: number;
  cogs_usd: number;
  net_profit_native: number;
  net_profit_usd: number;

  petrol_fuusto_shorts_native: number;
  petrol_fuusto_shorts_usd: number;

  truck_plate?: string | null;
};

export type AccountTruckPlate = {
  truck_plate: string;
  summary: AccountSummary;
};

export type AccountSummaryResponse = {
  overall: AccountSummary;
  trucks: AccountTruckPlate[];
};

/* ─────────────────── Offline invoice/cash delta type ─────────────────── */
/**
 * This is what offline flows call when they create a sale OFFLINE.
 * We only store what we need to bump Revenue / A/R / Cash / Net.
 */
export type OfflineOilInvoiceDelta = {
  ownerId: number;
  createdAt: string;          // ISO timestamp for range filters
  truckPlate?: string | null; // which truck this belongs to (optional)
  currency: 'USD' | 'SOS';    // sale currency
  totalNative: number;        // total in sale currency
  totalUsd: number;           // same total converted to USD
  saleType: 'invoice' | 'cashsale';
};

/* ─────────────────── Helpers ─────────────────── */

function ensureDb() {
  // existing table(s)
  initIncomeStatementDb();

  // table for offline invoice/cash deltas
  try {
    db.runSync(`
      CREATE TABLE IF NOT EXISTS tenant_income_invoice_deltas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id    INTEGER NOT NULL,
        created_at  TEXT    NOT NULL,
        truck_plate TEXT,
        currency    TEXT    NOT NULL,
        total_native REAL   NOT NULL,
        total_usd    REAL   NOT NULL,
        sale_type    TEXT   NOT NULL DEFAULT 'invoice'
      );
    `);
  } catch {
    // ignore
  }

  // If the table existed before without sale_type, try to add it.
  try {
    db.runSync(`
      ALTER TABLE tenant_income_invoice_deltas
      ADD COLUMN sale_type TEXT NOT NULL DEFAULT 'invoice';
    `);
  } catch {
    // will throw once column exists – safe to ignore
  }
}

type Row = {
  owner_id: number;
  start_iso: string | null;
  end_iso: string | null;
  truck_plate_filter: string;
  label: string | null;
  summary_json: string;
  trucks_json: string | null;
  updated_at: string;
};

/* ─────────────────── Offline delta upsert ─────────────────── */

/**
 * Called by offline flows (invoices, cash sales).
 * We only record a simple delta that can be added on top of the
 * cached server summary.
 */
export function registerOfflineOilInvoiceDelta(delta: OfflineOilInvoiceDelta) {
  const {
    ownerId,
    createdAt,
    truckPlate,
    currency,
    totalNative,
    totalUsd,
    saleType,
  } = delta;
  if (!ownerId || !createdAt || !Number.isFinite(totalUsd)) return;

  ensureDb();

  db.runSync(
    `
    INSERT INTO tenant_income_invoice_deltas
      (owner_id, created_at, truck_plate, currency, total_native, total_usd, sale_type)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `,
    [
      ownerId,
      createdAt,
      (truckPlate || '').trim() || null,
      currency,
      totalNative,
      totalUsd,
      saleType,
    ]
  );
}

/**
 * Sum all offline deltas for this owner / date range / truck filter,
 * split into INVOICE vs CASHSALE parts.
 */
function getOfflineInvoiceDeltaTotal(opts: {
  ownerId: number;
  startIso: string | null;
  endIso: string | null;
  truckPlateFilter: string; // '' = all trucks
}): {
  invoice_native: number;
  invoice_usd: number;
  cash_native: number;
  cash_usd: number;
} {
  const { ownerId, startIso, endIso, truckPlateFilter } = opts;
  if (!ownerId) {
    return {
      invoice_native: 0,
      invoice_usd: 0,
      cash_native: 0,
      cash_usd: 0,
    };
  }

  ensureDb();

  try {
    const whereParts: string[] = ['owner_id = ?'];
    const params: any[] = [ownerId];

    if (startIso) {
      whereParts.push('created_at >= ?');
      params.push(startIso);
    }
    if (endIso) {
      whereParts.push('created_at <= ?');
      params.push(endIso);
    }
    if (truckPlateFilter) {
      // only invoices/sales for this plate
      whereParts.push('(truck_plate = ?)');
      params.push(truckPlateFilter);
    }

    const whereClause = whereParts.join(' AND ');

    const rows = db.getAllSync<{
      invoice_native: number;
      invoice_usd: number;
      cash_native: number;
      cash_usd: number;
    }>(
      `
      SELECT
        COALESCE(SUM(CASE WHEN sale_type = 'invoice'  THEN total_native ELSE 0 END), 0) AS invoice_native,
        COALESCE(SUM(CASE WHEN sale_type = 'invoice'  THEN total_usd    ELSE 0 END), 0) AS invoice_usd,
        COALESCE(SUM(CASE WHEN sale_type = 'cashsale' THEN total_native ELSE 0 END), 0) AS cash_native,
        COALESCE(SUM(CASE WHEN sale_type = 'cashsale' THEN total_usd    ELSE 0 END), 0) AS cash_usd
      FROM tenant_income_invoice_deltas
      WHERE ${whereClause};
    `,
      params
    );

    const row = rows[0];
    if (!row) {
      return {
        invoice_native: 0,
        invoice_usd: 0,
        cash_native: 0,
        cash_usd: 0,
      };
    }

    return {
      invoice_native: row.invoice_native || 0,
      invoice_usd: row.invoice_usd || 0,
      cash_native: row.cash_native || 0,
      cash_usd: row.cash_usd || 0,
    };
  } catch {
    // if table missing or query fails, just ignore offline deltas
    return {
      invoice_native: 0,
      invoice_usd: 0,
      cash_native: 0,
      cash_usd: 0,
    };
  }
}

/* ─────────────────── Summary helpers ─────────────────── */

function makeEmptySummary(truckPlate?: string | null): AccountSummary {
  const zeroAcc = (type: AccountType): AccountBalance => ({
    account_type: type,
    balance_native: 0,
    balance_usd: 0,
  });

  return {
    per_account: [
      zeroAcc('ar'),
      zeroAcc('ap'),
      zeroAcc('revenue'),
      zeroAcc('cash'),
      zeroAcc('inventory'),
    ],

    ar_native: 0,  ap_native: 0,  revenue_native: 0,  cash_native: 0,  inventory_native: 0,
    ar_usd: 0,     ap_usd: 0,     revenue_usd: 0,     cash_usd: 0,     inventory_usd: 0,

    oil_asset_native: 0,
    oil_asset_usd: 0,
    cogs_native: 0,
    cogs_usd: 0,
    net_profit_native: 0,
    net_profit_usd: 0,

    petrol_fuusto_shorts_native: 0,
    petrol_fuusto_shorts_usd: 0,

    truck_plate: truckPlate ?? null,
  };
}

/**
 * Apply an offline INVOICE delta to a summary.
 *
 * Assumption (for invoice-type sales):
 *   - Increase REVENUE by +delta
 *   - Increase A/R by +delta (invoice, not cash)
 *   - Increase NET PROFIT by +delta
 *
 * We **do not** touch COGS / inventory here – those come from the server.
 */
function applyInvoiceDeltaToSummary(
  base: AccountSummary | null,
  deltaNative: number,
  deltaUsd: number
): AccountSummary {
  if (!deltaNative && !deltaUsd) {
    return base ?? makeEmptySummary();
  }

  const s = base ? { ...base, per_account: [...base.per_account] } : makeEmptySummary();

  // Update scalar fields
  s.revenue_native += deltaNative;
  s.revenue_usd += deltaUsd;

  s.ar_native += deltaNative;
  s.ar_usd += deltaUsd;

  s.net_profit_native += deltaNative;
  s.net_profit_usd += deltaUsd;

  // Update per_account entries for 'revenue' and 'ar'
  const ensureAcc = (type: AccountType) => {
    let acc = s.per_account.find((a) => a.account_type === type);
    if (!acc) {
      acc = { account_type: type, balance_native: 0, balance_usd: 0 };
      s.per_account.push(acc);
    }
    return acc;
  };

  const arAcc = ensureAcc('ar');
  arAcc.balance_native += deltaNative;
  arAcc.balance_usd += deltaUsd;

  const revAcc = ensureAcc('revenue');
  revAcc.balance_native += deltaNative;
  revAcc.balance_usd += deltaUsd;

  return s;
}

/**
 * Apply an offline CASHSALE delta to a summary.
 *
 * Assumption (for cash sales):
 *   - Increase REVENUE by +delta
 *   - Increase CASH by +delta
 *   - Increase NET PROFIT by +delta
 *
 * Again, we do **not** touch COGS / inventory here.
 */
function applyCashDeltaToSummary(
  base: AccountSummary | null,
  deltaNative: number,
  deltaUsd: number
): AccountSummary {
  if (!deltaNative && !deltaUsd) {
    return base ?? makeEmptySummary();
  }

  const s = base ? { ...base, per_account: [...base.per_account] } : makeEmptySummary();

  // Revenue + net profit
  s.revenue_native += deltaNative;
  s.revenue_usd += deltaUsd;

  s.net_profit_native += deltaNative;
  s.net_profit_usd += deltaUsd;

  // Cash account
  s.cash_native += deltaNative;
  s.cash_usd += deltaUsd;

  const ensureAcc = (type: AccountType) => {
    let acc = s.per_account.find((a) => a.account_type === type);
    if (!acc) {
      acc = { account_type: type, balance_native: 0, balance_usd: 0 };
      s.per_account.push(acc);
    }
    return acc;
  };

  const cashAcc = ensureAcc('cash');
  cashAcc.balance_native += deltaNative;
  cashAcc.balance_usd += deltaUsd;

  const revAcc = ensureAcc('revenue');
  revAcc.balance_native += deltaNative;
  revAcc.balance_usd += deltaUsd;

  return s;
}

/* ─────────────────── Upsert from server ─────────────────── */

/**
 * Cache a /diiwaantenantsaccounts/summary response for a specific
 * (owner_id, start, end, truckPlate) key.
 */
export function upsertIncomeStatementFromServer(opts: {
  ownerId: number;
  start?: string | null;
  end?: string | null;
  truckPlate?: string | null;
  label?: string;
  response: AccountSummaryResponse;
}) {
  const { ownerId, start, end, truckPlate, label, response } = opts;
  if (!ownerId || !response?.overall) return;

  ensureDb();

  const startIso = start ?? null;
  const endIso = end ?? null;
  const plateKey = (truckPlate || '').trim(); // '' = All Trucks
  const now = new Date().toISOString();

  db.runSync(
    `
    INSERT INTO tenant_income_statements (
      owner_id,
      start_iso,
      end_iso,
      truck_plate_filter,
      label,
      summary_json,
      trucks_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, start_iso, end_iso, truck_plate_filter)
    DO UPDATE SET
      label        = excluded.label,
      summary_json = excluded.summary_json,
      trucks_json  = excluded.trucks_json,
      updated_at   = excluded.updated_at;
  `,
    [
      ownerId,
      startIso,
      endIso,
      plateKey,
      label ?? null,
      JSON.stringify(response.overall),
      JSON.stringify(response.trucks || []),
      now,
    ]
  );
}

/* ─────────────────── Local query ─────────────────── */

/**
 * Retrieve a cached statement for (ownerId, start, end, truckPlate),
 * and then layer on top any OFFLINE deltas (invoice + cashsale) that
 * were recorded for the same range.
 *
 * If nothing is found, returns { overall: null, trucks: [] } unless
 * there are offline deltas – in that case, overall is synthesized
 * purely from those deltas.
 */
export function getIncomeStatementLocal(opts: {
  ownerId: number;
  start?: string | null;
  end?: string | null;
  truckPlate?: string | null;
}): { overall: AccountSummary | null; trucks: AccountTruckPlate[] } {
  const { ownerId, start, end, truckPlate } = opts;
  if (!ownerId) return { overall: null, trucks: [] };

  ensureDb();

  const startIso = start ?? null;
  const endIso = end ?? null;
  const plateKey = (truckPlate || '').trim(); // '' = All Trucks

  // 1) Build WHERE clause correctly for NULL vs non-NULL
  const where: string[] = ['owner_id = ?'];
  const params: any[] = [ownerId];

  if (startIso === null) {
    where.push('start_iso IS NULL');
  } else {
    where.push('start_iso = ?');
    params.push(startIso);
  }

  if (endIso === null) {
    where.push('end_iso IS NULL');
  } else {
    where.push('end_iso = ?');
    params.push(endIso);
  }

  where.push('truck_plate_filter = ?');
  params.push(plateKey);

  const rows = db.getAllSync<Row>(
    `
    SELECT *
    FROM tenant_income_statements
    WHERE ${where.join(' AND ')}
    LIMIT 1;
  `,
    params
  );

  const row = rows[0];

  let overall: AccountSummary | null = null;
  let trucks: AccountTruckPlate[] = [];

  if (row) {
    try {
      overall = JSON.parse(row.summary_json);
    } catch {
      overall = null;
    }
    try {
      trucks = row.trucks_json ? JSON.parse(row.trucks_json) : [];
    } catch {
      trucks = [];
    }
  }

  // 2) Sum offline deltas (invoice + cash) for this owner/range/plate
  const offlineDelta = getOfflineInvoiceDeltaTotal({
    ownerId,
    startIso,
    endIso,
    truckPlateFilter: plateKey,
  });

  // 3) Apply invoice deltas (A/R + Revenue + Net)
  if (
    offlineDelta.invoice_native !== 0 ||
    offlineDelta.invoice_usd !== 0
  ) {
    overall = applyInvoiceDeltaToSummary(
      overall,
      offlineDelta.invoice_native,
      offlineDelta.invoice_usd
    );
  }

  //    Apply cash deltas (Cash + Revenue + Net)
  if (offlineDelta.cash_native !== 0 || offlineDelta.cash_usd !== 0) {
    overall = applyCashDeltaToSummary(
      overall,
      offlineDelta.cash_native,
      offlineDelta.cash_usd
    );
  }

  if (overall && plateKey) {
    overall.truck_plate = plateKey;
  }

  return { overall, trucks };
}
