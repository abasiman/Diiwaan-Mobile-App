// app/db/oilSalesPageRepo.ts
import { db } from './db';
import { initOilSalesPageDb } from './oilSalesPageDb';

/* ----------------------------- Shared types (match page/backend) ----------------------------- */

export type SaleUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';
export type SaleType = 'invoice' | 'cashsale';

export type OilSaleRead = {
  id: number;
  oil_id: number;
  owner_id: number;

  customer?: string | null;
  customer_contact?: string | null;

  sale_type: SaleType;
  oil_type: string;

  truck_plate?: string | null;
  unit_type: SaleUnitType;
  unit_qty: number;
  unit_capacity_l?: number | null;
  liters_sold: number;

  currency: string;
  price_per_l?: number | null;
  price_per_unit_type?: number | null;
  subtotal_native?: number | null;
  discount_native?: number | null;
  tax_native?: number | null;
  total_native?: number | null;
  fx_rate_to_usd?: number | null;
  total_usd?: number | null;

  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method?: 'cash' | 'bank' | 'mobile' | 'credit' | null;
  paid_native?: number | null;
  note?: string | null;

  created_at: string;
  updated_at: string;

  truck_type?: string | null;
  truck_plate_extra?: string | null;
};

/**
 * Minimal shape of /oilsale/summary we care about.
 * We only persist items; totals are recomputed in the UI if needed.
 */
export type OilSaleSummaryResponse = {
  items: OilSaleRead[];
  totals?: any;
  offset?: number;
  limit?: number;
  returned?: number;
  has_more?: boolean;
};

/* ----------------------------- Local row type ----------------------------- */

type OilSaleRow = OilSaleRead & {
  dirty: number;
  deleted: number;
};

/* ----------------------------- Helpers ----------------------------- */

function ensureDb() {
  // ensure table exists before we touch it
  initOilSalesPageDb();
}

/* ----------------------------- Upsert from server ----------------------------- */

/**
 * Persist items from /oilsale/summary into local oilsales_all table.
 * We only store the raw rows; derived totals are computed in JS.
 */
export function upsertOilSalesFromServer(
  report: OilSaleSummaryResponse,
  ownerId: number
) {
  const items = report.items || [];
  if (!items.length || !ownerId) return;

  ensureDb();

  db.withTransactionSync(() => {
    for (const s of items) {
      db.runSync(
        `
        INSERT INTO oilsales_all (
          id, owner_id,
          customer, customer_contact,
          sale_type,
          oil_id, oil_type,
          truck_plate, truck_type, truck_plate_extra,
          unit_type, unit_qty, unit_capacity_l, liters_sold,
          currency, price_per_l, price_per_unit_type,
          subtotal_native, discount_native, tax_native, total_native,
          fx_rate_to_usd, total_usd,
          payment_status, payment_method, paid_native, note,
          created_at, updated_at,
          dirty, deleted
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          0, 0
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id            = excluded.owner_id,
          customer            = excluded.customer,
          customer_contact    = excluded.customer_contact,
          sale_type           = excluded.sale_type,
          oil_id              = excluded.oil_id,
          oil_type            = excluded.oil_type,
          truck_plate         = excluded.truck_plate,
          truck_type          = excluded.truck_type,
          truck_plate_extra   = excluded.truck_plate_extra,
          unit_type           = excluded.unit_type,
          unit_qty            = excluded.unit_qty,
          unit_capacity_l     = excluded.unit_capacity_l,
          liters_sold         = excluded.liters_sold,
          currency            = excluded.currency,
          price_per_l         = excluded.price_per_l,
          price_per_unit_type = excluded.price_per_unit_type,
          subtotal_native     = excluded.subtotal_native,
          discount_native     = excluded.discount_native,
          tax_native          = excluded.tax_native,
          total_native        = excluded.total_native,
          fx_rate_to_usd      = excluded.fx_rate_to_usd,
          total_usd           = excluded.total_usd,
          payment_status      = excluded.payment_status,
          payment_method      = excluded.payment_method,
          paid_native         = excluded.paid_native,
          note                = excluded.note,
          created_at          = excluded.created_at,
          updated_at          = excluded.updated_at,
          dirty               = 0,
          deleted             = 0;
      `,
        [
          s.id,
          ownerId,
          s.customer ?? null,
          s.customer_contact ?? null,
          s.sale_type,
          s.oil_id,
          s.oil_type,
          s.truck_plate ?? null,
          s.truck_type ?? null,
          s.truck_plate_extra ?? null,
          s.unit_type,
          s.unit_qty ?? 0,
          s.unit_capacity_l ?? null,
          s.liters_sold ?? 0,
          s.currency,
          s.price_per_l ?? null,
          s.price_per_unit_type ?? null,
          s.subtotal_native ?? null,
          s.discount_native ?? null,
          s.tax_native ?? null,
          s.total_native ?? null,
          s.fx_rate_to_usd ?? null,
          s.total_usd ?? null,
          s.payment_status,
          s.payment_method ?? null,
          s.paid_native ?? null,
          s.note ?? null,
          s.created_at,
          s.updated_at,
        ]
      );
    }
  });
}

/* ----------------------------- Local query (offline, raw list) ----------------------------- */

/**
 * Local query for OilSalesPage:
 * - filter by created_at between [startISO, endISO)
 * - owner_id scoped
 * - newest first (created_at desc, id desc)
 */
export function getOilSalesLocal(
  ownerId: number,
  opts?: { startISO?: string; endISO?: string; limit?: number }
): OilSaleRead[] {
  ensureDb();

  const limit = opts?.limit ?? 500;
  const params: any[] = [ownerId];
  const where: string[] = ['owner_id = ? AND deleted = 0'];

  if (opts?.startISO) {
    where.push('datetime(created_at) >= datetime(?)');
    params.push(opts.startISO);
  }
  if (opts?.endISO) {
    where.push('datetime(created_at) < datetime(?)');
    params.push(opts.endISO);
  }

  const sql = `
    SELECT *
    FROM oilsales_all
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET 0;
  `;

  const rows = db.getAllSync<OilSaleRow>(sql, [...params, limit]);
  return rows.map((r) => r as OilSaleRead);
}

/* ----------------------------- Local summary helper (for RealOilSalesPage) ----------------------------- */

/**
 * Very small totals shape – the UI already recomputes KPIs itself,
 * so this just keeps types happy and gives a bit of info.
 */
export type TotalsPayload = {
  count: number;
  total_native?: number;
  total_usd?: number;
};

/**
 * Back-compat helper for RealOilSalesPage:
 * returns { items, totals } using the existing local query.
 *
 * RealOilSalesPage calls this when offline or when the API fails.
 */
export function getOilSalesSummaryLocal(
  ownerId: number,
  opts?: { fromISO?: string; toISO?: string; limit?: number }
): { items: OilSaleRead[]; totals: TotalsPayload } {
  const items = getOilSalesLocal(ownerId, {
    startISO: opts?.fromISO,
    endISO: opts?.toISO,
    limit: opts?.limit,
  });

  let total_native = 0;
  let total_usd = 0;

  for (const r of items) {
    total_native += r.total_native ?? 0;
    total_usd += r.total_usd ?? 0;
  }

  return {
    items,
    totals: {
      count: items.length,
      total_native,
      total_usd,
    },
  };
}
