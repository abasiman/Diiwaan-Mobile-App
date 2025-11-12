// app/oilsaleformoffline/oilSaleFormSync.ts
import api from '@/services/api';
import { initOilSaleFormDb } from './oilSaleFormDb';
import {
  getPendingOilSaleForms,
  updateOilSaleFormStatus,
  type OilSaleFormCreatePayload,
} from './oilSalesFormRepo';

// Optional: reset stale "syncing" rows back to pending
function resetStaleSyncingRows(ownerId: number, minutes = 5) {
  try {
    initOilSaleFormDb();
    const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
    const { db } = require('../db/db');
    db.runSync(
      `
        UPDATE oil_sale_forms
        SET status = 'pending', error = NULL, updated_at = ?
        WHERE owner_id = ? AND status = 'syncing' AND datetime(last_attempt_at) < datetime(?);
      `,
      [new Date().toISOString(), ownerId, cutoff]
    );
    console.log('[OilFormSync] reset stale syncing rows older than', minutes, 'min');
  } catch (e) {
    console.warn('[OilFormSync] resetStaleSyncingRows failed', e);
  }
}

export async function syncPendingOilSaleForms(ownerId: number, token: string) {
  console.log('[OilFormSync] start', { ownerId, hasToken: !!token });
  if (!ownerId || !token) {
    console.log('[OilFormSync] abort: missing ownerId or token');
    return;
  }

  initOilSaleFormDb();
  resetStaleSyncingRows(ownerId, 5);

  const pending = getPendingOilSaleForms(ownerId, 100);
  console.log(
    '[OilFormSync] pending count =',
    pending.length,
    pending.map((r) => ({
      id: r.id,
      status: r.status,
      oil_id: r.oil_id,
      wakaalad_id: r.wakaalad_id,
    }))
  );

  if (!pending.length) return;

  const headers = { Authorization: `Bearer ${token}` };

  for (const row of pending) {
    try {
      console.log('[OilFormSync] syncing row', {
        id: row.id,
        oil_id: row.oil_id,
        wakaalad_id: row.wakaalad_id,
        unit_type: row.unit_type,
        sale_type: row.sale_type,
      });

      updateOilSaleFormStatus(row.id, 'syncing');

      const payload: OilSaleFormCreatePayload = {
        oil_id: row.oil_id,
        wakaalad_id: row.wakaalad_id,
        unit_type: row.unit_type,
        sale_type: row.sale_type,
        oil_type: row.oil_type ?? undefined,
        truck_plate: row.truck_plate ?? undefined,
      };

      if (row.unit_qty != null) payload.unit_qty = row.unit_qty;
      if (row.liters_sold != null) payload.liters_sold = row.liters_sold;
      if (row.price_per_l != null) payload.price_per_l = row.price_per_l;
      if (row.customer) payload.customer = row.customer;
      if (row.customer_contact) payload.customer_contact = row.customer_contact;
      if (row.currency) payload.currency = row.currency;
      if (row.fx_rate_to_usd != null) payload.fx_rate_to_usd = row.fx_rate_to_usd;
      if (row.payment_method)
        payload.payment_method = row.payment_method as 'cash' | 'bank';

      console.log('[OilFormSync] POST /oilsale payload', payload);

      const res = await api.post('/oilsale', payload, { headers });
      const remoteId = Number(res?.data?.id ?? 0) || null;

      console.log('[OilFormSync] synced OK', { localId: row.id, remoteId });

      updateOilSaleFormStatus(row.id, 'synced', {
        remote_id: remoteId ?? undefined,
        error: null,
      });
    } catch (e: any) {
      const isNetworkError =
        !e?.response ||
        e?.code === 'ERR_NETWORK' ||
        e?.message === 'Network Error' ||
        e?.message === 'Network request failed';

      if (isNetworkError) {
        console.log('[OilFormSync] network error, keep pending', {
          id: row.id,
          msg: e?.message,
        });
        updateOilSaleFormStatus(row.id, 'pending', { error: null });
        break;
      }

      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Failed to sync oil sale form';

      console.warn('[OilFormSync] server error', { id: row.id, msg });

      updateOilSaleFormStatus(row.id, 'failed', { error: String(msg) });
    }
  }
}
