// app/db/customerRepo.ts

import type { AxiosInstance } from 'axios';
import { db } from './db';

export type CustomerRow = {
  id: number;
  owner_id: number;
  name: string;
  phone: string | null;
  address: string | null;
  status: string;
  amount_due: number;
  amount_due_usd: number | null;
  amount_due_native: number | null;
  amount_paid: number;
  created_at: string | null;
  updated_at: string | null;
  dirty: number;   // 1 = needs sync
  deleted: number; // 1 = soft deleted
};

// ---------- Local reads (for UI) ----------
export function getCustomersLocal(
  search: string,
  limit: number,
  offset: number,
  ownerId: number
): CustomerRow[] {
  const trimmed = search.trim();
  const like = `%${trimmed}%`;

  const rows = db.getAllSync<CustomerRow>(
    `
      SELECT *
      FROM customers
      WHERE owner_id = ?
        AND deleted = 0
        AND (
          ? = '' OR
          name LIKE ? OR
          phone LIKE ?
        )
      ORDER BY name COLLATE NOCASE ASC, id ASC
      LIMIT ? OFFSET ?;
    `,
    [ownerId, trimmed, like, like, limit, offset]
  );

  return rows;
}

// ---------- Fix orphaned customers (old data missing owner_id) ----------
export function fixOwnerIds(currentUserId: number) {
  if (!currentUserId) return;
  db.execSync(`
    UPDATE customers
    SET owner_id = ${currentUserId}
    WHERE owner_id IS NULL OR owner_id = 0;
  `);
}

// ---------- Upsert from server → local cache ----------
export type ApiCustomer = {
  id: number;
  owner_id?: number; // optional from server
  name: string | null;
  phone: string | null;
  address?: string | null;
  status?: string | null;
  amount_due: number;
  amount_due_usd?: number;
  amount_due_native?: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
};

export function upsertCustomersFromServer(customers: ApiCustomer[], ownerId: number) {
  if (!customers.length) return;

  db.withTransactionSync(() => {
    for (const c of customers) {
      db.runSync(
        `
        INSERT INTO customers (
          id, owner_id, name, phone, address, status,
          amount_due, amount_due_usd, amount_due_native, amount_paid,
          created_at, updated_at, dirty, deleted
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 0, 0
        )
        ON CONFLICT(id) DO UPDATE SET
          owner_id           = excluded.owner_id,
          name               = excluded.name,
          phone              = excluded.phone,
          address            = excluded.address,
          status             = excluded.status,
          amount_due         = excluded.amount_due,
          amount_due_usd     = excluded.amount_due_usd,
          amount_due_native  = excluded.amount_due_native,
          amount_paid        = excluded.amount_paid,
          created_at         = excluded.created_at,
          updated_at         = excluded.updated_at,
          dirty              = 0,
          deleted            = 0;
      `,
        [
          c.id,
          ownerId,
          c.name ?? '',
          c.phone ?? null,
          c.address ?? null,
          c.status ?? 'active',
          c.amount_due ?? 0,
          c.amount_due_usd ?? 0,
          c.amount_due_native ?? 0,
          c.amount_paid ?? 0,
          c.created_at ?? new Date().toISOString(),
          c.updated_at ?? new Date().toISOString(),
        ]
      );
    }
  });
}

// ---------- Local create/update (offline aware) ----------
function getNextTempId(): number {
  const row = db.getFirstSync<{ min_id: number | null }>(
    'SELECT MIN(id) as min_id FROM customers WHERE id < 0;'
  );
  if (row?.min_id != null) return row.min_id - 1;
  return -1;
}

export type CustomerFormPayload = {
  name: string;
  phone: string | null;
  address: string | null;
  status: string;
};

export function createOrUpdateCustomerLocal(
  payload: CustomerFormPayload,
  ownerId: number,
  existing?: CustomerRow
): CustomerRow {
  const now = new Date().toISOString();

  if (!existing) {
    const id = getNextTempId();
    db.runSync(
      `
      INSERT INTO customers (
        id, owner_id, name, phone, address, status,
        amount_due, amount_due_usd, amount_due_native, amount_paid,
        created_at, updated_at, dirty, deleted
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        0, 0, 0, 0,
        ?, ?, 1, 0
      );
    `,
      [
        id,
        ownerId,
        payload.name,
        payload.phone,
        payload.address,
        payload.status || 'active',
        now,
        now,
      ]
    );
    const row = db.getFirstSync<CustomerRow>('SELECT * FROM customers WHERE id = ?;', [id]);
    if (!row) throw new Error('Failed to read inserted customer');
    return row;
  } else {
    db.runSync(
      `
      UPDATE customers
      SET name = ?, phone = ?, address = ?, status = ?,
          updated_at = ?, dirty = 1
      WHERE id = ?;
    `,
      [
        payload.name,
        payload.phone,
        payload.address,
        payload.status || 'active',
        now,
        existing.id,
      ]
    );
    const row = db.getFirstSync<CustomerRow>('SELECT * FROM customers WHERE id = ?;', [
      existing.id,
    ]);
    if (!row) throw new Error('Failed to read updated customer');
    return row;
  }
}

/**
 * NEW: apply a local *delta* to a customer's balance when we create
 * an OFFLINE sale (credit). This only changes local numbers so the
 * CustomersList shows the updated balance immediately.
 *
 * - `deltaAmountDueUsd` should be the credit/outstanding portion in USD.
 * - Look up by owner + customer name (same name you use in sales).
 * - If the customer doesn't exist yet, we create a temp local row (id < 0)
 *   with dirty=1 so it will be POSTed on next sync.
 */
export function applyLocalCustomerBalanceDeltaByName(
  ownerId: number,
  customerName: string | null | undefined,
  deltaAmountDueUsd: number
) {
  const name = (customerName || '').trim();
  if (!ownerId || !name) return;
  if (!deltaAmountDueUsd || !isFinite(deltaAmountDueUsd)) return;

  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    const existing = db.getFirstSync<CustomerRow>(
      `
      SELECT *
      FROM customers
      WHERE owner_id = ?
        AND deleted = 0
        AND name = ?
      LIMIT 1;
    `,
      [ownerId, name]
    );

    if (existing) {
      // Just bump the balance locally. We deliberately do NOT touch `dirty`
      // so we don't send any bogus "amount_due" to the server. Server will
      // recompute from real sales after sync.
      db.runSync(
        `
        UPDATE customers
        SET amount_due      = amount_due + ?,
            amount_due_usd  = COALESCE(amount_due_usd, 0) + ?,
            updated_at      = ?
        WHERE id = ?;
      `,
        [deltaAmountDueUsd, deltaAmountDueUsd, now, existing.id]
      );
    } else {
      // No customer row yet: create a temporary one with this opening balance.
      const id = getNextTempId();
      db.runSync(
        `
        INSERT INTO customers (
          id, owner_id, name, phone, address, status,
          amount_due, amount_due_usd, amount_due_native, amount_paid,
          created_at, updated_at, dirty, deleted
        ) VALUES (
          ?, ?, ?, NULL, NULL, 'active',
          ?, ?, 0, 0,
          ?, ?, 1, 0
        );
      `,
        [id, ownerId, name, deltaAmountDueUsd, deltaAmountDueUsd, now, now]
      );
    }
  });
}

// ---------- Local delete helpers ----------
export function markCustomerDeletedLocal(id: number) {
  db.runSync(
    `
    UPDATE customers
    SET deleted = 1, dirty = 1
    WHERE id = ?;
  `,
    [id]
  );
}

export function hardDeleteCustomerLocal(id: number) {
  db.runSync('DELETE FROM customers WHERE id = ?;', [id]);
}

// ---------- Sync dirty → server ----------
export async function syncCustomersWithServer(api: AxiosInstance) {
  const dirtyRows = db.getAllSync<CustomerRow>(
    'SELECT * FROM customers WHERE dirty = 1;'
  );

  for (const row of dirtyRows) {
    // Deleted locally
    if (row.deleted) {
      if (row.id > 0) {
        try {
          await api.delete(`/diiwaancustomers/${row.id}`);
        } catch {
          continue;
        }
      }
      db.runSync('DELETE FROM customers WHERE id = ?;', [row.id]);
      continue;
    }

    const payload: CustomerFormPayload = {
      name: row.name,
      phone: row.phone,
      address: row.address,
      status: row.status,
    };

    if (row.id < 0) {
      // New local record
      try {
        const res = await api.post<ApiCustomer>('/diiwaancustomers', payload);
        const c = res.data;
        db.withTransactionSync(() => {
          db.runSync('DELETE FROM customers WHERE id = ?;', [row.id]);
          upsertCustomersFromServer([c], row.owner_id);
        });
      } catch {
        continue;
      }
    } else {
      // Existing record update (we NEVER send amount_due; server owns that)
      try {
        const res = await api.patch<ApiCustomer>(
          `/diiwaancustomers/${row.id}`,
          payload
        );
        const c = res.data;
        upsertCustomersFromServer([c], row.owner_id);
      } catch {
        continue;
      }
    }
  }
}
