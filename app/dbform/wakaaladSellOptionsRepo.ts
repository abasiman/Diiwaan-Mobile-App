// app/dbform/wakaaladSellOptionsRepo.ts
import api from '@/services/api';
import { db } from '../db/db';

export type WakaaladSellOption = {
  wakaalad_id: number;
  oil_id: number;
  oil_type: string;
  wakaalad_name: string;
  truck_plate?: string | null;
  currency?: string | null;

  in_stock_l: number;
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;

  fuusto_capacity_l?: number | null;
  caag_capacity_l?: number | null;
};

type WakaaladSellOptionRow = WakaaladSellOption & {
  owner_id: number;
  updated_at: string;
};

/** Called from RootLayout: just makes sure the table exists. */
export function initWakaaladSellOptionsDb() {
  ensureTable();
}

function ensureTable() {
  db.runSync(
    `
    CREATE TABLE IF NOT EXISTS wakaalad_sell_options (
      owner_id           INTEGER NOT NULL,
      wakaalad_id        INTEGER NOT NULL,
      oil_id             INTEGER NOT NULL,
      oil_type           TEXT    NOT NULL,
      wakaalad_name      TEXT    NOT NULL,
      truck_plate        TEXT,
      currency           TEXT,
      in_stock_l         REAL    NOT NULL,
      liter_price        REAL,
      fuusto_price       REAL,
      caag_price         REAL,
      fuusto_capacity_l  REAL,
      caag_capacity_l    REAL,
      updated_at         TEXT    NOT NULL,
      PRIMARY KEY (owner_id, wakaalad_id)
    );
    `,
    []
  );
}

/** Upsert batch from server (or local helper) into local cache. */
export function upsertWakaaladSellOptionsFromServer(
  ownerId: number,
  items: WakaaladSellOption[]
) {
  if (!ownerId || !items.length) return;
  ensureTable();
  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    for (const it of items) {
      db.runSync(
        `
        INSERT INTO wakaalad_sell_options (
          owner_id, wakaalad_id, oil_id,
          oil_type, wakaalad_name, truck_plate, currency,
          in_stock_l, liter_price, fuusto_price, caag_price,
          fuusto_capacity_l, caag_capacity_l,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id, wakaalad_id) DO UPDATE SET
          oil_id            = excluded.oil_id,
          oil_type          = excluded.oil_type,
          wakaalad_name     = excluded.wakaalad_name,
          truck_plate       = excluded.truck_plate,
          currency          = excluded.currency,
          in_stock_l        = excluded.in_stock_l,
          liter_price       = excluded.liter_price,
          fuusto_price      = excluded.fuusto_price,
          caag_price        = excluded.caag_price,
          fuusto_capacity_l = excluded.fuusto_capacity_l,
          caag_capacity_l   = excluded.caag_capacity_l,
          updated_at        = excluded.updated_at;
        `,
        [
          ownerId,
          it.wakaalad_id,
          it.oil_id,
          it.oil_type,
          it.wakaalad_name,
          it.truck_plate ?? null,
          it.currency ?? null,
          it.in_stock_l,
          it.liter_price ?? null,
          it.fuusto_price ?? null,
          it.caag_price ?? null,
          it.fuusto_capacity_l ?? null,
          it.caag_capacity_l ?? null,
          now,
        ]
      );
    }
  });
}

/** Local read (used by screens). */
export function getWakaaladSellOptionsLocal(
  ownerId: number,
  opts?: {
    onlyAvailable?: boolean;
    qName?: string;
    oilType?: string;
    limit?: number;
  }
): WakaaladSellOption[] {
  ensureTable();
  const where: string[] = ['owner_id = ?'];
  const params: any[] = [ownerId];

  if (opts?.onlyAvailable) {
    where.push('in_stock_l > 0');
  }

  if (opts?.oilType) {
    where.push('LOWER(oil_type) = ?');
    params.push(opts.oilType.toLowerCase());
  }

  if (opts?.qName && opts.qName.trim()) {
    where.push('LOWER(wakaalad_name) LIKE ?');
    params.push(`%${opts.qName.trim().toLowerCase()}%`);
  }

  const limit = opts?.limit ?? 200;
  params.push(limit);

  const rows = db.getAllSync<WakaaladSellOptionRow>(
    `
      SELECT
        owner_id,
        wakaalad_id,
        oil_id,
        oil_type,
        wakaalad_name,
        truck_plate,
        currency,
        in_stock_l,
        liter_price,
        fuusto_price,
        caag_price,
        fuusto_capacity_l,
        caag_capacity_l,
        updated_at
      FROM wakaalad_sell_options
      WHERE ${where.join(' AND ')}
      ORDER BY datetime(updated_at) DESC, wakaalad_id DESC
      LIMIT ?;
    `,
    params
  );

  // 🔹 DEDUPE: group by (oil_type, wakaalad_name, truck_plate), keep newest updated_at
  const map = new Map<string, WakaaladSellOptionRow>();

  for (const r of rows) {
    const key = `${(r.oil_type || '').toLowerCase()}|${(r.wakaalad_name || '').toLowerCase()}|${(r.truck_plate || '').toLowerCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, r);
      continue;
    }

    if (new Date(r.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      map.set(key, r);
    }
  }

  const deduped = Array.from(map.values());

  return deduped.map((r) => ({
    wakaalad_id: r.wakaalad_id,
    oil_id: r.oil_id,
    oil_type: r.oil_type,
    wakaalad_name: r.wakaalad_name,
    truck_plate: r.truck_plate,
    currency: r.currency,
    in_stock_l: r.in_stock_l,
    liter_price: r.liter_price,
    fuusto_price: r.fuusto_price,
    caag_price: r.caag_price,
    fuusto_capacity_l: r.fuusto_capacity_l,
    caag_capacity_l: r.caag_capacity_l,
  }));
}

/**
 * 🔹 Insert/Upsert a single wakaalad sell-option locally.
 * Use this right after creating a wakaalad (online or offline) so
 * getWakaaladSellOptionsLocal() can see it immediately.
 */
export function upsertLocalWakaaladSellOption(args: {
  ownerId: number;
  wakaalad_id: number;
  oil_id: number;
  oil_type: string;
  wakaalad_name: string;
  truck_plate?: string | null;
  currency?: string | null;
  in_stock_l: number;
  liter_price?: number | null;
  fuusto_price?: number | null;
  caag_price?: number | null;
  fuusto_capacity_l?: number | null;
  caag_capacity_l?: number | null;
}) {
  const {
    ownerId,
    wakaalad_id,
    oil_id,
    oil_type,
    wakaalad_name,
    truck_plate,
    currency,
    in_stock_l,
    liter_price,
    fuusto_price,
    caag_price,
    fuusto_capacity_l,
    caag_capacity_l,
  } = args;

  const opt: WakaaladSellOption = {
    wakaalad_id,
    oil_id,
    oil_type,
    wakaalad_name,
    truck_plate: truck_plate ?? null,
    currency: currency ?? null,
    in_stock_l,
    liter_price: liter_price ?? null,
    fuusto_price: fuusto_price ?? null,
    caag_price: caag_price ?? null,
    fuusto_capacity_l: fuusto_capacity_l ?? null,
    caag_capacity_l: caag_capacity_l ?? null,
  };

  upsertWakaaladSellOptionsFromServer(ownerId, [opt]);
}

/** Global sync helper: call this from your RootLayout global sync. */
export async function syncAllWakaaladSellOptions(ownerId: number, token: string) {
  if (!token || !ownerId) return;

  const res = await api.get<WakaaladSellOption[]>('/wakaalad_diiwaan/sell-options', {
    headers: { Authorization: `Bearer ${token}` },
    params: { only_available: true, order: 'created_desc', limit: 1000 },
  });

  upsertWakaaladSellOptionsFromServer(ownerId, res.data || []);
}
