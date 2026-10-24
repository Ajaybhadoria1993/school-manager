import { useGetTenantCountsQuery } from "../redux/api/tenantApi";
import { useAuth } from "./useAuth";

const POLL_MS = 60_000;

/**
 * The "waiting for approval" number in the sidebar, for the super admin only (0 for everyone else).
 * It is asked again every minute while the tab is visible, and whenever a school is invited or decided
 * (those requests mark the counts as stale, see redux/api/tenantApi.ts).
 */
export function usePending() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const { data } = useGetTenantCountsQuery(undefined, {
    skip: !isSuperAdmin,
    pollingInterval: POLL_MS,
    skipPollingIfUnfocused: true,
  });
  // The badge is a convenience: if the call fails the number just stays as it was.
  return { pending: isSuperAdmin ? (data?.data.pending ?? 0) : 0 };
}
