// app/customers/customerCreateUpdate.ts
import api from '@/services/api';
import {
    createOrUpdateCustomerLocal,
    upsertCustomersFromServer,
    type CustomerRow as Customer,
} from '../db/customerRepo';

export type CustomerFormMode = 'add' | 'edit';

export type CustomerFormPayload = {
  name: string;
  phone: string | null;
  address: string | null;
  status: 'active' | 'inactive' | '';
};

type CreateOrUpdateArgs = {
  formMode: CustomerFormMode;
  payload: CustomerFormPayload;
  online: boolean;
  token: string | null | undefined;
  userId: number;
  selectedCustomer?: Customer | null;
};

/**
 * Reusable create/update customer with full online+offline behavior.
 * - Online: calls FastAPI + upserts into SQLite
 * - Offline: writes only to SQLite (sync will push later)
 */
export async function createOrUpdateCustomer(args: CreateOrUpdateArgs) {
  const { formMode, payload, online, token, userId, selectedCustomer } = args;

  if (!userId) {
    throw new Error('No tenant selected.');
  }

  console.log('[customerCreateUpdate] createOrUpdateCustomer', {
    formMode,
    online,
    hasToken: !!token,
    payload,
    selectedId: selectedCustomer?.id,
    userId,
  });

  if (online && token) {
    // 🔹 ONLINE: hit API, then cache into SQLite
    if (formMode === 'add') {
      const res = await api.post('/diiwaancustomers', payload);
      await upsertCustomersFromServer([res.data], userId);
      console.log('[customerCreateUpdate] created customer on server', res.data?.id);
      return res.data;
    }

    if (formMode === 'edit' && selectedCustomer) {
      const res = await api.patch(
        `/diiwaancustomers/${selectedCustomer.id}`,
        payload
      );
      await upsertCustomersFromServer([res.data], userId);
      console.log('[customerCreateUpdate] updated customer on server', res.data?.id);
      return res.data;
    }

    throw new Error('Edit mode requires selectedCustomer');
  }

  // 🔹 OFFLINE: write to SQLite only; server will get it on next sync
  if (formMode === 'add') {
    const row = createOrUpdateCustomerLocal(payload, userId);
    console.log('[customerCreateUpdate] created customer locally (offline)', row.id);
    return row;
  }

  if (formMode === 'edit' && selectedCustomer) {
    const row = createOrUpdateCustomerLocal(payload, userId, selectedCustomer);
    console.log('[customerCreateUpdate] updated customer locally (offline)', row.id);
    return row;
  }

  throw new Error('Edit mode requires selectedCustomer (offline)');
}
