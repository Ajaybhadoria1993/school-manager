import { ApiError } from "../../../utils/ApiError";
import { comparePassword, getDummyHash } from "../../../utils/authUtils";
import { User, toPublicUser, type PublicUser } from "../../users/models/User";
import { loadTenantState, type TenantState } from "../../tenants/services/tenantState";
import { TokenService, type SessionMeta } from "./token.service";

/**
 * What login, reset-password and accept-invite return: the user, their school (null for the
 * super admin) and a fresh token pair.
 */
export interface SessionPayload {
  user: PublicUser;
  tenant: TenantState | null;
  accessToken: string;
  refreshToken: string;
  /** Alias of accessToken, kept for simple clients. */
  token: string;
}

type SessionUser = Parameters<typeof toPublicUser>[0];

const TENANT_INACTIVE = () =>
  ApiError.forbidden("This school account is suspended. Please contact the platform administrator.", "TENANT_INACTIVE");

/** A suspended school cannot sign in. (A school still waiting for approval can: it must reach onboarding.) */
export async function assertTenantActive(tenantId: Parameters<typeof loadTenantState>[0]): Promise<void> {
  if (!tenantId) return;
  const tenant = await loadTenantState(tenantId);
  if (!tenant || !tenant.isActive) throw TENANT_INACTIVE();
}

export async function buildSession(user: SessionUser, meta: SessionMeta): Promise<SessionPayload> {
  const [{ accessToken, refreshToken }, tenant] = await Promise.all([
    TokenService.issueTokenPair(user, meta),
    loadTenantState(user.tenantId),
  ]);
  return { user: toPublicUser(user), tenant, accessToken, refreshToken, token: accessToken };
}

export class AuthService {
  static async login(email: string, password: string, meta: SessionMeta): Promise<SessionPayload> {
    const user = await User.findOne({ email });

    // Unknown email and wrong password must be indistinguishable (same message, similar timing).
    const passwordOk = await comparePassword(password, user ? user.passwordHash : await getDummyHash());
    if (!user || !passwordOk) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw ApiError.forbidden("Your account has been disabled. Please contact your administrator.", "ACCOUNT_DISABLED");
    }

    await assertTenantActive(user.tenantId);

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    return buildSession(user, meta);
  }

  static async refresh(refreshToken: string, meta: SessionMeta) {
    const pair = await TokenService.rotate(refreshToken, meta);
    return { ...pair, token: pair.accessToken };
  }

  static logout(refreshToken: string): Promise<void> {
    return TokenService.revoke(refreshToken);
  }

  static async me(userId: string): Promise<{ user: PublicUser; tenant: TenantState | null }> {
    const user = await User.findById(userId);
    if (!user) throw ApiError.unauthorized("User not found");
    return { user: toPublicUser(user), tenant: await loadTenantState(user.tenantId) };
  }
}
