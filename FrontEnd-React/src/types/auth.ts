import type { TenantState } from "./tenant";

export type UserRole =
  | "super_admin"
  | "school_admin"
  | "principal"
  | "accountant"
  | "teacher"
  | "parent"
  | "student";

/** The user as the API returns it (never contains a password or hash). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  emailVerifiedAt: string | null;
}

/** Returned by login, reset-password and accept-invite. */
export interface SessionPayload {
  user: AuthUser;
  tenant: TenantState | null;
  accessToken: string;
  refreshToken: string;
  /** Alias of accessToken. */
  token: string;
}

export interface MePayload {
  user: AuthUser;
  tenant: TenantState | null;
}

/** What the accept-invite page shows before the admin chooses a password. */
export interface InviteInfo {
  email: string;
  schoolName: string;
  expiresAt: string;
  /** "invite": the platform team invited this school. "signup": the visitor registered from the login page. */
  kind: "invite" | "signup";
}

/** Why a session was ended for the user (shown on the sign-in page). */
export type SessionEndReason = "expired" | "disabled" | "suspended";
