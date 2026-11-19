import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { StaffMember } from "../../staff/models/StaffMember";
import { Tenant } from "../../tenants/models/Tenant";
import {
  DEFAULT_PERMISSIONS,
  FULL_ACCESS_ROLES,
  IMPLIES,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PROFILES,
  PROFILE_KEYS,
  PROFILE_OF_ROLE,
  permissionsFor,
  type ProfileDef,
} from "../constants";
import { RolePermission } from "../models/RolePermission";

export interface ProfileAnswer {
  key: string;
  label: string;
  kind: ProfileDef["kind"];
  /** The permissions the kind has now (the school's choice, or the usual list). */
  permissions: string[];
  /** The permissions that can be given to this kind (the rest are not offered). */
  offered: string[];
  /** True while the school has not chosen: the usual list. */
  isDefault: boolean;
}

/** Adds what a permission needs ("Add students" needs "See students"), keeps each once, in the order of the catalogue. */
export function withImplied(keys: readonly string[]): string[] {
  const wanted = new Set(keys);
  for (const key of keys) {
    const needed = IMPLIES[key];
    if (needed) wanted.add(needed);
  }
  return PERMISSION_KEYS.filter((k) => wanted.has(k));
}

const NO_SUCH_PROFILE = () => ApiError.notFound("There is no such kind of person.", "PROFILE_NOT_FOUND");

export class PermissionService {
  /** The school the permissions belong to: a side of the school (a medium) follows the school itself. */
  private static async rootOf(tenantId: string): Promise<Types.ObjectId> {
    const tenant = await Tenant.findById(tenantId).select("parentTenantId").lean();
    return tenant?.parentTenantId ?? new Types.ObjectId(tenantId);
  }

  /** The kind of person this login is, or null (nobody: no permissions). The school admin and the principal are not a kind: they can do everything. */
  static async profileOf(user: { userId: string; role: string; tenantId: string | null }): Promise<string | null> {
    const direct = PROFILE_OF_ROLE[user.role];
    if (direct) return direct;
    if (user.role !== "staff" || !user.tenantId) return null;
    // A staff login of any other kind: their own role (Librarian, Driver...), found from the person; a role the school wrote is "other".
    const member = await StaffMember.findOne({ tenantId: new Types.ObjectId(user.tenantId), userId: new Types.ObjectId(user.userId) }).select("role").lean();
    return member?.role && PROFILE_KEYS.includes(member.role) ? member.role : "other";
  }

  /** What a kind of person may do in a school: the school's choice, or the usual list. */
  static async keysFor(tenantId: string, profile: string): Promise<{ keys: string[]; isDefault: boolean }> {
    const school = await PermissionService.rootOf(tenantId);
    const saved = await RolePermission.findOne({ tenantId: school, profile }).select("permissions").lean();
    if (!saved) return { keys: [...(DEFAULT_PERMISSIONS[profile] ?? [])], isDefault: true };
    return { keys: saved.permissions, isDefault: false };
  }

  /** What this login may do. Everything for the school admin and the principal; nothing for a login with no kind. */
  static async grantedTo(user: { userId: string; role: string; tenantId: string | null }): Promise<string[]> {
    if (FULL_ACCESS_ROLES.includes(user.role)) return [...PERMISSION_KEYS];
    if (!user.tenantId) return [];
    const profile = await PermissionService.profileOf(user);
    if (!profile) return [];
    const offered = new Set(permissionsFor(PROFILES.find((p) => p.key === profile)!.kind));
    return (await PermissionService.keysFor(user.tenantId, profile)).keys.filter((k) => offered.has(k));
  }

  /** The page: every kind of person with what they may do, and the catalogue of what can be given. */
  static async overview(tenantId: string) {
    const school = await PermissionService.rootOf(tenantId);
    const saved = new Map((await RolePermission.find({ tenantId: school }).select("profile permissions").lean()).map((r) => [r.profile, r.permissions]));
    const profiles: ProfileAnswer[] = PROFILES.map((p) => ({
      key: p.key,
      label: p.label,
      kind: p.kind,
      permissions: saved.get(p.key) ?? [...(DEFAULT_PERMISSIONS[p.key] ?? [])],
      offered: [...permissionsFor(p.kind)],
      isDefault: !saved.has(p.key),
    }));
    return { groups: PERMISSION_GROUPS, profiles };
  }

  /** Saves what one kind of person may do: only what can be given to them, with what each needs added. */
  static async save(tenantId: string, profileKey: string, keys: readonly string[], actorId: string): Promise<ProfileAnswer> {
    const profile = PROFILES.find((p) => p.key === profileKey);
    if (!profile) throw NO_SUCH_PROFILE();
    const offered = new Set(permissionsFor(profile.kind));
    const unknown = keys.filter((k) => !offered.has(k));
    if (unknown.length > 0) {
      throw ApiError.badRequest(`${profile.label} cannot be given: ${unknown.join(", ")}.`, "PERMISSION_NOT_OFFERED", [{ path: "permissions", message: "Choose from the list" }]);
    }
    const permissions = withImplied(keys);
    const school = await PermissionService.rootOf(tenantId);
    await RolePermission.updateOne(
      { tenantId: school, profile: profile.key },
      { $set: { permissions, updatedBy: new Types.ObjectId(actorId) } },
      { upsert: true }
    );
    return { key: profile.key, label: profile.label, kind: profile.kind, permissions, offered: [...offered], isDefault: false };
  }

  /** Back to the usual list. */
  static async reset(tenantId: string, profileKey: string): Promise<ProfileAnswer> {
    const profile = PROFILES.find((p) => p.key === profileKey);
    if (!profile) throw NO_SUCH_PROFILE();
    const school = await PermissionService.rootOf(tenantId);
    await RolePermission.deleteOne({ tenantId: school, profile: profile.key });
    return { key: profile.key, label: profile.label, kind: profile.kind, permissions: [...(DEFAULT_PERMISSIONS[profile.key] ?? [])], offered: [...permissionsFor(profile.kind)], isDefault: true };
  }
}
