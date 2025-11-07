// app/db/oilsaleSync.ts
import {
    upsertCustomerInvoicesFromServer,
    type OilSaleCustomerReport,
} from '@/app/db/CustomerInvoicesPagerepo';
import api from '@/services/api';

type CustomerRow = {
  id: number;
  name: string | null;
};

export async function syncAllCustomerInvoices(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const headers = { Authorization: `Bearer ${token}` };

  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // 1) page through customers
    const res = await api.get<CustomerRow[]>('/diiwaancustomers', {
      headers,
      params: { offset, limit },
    });

    const customers = res.data || [];
    if (!customers.length) break;

    // 2) for each customer, fetch their invoices summary & cache to SQLite
    for (const c of customers) {
      const name = (c.name || '').trim();
      if (!name) continue;

      try {
        const repRes = await api.get<OilSaleCustomerReport>(
          '/oilsale/summary/by-customer-name',
          {
            headers,
            params: {
              customer_name: name,
              match: 'exact',
              case_sensitive: false,
              order: 'created_desc',
              offset: 0,
              limit: 200,
            },
          }
        );

        upsertCustomerInvoicesFromServer(repRes.data, ownerId);
      } catch (err) {
        console.warn('syncAllCustomerInvoices error for', name, err);
        // continue with next customer
      }
    }

    hasMore = customers.length === limit;
    offset += customers.length;
  }
}
