// app/OilPurchaseOffline/vendorPaymentCreateSync.ts
import api from '@/services/api';
import { db } from '../db/db';
import { initVendorPaymentDb, VENDOR_PAYMENTS_TABLE } from '../OilPurchaseOffline/vendorPaymentDb';


type LocalVendorPaymentRow = {
  id: number;
  owner_id: number;
  amount: number;
  amount_due: number;
  note: string | null;
  payment_date: string;
  truck_plate: string | null;
  truck_type: string | null;
  extra_cost_id: number | null;
  transaction_type: string | null;
  payment_method: string | null;
  supplier_name: string | null;
  oil_id: number | null;
  lot_id: number | null;
  local_oil_form_id: number | null;  // 🔹 NEW
  dirty: number;
  deleted: number;
};

export async function syncPendingVendorPayments(
  token: string | null,
  ownerId: number
): Promise<void> {
  if (!token || !ownerId) return;

  initVendorPaymentDb();

  const rows = db.getAllSync<LocalVendorPaymentRow>(
    `
      SELECT *
      FROM ${VENDOR_PAYMENTS_TABLE}
      WHERE owner_id = ? AND dirty = 1 AND deleted = 0
      ORDER BY payment_date ASC, id ASC;
    `,
    [ownerId],
  );

  if (!rows.length) {
    return;
  }

  console.log('[vendor-payments-offline] syncing', rows.length, 'pending vendor payments');

 for (const row of rows) {
  try {
    // 🔹 If this payment is tied only to a local form and we don't yet
    //     know the real oil/lot id mapping, skip for now.
    if (!row.oil_id && !row.lot_id && row.local_oil_form_id) {
      console.log(
        '[vendor-payments-offline] skipping payment id=',
        row.id,
        'until oil form local_oil_form_id',
        row.local_oil_form_id,
        'is resolved',
      );
      continue; // keep dirty=1 so we retry later
    }

    const body: any = {
      amount: Number(row.amount || 0),
      payment_method: row.payment_method || 'equity',
    };

    if (row.note) body.note = row.note;
    if (row.supplier_name) body.supplier_name = row.supplier_name;
    if (row.extra_cost_id) body.extra_cost_id = row.extra_cost_id;
    if (row.oil_id) body.oil_id = row.oil_id;
    if (row.lot_id) body.lot_id = row.lot_id;
    if (row.truck_plate) body.truck_plate = row.truck_plate;
    if (row.truck_type) body.truck_type = row.truck_type;
    if (row.transaction_type) body.transaction_type = row.transaction_type;

    await api.post('/diiwaanvendorpayments', body, {
      headers: { Authorization: `Bearer ${token}` } as any,
    });

    db.runSync(
      `UPDATE ${VENDOR_PAYMENTS_TABLE} SET dirty = 0, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), row.id],
    );
  } catch (e) {
    console.warn('[vendor-payments-offline] failed to sync vendor payment id=', row.id, e);
  }
}
}
