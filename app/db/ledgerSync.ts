//db/ledgerSync.ts
import api from '@/services/api';
import {
    upsertCustomerLedgerFromServer,
    type CustomerLedgerResponse,
} from './customerLedgerRepo';

type CustomerRow = {
  id: number;
  name: string | null;
};

export async function syncAllCustomerLedgers(ownerId: number, token: string) {
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

    // 2) for each customer, fetch ledger & cache to SQLite
    for (const c of customers) {
      const name = (c.name || '').trim();
      if (!name) continue;

      try {
        const repRes = await api.get<CustomerLedgerResponse>(
          '/diiwaanpayments/search/by-customer-name',
          {
            headers,
            params: {
              name,
              match: 'exact',
              case_sensitive: false,
              order: 'date_asc',
              offset: 0,
              limit: 500,
              sync_due: true,
            },
          }
        );

        upsertCustomerLedgerFromServer(repRes.data, ownerId);
      } catch (err) {
        console.warn('syncAllCustomerLedgers error for', name, err);
        // continue with next customer
      }
    }

    hasMore = customers.length === limit;
    offset += customers.length;
  }
}
