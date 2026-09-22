"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken, clearToken, ApiRequestError } from "./api";
import { disconnectSocket } from "./socket";
import type { ApiResponse, AuthUser } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const hydrate = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<ApiResponse<AuthUser & { _id: string }>>("/auth/me");
      const u = res.data;
      setUser({
        id: u._id ?? u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        tenantId: u.tenantId,
        branchId: u.branchId,
      });
    } catch {
      clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await api.post<ApiResponse<{ token: string; user: AuthUser }>>("/auth/login", {
          email,
          password,
        });
        setToken(res.data.token);
        setUser(res.data.user);
        router.push("/dashboard");
      } catch (err) {
        if (err instanceof ApiRequestError) throw err;
        throw new Error("Unable to sign in right now");
      }
    },
    [router]
  );

  const logout = useCallback(() => {
    clearToken();
    disconnectSocket();
    setUser(null);
    router.push("/login");
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
