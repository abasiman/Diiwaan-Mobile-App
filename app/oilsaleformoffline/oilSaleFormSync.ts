// app/oilsaleformoffline/oilSaleFormSync.ts
import api from '@/services/api';
import {
  getPendingOilSaleForms,
  updateOilSaleFormStatus,
  type OilSaleFormCreatePayload,
} from './oilSalesFormRepo';



export async function syncPendingOilSaleForms(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const pending = getPendingOilSaleForms(ownerId, 100);
  if (!pending.length) return;

  const headers = { Authorization: `Bearer ${token}` };

  for (const row of pending) {
    try {
      // mark as syncing
      updateOilSaleFormStatus(row.id, 'syncing');

      const payload: OilSaleFormCreatePayload = {
        oil_id: row.oil_id,
        wakaalad_id: row.wakaalad_id,
        unit_type: row.unit_type,
        sale_type: row.sale_type,
      };

      if (row.unit_qty != null) payload.unit_qty = row.unit_qty;
      if (row.liters_sold != null) payload.liters_sold = row.liters_sold;
      if (row.price_per_l != null) payload.price_per_l = row.price_per_l;
      if (row.customer) payload.customer = row.customer;
      if (row.customer_contact) payload.customer_contact = row.customer_contact;
      if (row.currency) payload.currency = row.currency;
      if (row.fx_rate_to_usd != null) payload.fx_rate_to_usd = row.fx_rate_to_usd;
      if (row.payment_method) payload.payment_method = row.payment_method as 'cash' | 'bank';

      const res = await api.post('/oilsale', payload, { headers });
      const remoteId = Number(res?.data?.id ?? 0) || null;

      updateOilSaleFormStatus(row.id, 'synced', {
        remote_id: remoteId ?? undefined,
        error: null,
      });
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Failed to sync oil sale form';

      updateOilSaleFormStatus(row.id, 'failed', {
        error: String(msg),
      });
      // continue with next row
    }
  }
}
