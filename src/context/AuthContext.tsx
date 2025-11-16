// src/context/AuthContext.tsx
import { upsertLocalUser } from '@/app/db/userRepo';
import api from '@/services/api';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';

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
const USER_KEY = 'authUser';          // 🔹 new

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

  const saveUser = async (u: AuthUser) => {
    setUser(u);
    try {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
    } catch (e) {
      console.warn('[Auth] saveUser failed', e);
    }
  };

  const clearUser = async () => {
    setUser(null);
    try {
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch (e) {
      console.warn('[Auth] clearUser failed', e);
    }
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

      await saveUser(u);

      upsertLocalUser({
        id: u.id,
        username: u.username,
        company_name: u.company_name,
        role: u.role,
        status: u.status,
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.message;
      console.log('[Auth] fetchProfileWithToken error', status, err?.response?.data || message);

      const isNetworkError =
        !status &&
        (err?.code === 'ERR_NETWORK' ||
          message === 'Network Error' ||
          message === 'Network request failed');

      if (status === 401 || status === 403) {
        // 🔴 Token invalid → fully logout
        await clearToken();
        await clearUser();
      } else if (isNetworkError) {
        // ✅ Offline or unreachable → keep cached user & token
        console.log('[Auth] offline / server unreachable, keeping cached auth');
      } else {
        console.warn('[Auth] /diiwaan/me failed, keeping cached user', err?.response?.data || err);
      }
    }
  };

  // Public refresh that uses the current token state
  const refreshProfile = async () => {
    if (!token) {
      console.log('[Auth] refreshProfile: no token, clearing user');
      await clearUser();
      return;
    }
    await fetchProfileWithToken(token);
  };

  // Restore token + user on app start (offline-friendly)
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUserJson] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        console.log('[Auth] restore', { hasToken: !!savedToken, hasUser: !!savedUserJson });

        if (savedToken) {
          applyAuthHeader(savedToken);
          setToken(savedToken);
        }

        if (savedUserJson) {
          try {
            const parsed: AuthUser = JSON.parse(savedUserJson);
            setUser(parsed); // ✅ immediately have user offline
          } catch (e) {
            console.warn('[Auth] failed to parse cached user', e);
          }
        }

        // If we do have a token, try to refresh profile (but this won't nuke on offline)
        if (savedToken) {
          await fetchProfileWithToken(savedToken);
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
    await saveUser(quickUser);

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

  
    });

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
    await saveUser(quickUser);

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

    });

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
    await clearUser();
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
