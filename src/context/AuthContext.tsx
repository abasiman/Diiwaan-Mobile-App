import { upsertLocalUser } from '@/app/db/userRepo';
import api from '@/services/api';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';

import { syncAllCustomerInvoices } from '@/app/db/oilsaleSync';
import qs from 'qs';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type AuthUser = {
  id: number;
  username: string;
  email?: string | null;
  company_name?: string | null;
  phone_number?: string | null;
  role?: string | null;
  status?: 'active' | 'inactive' | 'deleted' | string | null;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  username: string;
  userId: number;
  company_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
};

export type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (
    loginOrEmail: string,
    password: string
  ) => Promise<{ userId: number; username: string; role?: string | null; status?: string | null }>;
  signup: (
    username: string,
    email: string | null,
    password: string,
    registration_type?: 'client' | 'seller'
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const TOKEN_KEY = 'userToken';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  const applyAuthHeader = (tok: string | null) => {
    if (tok) {
      api.defaults.headers.common.Authorization = `Bearer ${tok}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  };

  const saveToken = async (tok: string) => {
    console.log('[Auth] saveToken', tok ? '<<non-empty>>' : '<<empty>>');
    setToken(tok);
    applyAuthHeader(tok);
    await SecureStore.setItemAsync(TOKEN_KEY, tok);
  };

  const clearToken = async () => {
    console.log('[Auth] clearToken');
    setToken(null);
    applyAuthHeader(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  };

  // 🔑 real profile loader that uses an explicit token
  const fetchProfileWithToken = async (tok: string) => {
    try {
      console.log('[Auth] fetchProfileWithToken: GET /diiwaan/me');
      const res = await api.get<AuthUser>('/diiwaan/me', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const u = res.data;
      console.log('[Auth] fetchProfileWithToken success', { id: u.id, username: u.username });

      setUser(u);

      upsertLocalUser({
        id: u.id,
        username: u.username,
        company_name: u.company_name,
        role: u.role,
        status: u.status,
      });
    } catch (err: any) {
      console.log(
        '[Auth] fetchProfileWithToken error',
        err?.response?.status,
        err?.response?.data || err?.message
      );
      // do NOT nuke user here; keep whatever we had
    }
  };

  // Public refresh that uses the current token state
  const refreshProfile = async () => {
    if (!token) {
      console.log('[Auth] refreshProfile: no token, clearing user');
      setUser(null);
      return;
    }
    await fetchProfileWithToken(token);
  };

  // Restore token + profile on app start
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        console.log('from secure store', !!saved);
        if (saved) {
          applyAuthHeader(saved);
          setToken(saved);
          // ⚠️ IMPORTANT: use saved token directly, not refreshProfile()
          await fetchProfileWithToken(saved);
        } else {
          console.log('[Auth] no token in secure store');
          setUser(null);
        }
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const signup = async (
    username: string,
    email: string | null,
    password: string,
    _registration_type: 'client' | 'seller' = 'client'
  ) => {
    console.log('[Auth] signup start', { username, email });

    await api.post('/diiwaan/users', {
      username,
      email: email || undefined,
      password,
    });

    const formBody = qs.stringify({
      username,
      password,
      grant_type: 'password',
    });

    const loginResp = await api.post<TokenResponse>('/diiwaan/token', formBody, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await saveToken(loginResp.data.access_token);

    const quickUser: AuthUser = {
      id: loginResp.data.userId,
      username: loginResp.data.username,
      email: loginResp.data.email ?? null,
      company_name: loginResp.data.company_name ?? null,
      phone_number: loginResp.data.phone_number ?? null,
      role: loginResp.data.role ?? null,
      status: loginResp.data.status ?? null,
    };
    console.log('[Auth] signup quickUser', quickUser);
    setUser(quickUser);

    upsertLocalUser({
      id: quickUser.id,
      username: quickUser.username,
      company_name: quickUser.company_name,
      role: quickUser.role,
      status: quickUser.status,
    });

    NetInfo.fetch().then((state) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      console.log('[Auth] signup NetInfo', online);
      if (!online) return;
      if (!quickUser.id) return;

      syncAllCustomerInvoices(quickUser.id, loginResp.data.access_token).catch((err) => {
        console.warn('Initial invoice sync after signup failed', err);
      });
    });

    // Use explicit token to avoid race with setToken
    fetchProfileWithToken(loginResp.data.access_token).catch(() => {});
  };

  const login = async (loginOrEmail: string, password: string) => {
    console.log('[Auth] login start', { loginOrEmail });

    const formBody = qs.stringify({
      username: loginOrEmail,
      password,
      grant_type: 'password',
    });

    const resp = await api.post<TokenResponse>('/diiwaan/token', formBody, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await saveToken(resp.data.access_token);

    const quickUser: AuthUser = {
      id: resp.data.userId,
      username: resp.data.username,
      email: resp.data.email ?? null,
      company_name: resp.data.company_name ?? null,
      phone_number: resp.data.phone_number ?? null,
      role: resp.data.role ?? null,
      status: resp.data.status ?? null,
    };
    console.log('[Auth] login quickUser', quickUser);
    setUser(quickUser);

    upsertLocalUser({
      id: quickUser.id,
      username: quickUser.username,
      company_name: quickUser.company_name,
      role: quickUser.role,
      status: quickUser.status,
    });

    NetInfo.fetch().then((state) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      console.log('[Auth] login NetInfo', online);
      if (!online) return;
      if (!quickUser.id) return;

      syncAllCustomerInvoices(quickUser.id, resp.data.access_token).catch((err) => {
        console.warn('Initial invoice sync after login failed', err);
      });
    });

    // Again: explicit token to avoid race
    fetchProfileWithToken(resp.data.access_token).catch(() => {});

    return {
      userId: quickUser.id,
      username: quickUser.username,
      role: quickUser.role ?? null,
      status: quickUser.status ?? null,
    };
  };

  const logout = async () => {
    console.log('[Auth] logout');
    setUser(null);
    await clearToken();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading: restoring,
        login,
        signup,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
