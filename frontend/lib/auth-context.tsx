"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  clearTokens,
  getRefreshToken,
  getToken,
  onSessionEnded,
  setTokens,
  type SessionEndReason,
} from "./api";
import type { ApiResponse, AuthUser, MePayload, SessionPayload, TenantState } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  /** The signed-in user's school (null for the super admin and when signed out). */
  tenant: TenantState | null;
  loading: boolean;
  /** Where to send someone who is signed out: the sign-in page, saying why when the session was ended for them. */
  loginPath: string;
  /** Signs in and returns the session so the caller can route (see postLoginPath). */
  login: (email: string, password: string, rememberMe?: boolean) => Promise<SessionPayload>;
  /** Stores a session returned by another endpoint (reset-password, accept-invite). */
  applySession: (session: SessionPayload, rememberMe?: boolean) => void;
  /** Re-reads user and school from the server (e.g. to notice an approval). */
  refreshMe: () => Promise<void>;
  /** Signs out. Pass { redirect: false } to stay on the current page (e.g. before accepting an invitation). */
  logout: (options?: { redirect?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const CHANNEL_NAME = "school-erp-auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<TenantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [endedReason, setEndedReason] = useState<SessionEndReason | null>(null);
  const router = useRouter();
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Restore the session on page load.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!getToken() && !getRefreshToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<ApiResponse<MePayload>>("/auth/me");
        if (!cancelled) {
          setUser(res.data.user);
          setTenant(res.data.tenant);
        }
      } catch {
        // A rejected session was already cleared by the API layer. If the server was just
        // unreachable we keep the cookies so a reload can recover; either way, show signed out.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // A session that ended inside any request (refresh rejected, account disabled): go to /login.
  useEffect(() => {
    return onSessionEnded((reason: SessionEndReason) => {
      setEndedReason(reason);
      setUser(null);
      setTenant(null);
      router.replace(`/login?reason=${reason}`);
    });
  }, [router]);

  // Signing out in one tab signs out the others.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data === "logout") {
        setUser(null);
        setTenant(null);
        router.replace("/login");
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [router]);

  const applySession = useCallback((session: SessionPayload, rememberMe = true) => {
    setTokens(session.accessToken, session.refreshToken, rememberMe);
    setEndedReason(null);
    setUser(session.user);
    setTenant(session.tenant);
  }, []);

  const refreshMe = useCallback(async () => {
    const res = await api.get<ApiResponse<MePayload>>("/auth/me");
    setUser(res.data.user);
    setTenant(res.data.tenant);
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberMe = true) => {
      const res = await api.post<ApiResponse<SessionPayload>>(
        "/auth/login",
        { email, password },
        { skipAuthRefresh: true }
      );
      applySession(res.data, rememberMe);
      return res.data;
    },
    [applySession]
  );

  const logout = useCallback(async (options?: { redirect?: boolean }) => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { refreshToken }, { skipAuthRefresh: true });
      } catch {
        // Offline or already expired: signing out locally is what matters.
      }
    }
    clearTokens();
    setUser(null);
    setTenant(null);
    channelRef.current?.postMessage("logout");
    if (options?.redirect !== false) router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, tenant, loading, loginPath: endedReason ? `/login?reason=${endedReason}` : "/login", login, applySession, refreshMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
