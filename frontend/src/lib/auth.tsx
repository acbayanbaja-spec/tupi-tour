"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearTokens, getTokens, setTokens } from "./api";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "tourist" | "owner" | "admin";
  points: number;
  interests: string[];
  onboardingComplete: boolean;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  budgetPreference?: string;
  tripStyle?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name: string; role: "tourist" | "owner" }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    try {
      const data = await api<{ user: User }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      refreshMe,
      async login(email, password) {
        const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
      },
      async register(input) {
        const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
      },
      async logout() {
        try {
          await api("/api/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: getTokens().refresh }) });
        } catch {
          /* ignore */
        }
        clearTokens();
        setUser(null);
      },
    }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth");
  return ctx;
}
