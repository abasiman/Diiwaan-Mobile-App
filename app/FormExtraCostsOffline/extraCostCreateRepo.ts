///extraCostCreateRepo.ts
import {
  ExtraCostCreateRow,
  deleteQueuedExtraCost,
  insertQueuedExtraCost,
  listQueuedExtraCosts,
  setQueuedExtraCostError,
} from './extraCostCreateDb';

export type ExtraCostCreateInput = {
  category: string;
  amountUsd: number;
  currencyKey?: string | null;
  exchangeToUsd?: number | null;
  perBarrel?: number | null;
  qtyBarrel?: number | null;
};

export type ExtraCostCreateQueued = ExtraCostCreateRow;

/** Queue a new extra-cost create payload for later sync. */
export function queueExtraCostForSync(
  ownerId: number,
  anchorId: number,
  input: ExtraCostCreateInput
): void {
  if (!ownerId || !anchorId) return;
  if (!input.category.trim() || !(input.amountUsd > 0)) return;

  insertQueuedExtraCost({
    ownerId,
    anchorId,
    category: input.category.trim(),
    amountUsd: input.amountUsd,
    currencyKey: input.currencyKey ?? null,
    exchangeToUsd: input.exchangeToUsd ?? null,
    perBarrel: input.perBarrel ?? null,
    qtyBarrel: input.qtyBarrel ?? null,
  });
}

/** Used by sync worker. */
export function getQueuedExtraCosts(ownerId: number): ExtraCostCreateQueued[] {
  if (!ownerId) return [];
  return listQueuedExtraCosts(ownerId);
}

export function clearQueuedExtraCost(ownerId: number, id: number): void {
  if (!ownerId || !id) return;
  deleteQueuedExtraCost(ownerId, id);
}

export function recordExtraCostQueueError(ownerId: number, id: number, message: string): void {
  if (!ownerId || !id) return;
  setQueuedExtraCostError(ownerId, id, message);
}
