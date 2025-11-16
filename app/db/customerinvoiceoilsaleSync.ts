// app/db/customerinvoiceoilsaleSync.ts
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
  if (!ownerId || !token) {
    console.warn('[syncAllCustomerInvoices] Missing ownerId or token', {
      ownerId,
      hasToken: !!token,
    });
    return;
  }

  console.log('[syncAllCustomerInvoices] START', { ownerId });

  const headers = { Authorization: `Bearer ${token}` };

  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    console.log('[syncAllCustomerInvoices] Fetching customers page', {
      offset,
      limit,
    });

    const res = await api.get<CustomerRow[]>('/diiwaancustomers', {
      headers,
      params: { offset, limit },
    });

    const customers = res.data || [];
    console.log('[syncAllCustomerInvoices] Got customers', {
      count: customers.length,
    });

    if (!customers.length) break;

    // 2) for each customer, fetch their invoices summary & cache to SQLite
    for (const c of customers) {
      const name = (c.name || '').trim();
      if (!name) {
        console.log(
          '[syncAllCustomerInvoices] Skipping customer with empty name',
          c
        );
        continue;
      }

      try {
        console.log('[syncAllCustomerInvoices] Fetching report for', {
          customerName: name,
        });

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

        const itemsCount = repRes.data?.items?.length ?? 0;
        console.log('[syncAllCustomerInvoices] Upserting report', {
          customerName: name,
          itemsCount,
        });

        upsertCustomerInvoicesFromServer(repRes.data, ownerId);
      } catch (err) {
        console.warn(
          '[syncAllCustomerInvoices] error for customer',
          name,
          err
        );
        // continue with next customer
      }
    }

    hasMore = customers.length === limit;
    offset += customers.length;
  }

  console.log('[syncAllCustomerInvoices] DONE', { ownerId });
}
