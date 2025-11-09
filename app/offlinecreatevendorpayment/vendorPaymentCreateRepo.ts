// app/OilPurchaseOffline/vendorPaymentCreateRepo.ts
import { db } from '../db/db';
import { initVendorPaymentDb, VENDOR_PAYMENTS_TABLE } from '../OilPurchaseOffline/vendorPaymentDb';


export type OfflineVendorPaymentInsert = {
  ownerId: number;
  amount: number;              // numeric, 2-decimal normalized
  amountDueSnapshot: number;   // payable AFTER this payment (for your reference)
  note?: string | null;
  paymentMethod?: string | null;
  supplierName?: string | null;
  paymentDateIso?: string;     // optional, defaults to now
  truckPlate?: string | null;
  truckType?: string | null;
  extraCostId?: number | null;
  oilId?: number | null;
  lotId?: number | null;
  transactionType?: string | null;
    // 🔹 NEW: link to offline oil form
  localOilFormId?: number | null;
};

export async function insertOfflineVendorPayment(
  payload: OfflineVendorPaymentInsert
): Promise<void> {
  const {
    ownerId,
    amount,
    amountDueSnapshot,
    note,
    paymentMethod,
    supplierName,
    paymentDateIso,
    truckPlate,
    truckType,
    extraCostId,
    oilId,
    lotId,
    transactionType,
    localOilFormId,    
  } = payload;

  if (!ownerId) {
    console.warn('[vendor-payments-offline] insert called without ownerId');
    return;
  }

  initVendorPaymentDb();

  const nowIso = new Date().toISOString();
  const paymentDate = paymentDateIso || nowIso;

  db.runSync(
    `
      INSERT INTO ${VENDOR_PAYMENTS_TABLE} (
        owner_id,
        amount,
        amount_due,
        note,
        payment_date,
        created_at,
        updated_at,
        truck_plate,
        truck_type,
        extra_cost_id,
        transaction_type,
        payment_method,
        supplier_name,
        oil_id,
        lot_id,
        local_oil_form_id,  
        dirty,
        deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0);
    `,
    [
      ownerId,
      amount,
      amountDueSnapshot,
      note ?? null,
      paymentDate,
      nowIso,
      nowIso,
      truckPlate ?? null,
      truckType ?? null,
      extraCostId ?? null,
      transactionType ?? null,
      paymentMethod ?? 'equity',
      supplierName || '',
      oilId ?? null,
      lotId ?? null,
      localOilFormId ?? null,   // 🔹 NEW VALUE
    ],
  );

  console.log('[vendor-payments-offline] queued vendor payment offline');
}
