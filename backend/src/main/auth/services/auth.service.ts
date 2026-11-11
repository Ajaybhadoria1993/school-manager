import { ApiError } from "../../../utils/ApiError";
import { comparePassword, getDummyHash } from "../../../utils/authUtils";
import { User, toPublicUser, type PublicUser } from "../../users/models/User";
import { PermissionService } from "../../permissions/services/permission.service";
import { MediumService } from "../../tenants/services/medium.service";
import { loadTenantState, type TenantState } from "../../tenants/services/tenantState";
import { TokenService, type SessionMeta } from "./token.service";

/** The school of a session. Its administrator, and a teacher who teaches in more than one medium, are also told the mediums they can move between. */
async function sessionTenant(user: { _id: { toString(): string }; tenantId?: Parameters<typeof loadTenantState>[0]; role: string }): Promise<TenantState | null> {
  const tenant = await loadTenantState(user.tenantId);
  if (!tenant) return tenant;
  if (user.role === "school_admin") return { ...tenant, mediums: await MediumService.forSession(tenant.id) };
  if (user.role === "teacher") return { ...tenant, mediums: await MediumService.forTeacher(tenant.id, user._id.toString()) };
  return tenant;
}

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

/** The person as a session shows them: with what they may do. */
async function sessionUser(user: SessionUser): Promise<PublicUser> {
  const base = toPublicUser(user);
  return { ...base, permissions: await PermissionService.grantedTo({ userId: base.id, role: base.role, tenantId: base.tenantId }) };
}

export async function buildSession(user: SessionUser, meta: SessionMeta): Promise<SessionPayload> {
  const [{ accessToken, refreshToken }, tenant] = await Promise.all([
    TokenService.issueTokenPair(user, meta),
    sessionTenant(user),
  ]);
  return { user: await sessionUser(user), tenant, accessToken, refreshToken, token: accessToken };
}

export class AuthService {
  /** `identifier` is an email or a username, already trimmed and lower-cased (an email has the @, a username never can). */
  static async login(identifier: string, password: string, meta: SessionMeta): Promise<SessionPayload> {
    const user = await User.findOne(identifier.includes("@") ? { email: identifier } : { username: identifier });

    // Unknown email or username and wrong password must be indistinguishable (same message, similar timing).
    const passwordOk = await comparePassword(password, user ? user.passwordHash : await getDummyHash());
    if (!user || !passwordOk) {
      throw ApiError.unauthorized("Invalid email/username or password");
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
    return { user: await sessionUser(user), tenant: await sessionTenant(user) };
  }
}
