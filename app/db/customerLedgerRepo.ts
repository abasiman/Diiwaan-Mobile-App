// app/db/CustomerLedgerRepo.ts
import { db } from './db';

/* ----------------------------- Shared types (match page/backend) ----------------------------- */

export type LedgerItem = {
  id: number;
  transaction_type: 'debit' | 'credit';
  amount: number;
  note?: string | null;
  payment_method?: string | null;
  payment_date: string; // ISO
  created_at: string;   // ISO
  invoice_id?: number | null;

  debit: number;
  credit: number;
  running_balance: number;
};

export type LedgerTotals = {
  total_debit: number;
  total_credit: number;
  closing_balance: number;
};

export type CustomerLedgerResponse = {
  customer_id: number | null;
  customer_name: string;
  customer_phone?: string | null;

  items: LedgerItem[];
  totals: LedgerTotals;

  offset: number;
  limit: number;
  returned: number;
  has_more: boolean;

  synced_amount_due: boolean;
  amount_due: number;
};

/* ----------------------------- Local row type ----------------------------- */

type PaymentRow = {
  id: number;
  owner_id: number;
  customer_id: number | null;
  customer_name: string;

  transaction_type: 'debit' | 'credit';
  amount: number;
  note: string | null;
  payment_method: string | null;
  payment_date: string;
  created_at: string;
  invoice_id: number | null;

  dirty: number;
  deleted: number;
};

/* ----------------------------- Upsert from server ----------------------------- */

/**
 * Persist items from /diiwaanpayments/search/by-customer-name into local payments table.
 * We only store the raw rows; running_balance & totals are recomputed locally.
 */
export function upsertCustomerLedgerFromServer(
  report: CustomerLedgerResponse,
  ownerId: number
) {
  const items = report.items || [];
  if (!items.length || !ownerId) return;

  const customerId = report.customer_id ?? null;
  const customerName = (report.customer_name || '').trim() || '—';

  db.withTransactionSync(() => {
    for (const it of items) {
      db.runSync(
        `
        INSERT INTO payments (
          id, owner_id,
          customer_id, customer_name,
          transaction_type, amount, note, payment_method,
          payment_date, created_at, invoice_id,
          dirty, deleted
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id         = excluded.owner_id,
          customer_id      = excluded.customer_id,
          customer_name    = excluded.customer_name,
          transaction_type = excluded.transaction_type,
          amount           = excluded.amount,
          note             = excluded.note,
          payment_method   = excluded.payment_method,
          payment_date     = excluded.payment_date,
          created_at       = excluded.created_at,
          invoice_id       = excluded.invoice_id,
          dirty            = 0,
          deleted          = 0;
      `,
        [
          it.id,
          ownerId,
          customerId,
          customerName,
          it.transaction_type,
          it.amount ?? 0,
          it.note ?? null,
          it.payment_method ?? null,
          it.payment_date,
          it.created_at,
          it.invoice_id ?? null,
        ]
      );
    }
  });
}

/* ----------------------------- Customer helper from customers table ----------------------------- */

type CustomerRow = {
  id: number;
  name: string | null;
  phone: string | null;
  amount_due: number;
};

function getLocalCustomerByName(
  ownerId: number,
  customerName: string
): CustomerRow | null {
  const name = customerName.trim();
  if (!name) return null;
  const probe = name.toLowerCase();

  const row = db.getFirstSync<CustomerRow>(
    `
      SELECT id, name, phone, amount_due
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

/* ----------------------------- Local ledger (offline) ----------------------------- */

/**
 * Build local CustomerLedgerResponse for a given customer_name.
 * - exact match, case-insensitive (like backend)
 * - uses payments table
 * - recomputes debit/credit/running_balance & totals
 */
export function getCustomerLedgerLocal(
  ownerId: number,
  customerName: string,
  opts?: { fromISO?: string; toISO?: string; limit?: number }
): CustomerLedgerResponse {
  const trimmed = customerName.trim();
  if (!trimmed) {
    return {
      customer_id: null,
      customer_name: '',
      customer_phone: null,
      items: [],
      totals: { total_debit: 0, total_credit: 0, closing_balance: 0 },
      offset: 0,
      limit: opts?.limit ?? 500,
      returned: 0,
      has_more: false,
      synced_amount_due: false,
      amount_due: 0,
    };
  }

  const probe = trimmed.toLowerCase();
  const { fromISO, toISO } = opts || {};
  const limit = opts?.limit ?? 500;

  const params: any[] = [ownerId, probe];
  const whereDates: string[] = [];

  if (fromISO) {
    whereDates.push('datetime(payment_date) >= datetime(?)');
    params.push(fromISO);
  }
  if (toISO) {
    whereDates.push('datetime(payment_date) <= datetime(?)');
    params.push(toISO);
  }

  const extraWhere = whereDates.length
    ? ' AND ' + whereDates.join(' AND ')
    : '';

  const rows = db.getAllSync<PaymentRow>(
    `
      SELECT *
      FROM payments
      WHERE owner_id = ?
        AND deleted = 0
        AND LOWER(customer_name) = ?
        ${extraWhere}
      ORDER BY datetime(payment_date) ASC, id ASC
      LIMIT ? OFFSET 0;
    `,
    [...params, limit]
  );

  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const items: LedgerItem[] = rows.map((r) => {
    const isDebit = r.transaction_type === 'debit';
    const debit = isDebit ? (r.amount ?? 0) : 0;
    const credit = !isDebit ? (r.amount ?? 0) : 0;

    running += debit - credit;
    totalDebit += debit;
    totalCredit += credit;

    return {
      id: r.id,
      transaction_type: r.transaction_type,
      amount: r.amount ?? 0,
      note: r.note ?? null,
      payment_method: r.payment_method ?? null,
      payment_date: r.payment_date,
      created_at: r.created_at,
      invoice_id: r.invoice_id ?? null,
      debit,
      credit,
      running_balance: running,
    };
  });

  const totals: LedgerTotals = {
    total_debit: totalDebit,
    total_credit: totalCredit,
    closing_balance: running,
  };

  const customerRow = getLocalCustomerByName(ownerId, trimmed);

  return {
    customer_id: customerRow?.id ?? null,
    customer_name: customerRow?.name || trimmed,
    customer_phone: customerRow?.phone ?? null,
    items,
    totals,
    offset: 0,
    limit,
    returned: items.length,
    has_more: false,
    synced_amount_due: false,
    amount_due: customerRow?.amount_due ?? 0,
  };
}
