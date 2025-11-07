// /db/CustomerInvoicesPagerepo.ts
import { db } from './db';

/* ----------------------------- Shared types (match page/backend) ----------------------------- */

export type SaleUnitType = 'liters' | 'fuusto' | 'caag' | 'lot';

export type OilSaleRead = {
  id: number;
  oil_id: number;
  owner_id: number;

  customer?: string | null;
  customer_contact?: string | null;

  oil_type: string;
  unit_type: SaleUnitType;
  unit_qty: number;
  unit_capacity_l?: number | null;
  liters_sold: number;

  currency: string;
  price_per_l?: number | null;
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
};

export type OilTypeTotals = {
  oil_type: string;
  count: number;
  revenue_native: number;
  revenue_usd: number;
};

export type OilSaleTotals = {
  per_type: OilTypeTotals[];
  overall_count: number;
  overall_revenue_native: number;
  overall_revenue_usd: number;
};

export type OilSaleCustomerReport = {
  customer_id?: number | null;
  customer_name: string;
  customer_contact?: string | null;
  items: OilSaleRead[];
  totals: OilSaleTotals;
  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;
};

export type CustomerDetails = {
  id: number;
  name: string | null;
  phone: string | null;
  address?: string | null;
  status?: string | null;
  amount_due: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
};

/* ----------------------------- Local row type ----------------------------- */

type OilSaleRow = OilSaleRead & {
  dirty: number;
  deleted: number;
};

/* ----------------------------- Upsert from server ----------------------------- */

/**
 * Store items from /oilsale/summary/by-customer-name into local oilsales table.
 * We only persist the items; totals are recomputed locally.
 */
export function upsertCustomerInvoicesFromServer(
  report: OilSaleCustomerReport,
  ownerId: number
) {
  const items = report.items || [];
  if (!items.length || !ownerId) return;

  db.withTransactionSync(() => {
    for (const s of items) {
      db.runSync(
        `
        INSERT INTO oilsales (
          id, owner_id,
          customer, customer_contact,
          oil_id, oil_type,
          unit_type, unit_qty, unit_capacity_l, liters_sold,
          currency, price_per_l,
          subtotal_native, discount_native, tax_native, total_native,
          fx_rate_to_usd, total_usd,
          payment_status, payment_method, paid_native, note,
          created_at, updated_at,
          dirty, deleted
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          0, 0
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id         = excluded.owner_id,
          customer         = excluded.customer,
          customer_contact = excluded.customer_contact,
          oil_id           = excluded.oil_id,
          oil_type         = excluded.oil_type,
          unit_type        = excluded.unit_type,
          unit_qty         = excluded.unit_qty,
          unit_capacity_l  = excluded.unit_capacity_l,
          liters_sold      = excluded.liters_sold,
          currency         = excluded.currency,
          price_per_l      = excluded.price_per_l,
          subtotal_native  = excluded.subtotal_native,
          discount_native  = excluded.discount_native,
          tax_native       = excluded.tax_native,
          total_native     = excluded.total_native,
          fx_rate_to_usd   = excluded.fx_rate_to_usd,
          total_usd        = excluded.total_usd,
          payment_status   = excluded.payment_status,
          payment_method   = excluded.payment_method,
          paid_native      = excluded.paid_native,
          note             = excluded.note,
          created_at       = excluded.created_at,
          updated_at       = excluded.updated_at,
          dirty            = 0,
          deleted          = 0;
      `,
        [
          s.id,
          ownerId,
          s.customer ?? null,
          s.customer_contact ?? null,
          s.oil_id,
          s.oil_type,
          s.unit_type,
          s.unit_qty ?? 0,
          s.unit_capacity_l ?? null,
          s.liters_sold ?? 0,
          s.currency,
          s.price_per_l ?? null,
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

/* ----------------------------- Helpers for totals ----------------------------- */

function safeNum(n: number | null | undefined): number {
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

/**
 * Apply same spirit as backend _ensure_item_total_usd:
 * - if currency == USD and total_usd is null → mirror total_native
 */
function ensureTotalUsd(item: OilSaleRead): OilSaleRead {
  const cur = (item.currency || 'USD').toUpperCase();
  if (cur === 'USD' && item.total_usd == null && item.total_native != null) {
    return { ...item, total_usd: item.total_native };
  }
  return item;
}

/* ----------------------------- Local report (offline) ----------------------------- */

/**
 * Build a local OilSaleCustomerReport for a given customer_name.
 * - exact match, case-insensitive (like /summary/by-customer-name with match=exact, case_sensitive=false)
 * - uses oilsales table
 * - recomputes simple totals
 */
export function getCustomerInvoiceReportLocal(
  ownerId: number,
  customerName: string,
  limit = 200
): OilSaleCustomerReport {
  const name = customerName.trim();
  const probe = name.toLowerCase();

  const rows = db.getAllSync<OilSaleRow>(
    `
      SELECT *
      FROM oilsales
      WHERE owner_id = ?
        AND deleted = 0
        AND LOWER(customer) = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ? OFFSET 0;
    `,
    [ownerId, probe, limit]
  );

  const items: OilSaleRead[] = rows.map((r) => ensureTotalUsd(r));

  // ---- totals: per_type & overall ----
  const perTypeMap = new Map<string, { count: number; native: number; usd: number }>();

  for (const it of items) {
    const key = it.oil_type || 'unknown';
    const existing = perTypeMap.get(key) || { count: 0, native: 0, usd: 0 };
    existing.count += 1;
    existing.native += safeNum(it.total_native);
    existing.usd += safeNum(ensureTotalUsd(it).total_usd);
    perTypeMap.set(key, existing);
  }

  const per_type: OilTypeTotals[] = Array.from(perTypeMap.entries()).map(([oil_type, v]) => ({
    oil_type,
    count: v.count,
    revenue_native: v.native,
    revenue_usd: v.usd,
  }));

  const overall_revenue_native = per_type.reduce((s, t) => s + t.revenue_native, 0);
  const overall_revenue_usd = per_type.reduce((s, t) => s + t.revenue_usd, 0);
  const overall_count = items.length;

  const totals: OilSaleTotals = {
    per_type,
    overall_count,
    overall_revenue_native,
    overall_revenue_usd,
  };

  // ---- resolve customer_id + canonical contact from local customers table ----
  const customerRow = db.getFirstSync<{
    id: number;
    name: string | null;
    phone: string | null;
  }>(
    `
      SELECT id, name, phone
      FROM customers
      WHERE owner_id = ?
        AND deleted = 0
        AND LOWER(name) = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1;
    `,
    [ownerId, probe]
  );

  const resolvedCustomerId = customerRow?.id ?? null;
  const resolvedName = (customerRow?.name || name).trim();
  const resolvedContact =
    customerRow?.phone ||
    // fallback: first non-null customer_contact from sales
    items.find((i) => i.customer_contact)?.customer_contact ||
    null;

  return {
    customer_id: resolvedCustomerId,
    customer_name: resolvedName,
    customer_contact: resolvedContact ?? undefined,
    items,
    totals,
    offset: 0,
    limit,
    returned: items.length,
    has_more: false,
  };
}

/* ----------------------------- Single sale for receipt (offline) ----------------------------- */

export function getSaleLocal(ownerId: number, saleId: number): OilSaleRead | null {
  const row = db.getFirstSync<OilSaleRow>(
    `
      SELECT *
      FROM oilsales
      WHERE owner_id = ?
        AND id = ?
        AND deleted = 0
      LIMIT 1;
    `,
    [ownerId, saleId]
  );
  return row ? ensureTotalUsd(row) : null;
}

/* ----------------------------- Customer KPIs from local customers table ----------------------------- */

/**
 * For offline KPI cards (amount_paid / amount_due) & phone.
 * Match by exact name, case-insensitive, choose latest updated row.
 */
export function getCustomerDetailsLocalByName(
  ownerId: number,
  customerName: string
): CustomerDetails | null {
  const name = customerName.trim();
  if (!name) return null;
  const probe = name.toLowerCase();

  const row = db.getFirstSync<CustomerDetails>(
    `
      SELECT
        id,
        name,
        phone,
        address,
        status,
        amount_due,
        amount_paid,
        created_at,
        updated_at
      FROM customers
      WHERE owner_id = ?
        AND deleted = 0
        AND LOWER(name) = ?
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT 1;
    `,
    [ownerId, probe]
  );

  return row ?? null;
}
