// app/db/incomeStatementSync.ts
import api from '@/services/api';
import {
    upsertIncomeStatementFromServer,
    type AccountSummaryResponse,
} from './incomeStatementRepo';

/**
 * Prefetch some income-statement snapshots for offline use.
 *
 * Right now we just fetch current "year" overall (all trucks).
 * You can expand this later (per truck, per month, etc.).
 */
export async function syncIncomeStatement(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  const headers = { Authorization: `Bearer ${token}` };

  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();
  const label = `Year ${year}`;

  try {
    const res = await api.get<AccountSummaryResponse>(
      '/diiwaantenantsaccounts/summary',
      {
        headers,
        params: { start, end },
      }
    );

    upsertIncomeStatementFromServer({
      ownerId,
      start,
      end,
      truckPlate: '',
      label,
      response: res.data,
    });
  } catch (e) {
    console.warn('syncIncomeStatement failed', e);
  }
}
