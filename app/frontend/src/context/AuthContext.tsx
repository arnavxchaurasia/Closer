import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { api } from '@/src/api';
import { storage } from '@/src/utils/storage';

export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  avatar_url?: string;
  bio?: string;
  birthday?: string;
  location_city?: string;
}

interface LoginResponse {
  session_token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name: string): Promise<void>;
  logout(): Promise<void>;
  updateUser(updates: Partial<AuthUser>): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clerkLoaded) return;

      if (isSignedIn && clerkUser) {
        try {
          const token = await getToken();
          if (token) {
            await storage.secureSet('session_token', token);
          }
        } catch {}

        const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress ?? '';
        const name = clerkUser.fullName || clerkUser.firstName || primaryEmail.split('@')[0] || 'User';

        const mappedUser: AuthUser = {
          user_id: clerkUser.id,
          email: primaryEmail,
          name,
          avatar_url: clerkUser.imageUrl,
        };

        if (!cancelled) {
          setUser(mappedUser);
          setIsLoading(false);
        }
        return;
      }

      // Check legacy session storage if Clerk not signed in
      try {
        const token = await storage.secureGet('session_token', null);
        if (!token) {
          if (!cancelled) { setUser(null); setIsLoading(false); }
          return;
        }
        const me = await api.get<AuthUser>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        await storage.secureRemove('session_token');
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, isSignedIn, clerkUser, getToken]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<LoginResponse>('/api/auth/login', {
      email,
      password,
    });
    await storage.secureSet('session_token', response.session_token);
    setUser(response.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const response = await api.post<LoginResponse>('/api/auth/register', {
        email,
        password,
        name,
      });
      await storage.secureSet('session_token', response.session_token);
      setUser(response.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (isSignedIn) {
        await clerkSignOut();
      } else {
        await api.post('/api/auth/logout');
      }
    } catch {
      // Best-effort logout
    } finally {
      await storage.secureRemove('session_token');
      setUser(null);
    }
  }, [isSignedIn, clerkSignOut]);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
