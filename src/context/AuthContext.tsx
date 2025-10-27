// context/AuthContext.tsx
import api from '@/services/api';
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
    setToken(tok);
    applyAuthHeader(tok);
    await SecureStore.setItemAsync(TOKEN_KEY, tok);
  };

  const clearToken = async () => {
    setToken(null);
    applyAuthHeader(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  };

 
  const refreshProfile = async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get<AuthUser>('/diiwaan/me');
      setUser(res.data);
    } catch {
    
      setUser(null);
    }
  };


  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          setToken(saved);
          applyAuthHeader(saved);
          await refreshProfile();
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

    setUser({
      id: loginResp.data.userId,
      username: loginResp.data.username,
      email: loginResp.data.email ?? null,
      company_name: loginResp.data.company_name ?? null,
      phone_number: loginResp.data.phone_number ?? null,
      role: loginResp.data.role ?? null,
      status: loginResp.data.status ?? null,
    });

  
    refreshProfile().catch(() => {});
  };


  const login = async (loginOrEmail: string, password: string) => {
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
    setUser(quickUser);

    
    refreshProfile().catch(() => {});

   
    return {
      userId: quickUser.id,
      username: quickUser.username,
      role: quickUser.role ?? null,
      status: quickUser.status ?? null,
    };
  };

  const logout = async () => {
    setUser(null);
    await clearToken();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
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
