import type { AuthUser, TenantState } from "@/types";

/**
 * Where a signed-in user belongs. One place, used by login, reset-password, accept-invite,
 * the already-signed-in redirects and the layout guards.
 *
 * A school admin whose school is not approved yet belongs on the onboarding page: they can
 * set up and wait there, and the API refuses everything else for them anyway.
 */
export function postLoginPath(user: AuthUser, tenant: TenantState | null): string {
  if (user.role === "school_admin" && tenant && tenant.approvalStatus !== "approved") {
    return "/onboarding";
  }
  return "/dashboard";
}
