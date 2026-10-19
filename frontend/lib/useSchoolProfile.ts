"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ApiResponse, OnboardingState } from "@/types";

/** What the school admin told us during onboarding. `null` while it loads, and for people who cannot see it. */
export function useSchoolProfile() {
  const { user } = useAuth();
  const isAdmin = user?.role === "school_admin";
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api
      .get<ApiResponse<OnboardingState>>("/onboarding")
      .then((res) => !cancelled && setState(res.data))
      .catch(() => {
        // The summary is a nicety; the pages work without it.
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return state;
}
