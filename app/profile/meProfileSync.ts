// app/db/meProfileSync.ts
import api from '@/services/api';
import { upsertMeFromServer, type MeProfile } from './meProfileRepo';

export async function syncMeProfile(token: string) {
  if (!token) return;

  try {
    const res = await api.get<MeProfile>('/diiwaan/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    upsertMeFromServer(res.data);
  } catch (e) {
    console.warn('syncMeProfile failed', e);
  }
}
