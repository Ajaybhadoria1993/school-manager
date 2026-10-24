import { useGetOnboardingQuery } from "../redux/api/onboardingApi";
import type { OnboardingState } from "../types";
import { useAuth } from "./useAuth";

/**
 * What the school admin told us during onboarding. `null` while it loads, and for people who cannot see it.
 * A screen that only needs it sometimes passes `skip`, so it is not asked for when it would not be used.
 */
export function useSchoolProfile(skip = false): OnboardingState | null {
  const { user } = useAuth();
  const isAdmin = user?.role === "school_admin";
  // The summary is a nicety; the pages work without it, so a failed request just leaves it empty.
  const { data } = useGetOnboardingQuery(undefined, { skip: skip || !isAdmin });
  return isAdmin ? (data?.data ?? null) : null;
}
