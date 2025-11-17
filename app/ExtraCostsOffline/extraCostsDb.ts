// app/ExtraCostsOffline/extraCostsDb.ts
import { db } from '../db/db';


export type ExtraCostRow = {
  owner_id: number;
  id: number;
  oil_id: number | null;
  lot_id: number | null;
  category: string | null;
  description: string | null;
  amount: number;
  total_paid: number;
  due: number;
  currency: string | null;
  updated_at: string;
};

export type ExtraCostUpsert = Omit<ExtraCostRow, 'owner_id'>;

export function initExtraCostsDb() {
  ensureTable();
}

function ensureTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS oil_extra_costs (
      owner_id    INTEGER NOT NULL,
      id          INTEGER NOT NULL,
      oil_id      INTEGER,
      lot_id      INTEGER,
      category    TEXT,
      description TEXT,
      amount      REAL    NOT NULL,
      total_paid  REAL    NOT NULL,
      due         REAL    NOT NULL,
      currency    TEXT,
      updated_at  TEXT    NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    `,
    []
  );

  db.runSync(
    `CREATE INDEX IF NOT EXISTS idx_oil_extra_costs_owner_oil ON oil_extra_costs(owner_id, oil_id);`,
    []
  );
  db.runSync(
    `CREATE INDEX IF NOT EXISTS idx_oil_extra_costs_owner_lot ON oil_extra_costs(owner_id, lot_id);`,
    []
  );
}

export async function upsertExtraCostRows(
  ownerId: number,
  items: ExtraCostUpsert[]
): Promise<void> {
  if (!ownerId || !items.length) return;
  ensureTable();

  db.withTransactionSync(() => {
    for (const it of items) {
      db.runSync(
        `
        INSERT INTO oil_extra_costs (
          owner_id, id, oil_id, lot_id,
          category, description,
          amount, total_paid, due,
          currency, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, id) DO UPDATE SET
          oil_id      = excluded.oil_id,
          lot_id      = excluded.lot_id,
          category    = excluded.category,
          description = excluded.description,
          amount      = excluded.amount,
          total_paid  = excluded.total_paid,
          due         = excluded.due,
          currency    = excluded.currency,
          updated_at  = excluded.updated_at;
        `,
        [
          ownerId,
          it.id,
          it.oil_id ?? null,
          it.lot_id ?? null,
          it.category ?? null,
          it.description ?? null,
          it.amount,
          it.total_paid,
          it.due,
          it.currency ?? null,
          it.updated_at,
        ]
      );
    }
  });
}

export async function listExtraCostRows(
  ownerId: number,
  opts: { oilId?: number | null; lotId?: number | null }
): Promise<ExtraCostRow[]> {
  ensureTable();
  const where: string[] = ['owner_id = ?'];
  const params: any[] = [ownerId];

  if (opts.oilId != null) {
    where.push('oil_id = ?');
    params.push(opts.oilId);
  }
  if (opts.lotId != null) {
    where.push('lot_id = ?');
    params.push(opts.lotId);
  }

  const rows = db.getAllSync<ExtraCostRow>(
    `
      SELECT
        owner_id,
        id,
        oil_id,
        lot_id,
        category,
        description,
        amount,
        total_paid,
        due,
        currency,
        updated_at
      FROM oil_extra_costs
      WHERE ${where.join(' AND ')}
      ORDER BY datetime(updated_at) DESC, id DESC;
    `,
    params
  );

  return rows;
}

export async function deleteExtraCostRow(ownerId: number, id: number): Promise<void> {
  ensureTable();
  db.runSync(`DELETE FROM oil_extra_costs WHERE owner_id = ? AND id = ?`, [ownerId, id]);
}
