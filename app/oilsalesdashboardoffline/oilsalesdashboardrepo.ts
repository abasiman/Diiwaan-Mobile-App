// app/oilsalesdashboardrepo.ts

import { db } from '../db/db';

import type { OilSaleFormRow } from '../oilsaleformoffline/oilSaleFormDb';
import { listOilSalesRows, upsertOilSalesRows } from './oilsalesdashboarddb';

export type OilSaleRead = {
  id: number;
  created_at: string;

  oil_type: string | null;
  customer: string | null;
  customer_contact: string | null;
  truck_plate: string | null;

  currency: string | null;
  unit_type: 'liters' | 'fuusto' | 'caag' | 'lot' | string;
  unit_qty: number | null;
  liters_sold: number | null;

  price_per_unit_type: number | null;
  price_per_l: number | null;
  fx_rate_to_usd: number | null;

  total_native: number | null;
  total_usd: number | null;
  tax_native: number | null;
  discount_native: number | null;

  payment_method: string | null;
  payment_status: string | null;
  note: string | null;
};

export type TotalsPayload = {
  count: number;
  total_native: number;
  total_usd: number;
};

export type OilSaleSummaryResponse = {
  items: OilSaleRead[];
  totals: TotalsPayload;
  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;
};

export type OilSaleWithMeta = OilSaleRead & { pending?: boolean };

/**
 * Upsert server summary into local DB.
 */
export async function upsertOilSalesFromServer(
  ownerId: number,
  data: OilSaleSummaryResponse
): Promise<void> {
  if (!ownerId || !data?.items?.length) return;
  await upsertOilSalesRows(ownerId, data.items);
}

/**
 * Offline-first read for the dashboard.
 */
export function getOilSalesSummaryLocal(
  ownerId: number,
  opts: { fromISO?: string; toISO?: string; limit?: number }
): { items: OilSaleRead[]; totals: TotalsPayload } {
  if (!ownerId) {
    return {
      items: [],
      totals: { count: 0, total_native: 0, total_usd: 0 },
    };
  }

  const rows = listOilSalesRows(ownerId, opts);

  const items: OilSaleRead[] = rows.map((r: any) => ({
    id: Number(r.id),
    created_at: String(r.created_at ?? ''),

    oil_type: r.oil_type ?? null,
    customer: r.customer ?? null,
    customer_contact: r.customer_contact ?? null,
    truck_plate: r.truck_plate ?? null,

    currency: r.currency ?? null,
    unit_type: r.unit_type ?? 'liters',
    unit_qty: r.unit_qty != null ? Number(r.unit_qty) : null,
    liters_sold: r.liters_sold != null ? Number(r.liters_sold) : null,

    price_per_unit_type:
      r.price_per_unit_type != null ? Number(r.price_per_unit_type) : null,
    price_per_l: r.price_per_l != null ? Number(r.price_per_l) : null,
    fx_rate_to_usd: r.fx_rate_to_usd != null ? Number(r.fx_rate_to_usd) : null,

    total_native: r.total_native != null ? Number(r.total_native) : null,
    total_usd: r.total_usd != null ? Number(r.total_usd) : null,
    tax_native: r.tax_native != null ? Number(r.tax_native) : null,
    discount_native:
      r.discount_native != null ? Number(r.discount_native) : null,

    payment_method: r.payment_method ?? null,
    payment_status: r.payment_status ?? null,
    note: r.note ?? null,
  }));

  const totals: TotalsPayload = items.reduce(
    (acc, it) => {
      acc.count += 1;
      acc.total_native += Number(it.total_native || 0);

      const cur = (it.currency || 'USD').toUpperCase();
      if (cur === 'USD') {
        acc.total_usd += Number(it.total_native || 0);
      } else if (it.total_usd != null) {
        acc.total_usd += Number(it.total_usd || 0);
      } else if (it.fx_rate_to_usd && it.fx_rate_to_usd > 0) {
        acc.total_usd += Number(it.total_native || 0) / it.fx_rate_to_usd;
      }

      return acc;
    },
    { count: 0, total_native: 0, total_usd: 0 } as TotalsPayload
  );

  return { items, totals };
}

/**
 * Show pending offline sales (created from oil_sale_forms) in the dashboard.
 * We only include cash sales that are not yet synced (no remote_id).
 */
export async function getPendingOilSalesLocalForDisplay(
  ownerId: number
): Promise<OilSaleWithMeta[]> {
  if (!ownerId) return [];

  const forms = db.getAllSync<OilSaleFormRow>(
    `
    SELECT *
    FROM oil_sale_forms
    WHERE owner_id = ?
      AND sale_type = 'cashsale'
      AND status IN ('pending','failed','syncing')
      AND remote_id IS NULL
    ORDER BY datetime(created_at) DESC
    `,
    [ownerId]
  ) as OilSaleFormRow[];

  return forms.map((f) => {
    const currency = (f.currency || 'USD').toUpperCase();
    const unit_type = f.unit_type as OilSaleRead['unit_type'];

    const unitQty =
      f.unit_qty != null ? Number(f.unit_qty) : null;
    const litersSold =
      f.liters_sold != null ? Number(f.liters_sold) : null;

    const pricePerL =
      f.price_per_l != null ? Number(f.price_per_l) : null;
    const pricePerUnit =
      (f as any).price_per_unit_type != null
        ? Number((f as any).price_per_unit_type)
        : null;
    const fxRate =
      f.fx_rate_to_usd != null ? Number(f.fx_rate_to_usd) : null;

    // More robust local total calculation (server will recalc after sync)
    let total_native: number | null = null;

    // Prefer any explicit total from the form row if it exists
    if ((f as any).total_native != null) {
      total_native = Number((f as any).total_native);
    } else {
      // liters-based
      if (pricePerL != null && litersSold != null) {
        total_native = pricePerL * litersSold;
      }
      // unit-based (fuusto / caag / lot)
      if (total_native == null && pricePerUnit != null && unitQty != null) {
        total_native = pricePerUnit * unitQty;
      }
    }

    let total_usd: number | null = null;
    if (total_native != null) {
      if (currency === 'USD') {
        total_usd = total_native;
      } else if (fxRate && fxRate > 0) {
        total_usd = total_native / fxRate;
      }
    }

    const created_at =
      typeof f.created_at === 'string'
        ? f.created_at
        : new Date().toISOString();

    const row: OilSaleWithMeta = {
      id: -Number(f.id), // negative to avoid clashing with server IDs
      created_at,

      // fill oil + plate so offline row looks like a normal sale
      oil_type: (f as any).oil_type ?? (f as any).oil_name ?? 'Oil sale',
      customer: f.customer ?? null,
      customer_contact: f.customer_contact ?? null,
      truck_plate: (f as any).truck_plate ?? null,

      currency,
      unit_type,
      unit_qty: unitQty,
      liters_sold: litersSold,

      price_per_unit_type: pricePerUnit,
      price_per_l: pricePerL,
      fx_rate_to_usd: fxRate,

      total_native,
      total_usd,
      tax_native: (f as any).tax_native ?? null,
      discount_native: (f as any).discount_native ?? null,

      payment_method: f.payment_method ?? 'cash',
      payment_status: null,
      note: (f as any).note ?? null,

      pending: true,
    };

    return row;
  });
}
