import api from '@/services/api';
import {
  linkVendorBillsToOil,
  RemoteOilInfo,
} from '../OilPurchaseOffline/oilpurchasevendorbillsrepo';
import {
  getPendingOilModalForms,
  updateOilModalFormStatus,
} from './oilModalRepo';

/**
 * Push all pending/failed oil-create forms to the backend.
 *
 * This function also establishes the mapping:
 *   local_oil_form_id  ->  { lot_id, oil_ids[] }
 *
 * by storing it in the oil-modal row (`remote_ids` JSON), and then calls
 * `linkVendorBillsToOil` so any cached vendor bills that were created
 * against this local form can be patched with the real oil/lot IDs.
 *
 * Call this:
 *  - once after login (GlobalSync)
 *  - whenever the app comes online, if desired
 */
export async function syncPendingOilModalForms(ownerId: number, token: string) {
  if (!ownerId || !token) return;

  // Pending rows == local oil forms that haven't synced yet (or failed before)
  const pending = getPendingOilModalForms(ownerId, 100);
  if (!pending.length) return;

  const headers = { Authorization: `Bearer ${token}` };

  for (const row of pending) {
    try {
      // Mark as "syncing" optimistically
      updateOilModalFormStatus(row.id, 'syncing');

      const payload = JSON.parse(row.payload_json || '{}');

      // Post the original payload we queued when offline
      const res = await api.post('/diiwaanoil', payload, { headers });
      const data = res?.data;

      // This object will hold the REAL backend IDs
      let remoteInfo: RemoteOilInfo = { lot_id: null, oil_ids: [] };

      if (row.mode === 'single') {
        // ---------- SINGLE MODE ----------
        const oil: any = data || {};
        const newId = Number(oil?.id || 0) || 0;

        // Backend usually sets lot_id = id for single, but be defensive.
        let lotId: number | null = null;
        if (Number.isFinite(oil?.lot_id)) {
          lotId = Number(oil.lot_id);
        } else if (newId) {
          lotId = newId;
        }

        remoteInfo = {
          lot_id: lotId,
          oil_ids: newId ? [newId] : [],
        };

        // Attach extras, same behaviour as the online single flow
        const extras = [
          { category: 'truck_rent', amount: row.truck_rent },
          { category: 'depot_cost', amount: row.depot_cost },
          { category: 'tax', amount: row.tax },
        ];

        for (const ex of extras) {
          if (!newId || !ex.amount || ex.amount <= 0) continue;
          try {
            await api.post(
              `/diiwaanoil/${newId}/extra-costs`,
              { category: ex.category, amount: ex.amount, currency: row.currency },
              { headers },
            );
          } catch {
            // non-blocking
          }
        }
      } else {
        // ---------- BOTH MODE ----------
        // Mirror the online "both" behaviour, but also capture lot_id + oil_ids.
        const multi: any = data || {};
        const items: any[] = Array.isArray(multi?.items)
          ? multi.items
          : Array.isArray(multi)
          ? multi
          : [];

        const lotId: number | null =
          Number(multi?.lot_id || items?.[0]?.lot_id || 0) || null;

        const rowsArr = (items || [])
          .map((o) => ({
            oilId: Number(o?.id),
            oilType: String(o?.oil_type || '').toLowerCase(),
            currentPayable: Number(o?.total_landed_cost || 0),
          }))
          .filter(
            (r) =>
              r.oilId &&
              (r.oilType === 'diesel' || r.oilType === 'petrol'),
          );

        const oilIds = rowsArr.map((r) => r.oilId);

        remoteInfo = {
          lot_id: lotId,
          oil_ids: oilIds,
        };

        // Extra costs: post against the first oil row (same as online "both").
        if (rowsArr.length > 0) {
          const firstId = rowsArr[0].oilId;
          const extras = [
            { category: 'truck_rent', amount: row.truck_rent },
            { category: 'depot_cost', amount: row.depot_cost },
            { category: 'tax', amount: row.tax },
          ];
          for (const ex of extras) {
            if (!firstId || !ex.amount || ex.amount <= 0) continue;
            try {
              await api.post(
                `/diiwaanoil/${firstId}/extra-costs`,
                { category: ex.category, amount: ex.amount, currency: row.currency },
                { headers },
              );
            } catch {
              // ignore; non-blocking
            }
          }
        }
      }

      // ✅ This is effectively our "mapping table":
      // local_oil_form_id (row.id) -> { lot_id, oil_ids[] }
      const hasAnyRemote =
        (remoteInfo.lot_id !== null && remoteInfo.lot_id !== undefined) ||
        (remoteInfo.oil_ids && remoteInfo.oil_ids.length > 0);

      updateOilModalFormStatus(row.id, 'synced', {
        remote_ids: hasAnyRemote ? JSON.stringify(remoteInfo) : null,
        error: null,
      });

      // 🔗 Patch cached vendor bills that were created from this offline form
      // (They stored local_oil_form_id=row.id; this call injects the real IDs.)
      await linkVendorBillsToOil(row.owner_id, row.id, remoteInfo);
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Failed to sync oil modal form';

      updateOilModalFormStatus(row.id, 'failed', { error: String(msg) });
    }
  }
}
