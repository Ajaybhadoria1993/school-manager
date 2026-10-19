"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ApiResponse, StatusCounts } from "@/types";

interface PendingContextValue {
  /** Schools waiting for the super admin's decision (0 for everyone else). */
  pending: number;
  /** Ask the server again, e.g. right after approving or rejecting. */
  refresh: () => void;
}

const PendingContext = createContext<PendingContextValue>({
  pending: 0,
  refresh: () => {},
});

const POLL_MS = 60_000;

/** Keeps the "waiting for approval" number in the sidebar fresh, for the super admin only. */
export function PendingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [pending, setPending] = useState(0);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await api.get<ApiResponse<StatusCounts>>("/tenants/counts");
        if (!cancelled) setPending(res.data.pending);
      } catch {
        // The badge is a convenience: if the call fails the number just stays as it was.
      }
    }

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isSuperAdmin, tick]);

  const value = useMemo(
    () => ({ pending: isSuperAdmin ? pending : 0, refresh }),
    [isSuperAdmin, pending, refresh],
  );
  return (
    <PendingContext.Provider value={value}>{children}</PendingContext.Provider>
  );
}

export function usePending() {
  return useContext(PendingContext);
}
