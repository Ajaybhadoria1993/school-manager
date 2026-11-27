import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { STAFF_MEMBER_ROLES } from "../../staff/constants";
import { StaffMember } from "../../staff/models/StaffMember";
import { Tenant } from "../../tenants/models/Tenant";
import { recordsOfSchool } from "../../tenants/services/schoolSides";
import {
  DEFAULT_PERMISSIONS,
  FULL_ACCESS_ROLES,
  IMPLIES,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PROFILES,
  PROFILE_KEYS,
  PROFILE_OF_ROLE,
  isNamedRoleKey,
  kindOfProfile,
  namedRoleKey,
  permissionsFor,
  type ProfileDef,
} from "../constants";
import { CustomRole } from "../models/CustomRole";
import { RolePermission } from "../models/RolePermission";

export interface ProfileAnswer {
  key: string;
  label: string;
  kind: ProfileDef["kind"];
  /** The permissions the kind has now (the school's choice, or the usual list). */
  permissions: string[];
  /** The permissions that can be given to this kind (the rest are not offered). */
  offered: string[];
  /** True while the school has not chosen: the usual list (for a role the school named, the list of Other roles). */
  isDefault: boolean;
  /** A role the school named: made on the Permissions page (it can be deleted while nobody has it), or only typed in Add staff > Other. */
  custom?: boolean;
  /** A role the school named: how many of the staff (not inactive) have it. */
  people?: number;
}

/** What a login may do, and which of it works on the whole school's pages (the rest: in their own classes, or for their own children). */
export interface Access {
  permissions: string[];
  schoolPermissions: string[];
}

/** A role the school named (made on the Permissions page, or typed in Add staff > Other) with whether it was made and how many have it. */
export interface NamedRole extends ProfileDef {
  custom: boolean;
  people: number;
}

/** A role's name as it is kept: spaces made one. */
const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
/** Names a role the school makes cannot take: the usual kinds (Librarian, Teacher...) and the words of this page. */
const TAKEN_NAMES: ReadonlySet<string> = new Set(
  [...STAFF_MEMBER_ROLES.flatMap((r) => [r.label, r.key.replace(/_/g, " ")]), ...PROFILES.map((p) => p.label), "Teacher", "Class teacher", "Parent", "School admin", "Student"].map((n) => cleanName(n).toLowerCase())
);

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

  /**
   * The roles the school named itself, A to Z: the ones it made on the Permissions page (even while nobody has them), and the ones typed in Add staff
   * > Other that someone of the school has (not inactive), on any of its mediums. Each once however it was typed, by the name the school made it
   * with, else as it was first written; with how many of the staff (not inactive) have it.
   */
  static async namedRoles(tenantId: string): Promise<NamedRole[]> {
    const [school, records] = await Promise.all([PermissionService.rootOf(tenantId), recordsOfSchool(tenantId)]);
    const [made, staffRows] = await Promise.all([
      CustomRole.find({ tenantId: school }).select("name profile").sort({ _id: 1 }).lean(),
      Promise.all(records.map((id) => StaffMember.find({ tenantId: id, role: "other", roleOther: { $ne: null }, status: { $ne: "inactive" } }).select("roleOther").lean())),
    ]);
    const found = new Map<string, NamedRole>(made.map((r) => [r.profile, { key: r.profile, label: r.name, kind: "staff" as const, custom: true, people: 0 }]));
    const rows = staffRows.flat().sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    for (const row of rows) {
      const name = cleanName(row.roleOther ?? "");
      if (!name) continue;
      const key = namedRoleKey(name);
      const role = found.get(key) ?? { key, label: name, kind: "staff" as const, custom: false, people: 0 };
      role.people += 1;
      found.set(key, role);
    }
    return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Add staff's Role list: the roles the school named, A to Z. */
  static async roleChoices(tenantId: string): Promise<{ items: { key: string; label: string }[] }> {
    return { items: (await PermissionService.namedRoles(tenantId)).map((r) => ({ key: r.key, label: r.label })) };
  }

  /** The answer for one role the school named: what it may do now (its own list, or Other roles'), with whether it was made and how many have it. */
  private static async namedAnswer(tenantId: string, role: NamedRole): Promise<ProfileAnswer> {
    const { keys, isDefault } = await PermissionService.keysFor(tenantId, role.key);
    return { key: role.key, label: role.label, kind: "staff", permissions: keys, offered: [...permissionsFor("staff")], isDefault, custom: role.custom, people: role.people };
  }

  /**
   * The school admin makes a role with its name (2026-11-26): it follows Other roles until the school chooses for it. Not a name made already, nor
   * one of the usual kinds (Librarian, Teacher...: those are chosen in Add staff as they are).
   */
  static async createRole(tenantId: string, name: string, actorId: string): Promise<ProfileAnswer> {
    const label = cleanName(name);
    if (TAKEN_NAMES.has(label.toLowerCase())) {
      throw ApiError.conflict(`${label} is already a role: choose it in Add staff.`, "ROLE_NAME_TAKEN", [{ path: "name", message: "This is already a role" }]);
    }
    const school = await PermissionService.rootOf(tenantId);
    const profile = namedRoleKey(label);
    const exists = () => ApiError.conflict(`There is already a role called ${label}.`, "ROLE_EXISTS", [{ path: "name", message: "There is already a role with this name" }]);
    if (await CustomRole.exists({ tenantId: school, profile })) throw exists();
    try {
      await CustomRole.create({ tenantId: school, name: label, profile, createdBy: new Types.ObjectId(actorId) });
    } catch (err) {
      // Made a moment ago by another request: the unique index settles it.
      if ((err as { code?: number }).code === 11000) throw exists();
      throw err;
    }
    const role = (await PermissionService.namedRoles(tenantId)).find((r) => r.key === profile)!;
    return PermissionService.namedAnswer(tenantId, role);
  }

  /** The school admin deletes a role it made, with what it may do, while nobody (not inactive) has it. A name only typed in Add staff is not one. */
  static async deleteRole(tenantId: string, key: string): Promise<{ key: string }> {
    const school = await PermissionService.rootOf(tenantId);
    const role = (await PermissionService.namedRoles(tenantId)).find((r) => r.key === key && r.custom);
    if (!role) throw ApiError.notFound("There is no such role.", "ROLE_NOT_FOUND");
    if (role.people > 0) {
      throw ApiError.conflict(
        `${role.people} of the staff ${role.people === 1 ? "has" : "have"} the role ${role.label}: give ${role.people === 1 ? "them" : "each"} another role first.`,
        "ROLE_IN_USE"
      );
    }
    await Promise.all([CustomRole.deleteOne({ tenantId: school, profile: key }), RolePermission.deleteOne({ tenantId: school, profile: key })]);
    return { key };
  }

  /** A kind of person of this school: one of the usual kinds, or a role the school named (made, or that someone has). */
  private static async profileDef(tenantId: string, key: string): Promise<ProfileDef | null> {
    const usual = PROFILES.find((p) => p.key === key);
    if (usual) return usual;
    if (!isNamedRoleKey(key)) return null;
    return (await PermissionService.namedRoles(tenantId)).find((p) => p.key === key) ?? null;
  }

  /** The kind of a staff member's role: their own role (Librarian, Driver...); a role the school named is a kind of its own. */
  private static staffProfileOf(member: { role?: string | null; roleOther?: string | null } | null): string {
    if (member?.role === "other" && member.roleOther?.trim()) return namedRoleKey(member.roleOther);
    return member?.role && PROFILE_KEYS.includes(member.role) ? member.role : "other";
  }

  /**
   * The staff role of a teacher's login, or null for a teacher who is only a teacher: a staff member who also teaches (Add staff > Also a
   * teacher: a Coordinator who takes a class) signs in as a teacher, and keeps their role (2026-11-26). Their staff record is on the side of
   * the school the login belongs to (`homeTenantId` when the request was moved to another medium).
   */
  private static async staffRoleOfTeacher(user: { userId: string; tenantId: string | null; homeTenantId?: string }): Promise<string | null> {
    const home = user.homeTenantId ?? user.tenantId;
    if (!home || !Types.ObjectId.isValid(user.userId)) return null;
    const member = await StaffMember.findOne({ tenantId: new Types.ObjectId(home), userId: new Types.ObjectId(user.userId) }).select("role roleOther").lean();
    return member ? PermissionService.staffProfileOf(member) : null;
  }

  /** The kind of person this login is, or null (nobody: no permissions). The school admin and the principal are not a kind: they can do everything. */
  static async profileOf(user: { userId: string; role: string; tenantId: string | null }): Promise<string | null> {
    const direct = PROFILE_OF_ROLE[user.role];
    if (direct) return direct;
    if (user.role !== "staff" || !user.tenantId) return null;
    // A staff login of any other kind: their own role (Librarian, Driver...), found from the person.
    const member = await StaffMember.findOne({ tenantId: new Types.ObjectId(user.tenantId), userId: new Types.ObjectId(user.userId) }).select("role roleOther").lean();
    return PermissionService.staffProfileOf(member);
  }

  /** What a kind of person may do in a school: the school's choice, or the usual list (a role the school named: what Other roles may do). */
  static async keysFor(tenantId: string, profile: string): Promise<{ keys: string[]; isDefault: boolean }> {
    const school = await PermissionService.rootOf(tenantId);
    const saved = await RolePermission.findOne({ tenantId: school, profile }).select("permissions").lean();
    if (saved) return { keys: saved.permissions, isDefault: false };
    if (isNamedRoleKey(profile)) return { keys: (await PermissionService.keysFor(tenantId, "other")).keys, isDefault: true };
    return { keys: [...(DEFAULT_PERMISSIONS[profile] ?? [])], isDefault: true };
  }

  /** What a kind may do, only what can be given to it. */
  private static async offeredKeysFor(tenantId: string, profileKey: string): Promise<string[]> {
    const kind = kindOfProfile(profileKey);
    if (!kind) return [];
    const offered = new Set(permissionsFor(kind));
    return (await PermissionService.keysFor(tenantId, profileKey)).keys.filter((k) => offered.has(k));
  }

  /**
   * What this login may do (`permissions`), and which of it works on the WHOLE school's pages (`schoolPermissions`). Everything for the school
   * admin and the principal; nothing for a login with no kind. A teacher has the Teacher list and the Class teacher list together, in their own
   * classes only (what is on the second, only in the class they are the class teacher of); a teacher who is also on the staff (a Coordinator
   * who takes a class) has their role's list too, and that list is what works on the whole school (2026-11-26). A staff login's list is all
   * about the whole school; a parent's is about their own children.
   */
  static async accessOf(user: { userId: string; role: string; tenantId: string | null; homeTenantId?: string }): Promise<Access> {
    if (FULL_ACCESS_ROLES.includes(user.role)) return { permissions: [...PERMISSION_KEYS], schoolPermissions: [...PERMISSION_KEYS] };
    if (!user.tenantId) return { permissions: [], schoolPermissions: [] };
    const tenantId = user.tenantId;
    if (user.role === "teacher") {
      const staffRole = await PermissionService.staffRoleOfTeacher(user);
      const [teacher, classTeacher, staff] = await Promise.all([
        PermissionService.offeredKeysFor(tenantId, "teacher"),
        PermissionService.offeredKeysFor(tenantId, "class_teacher"),
        staffRole ? PermissionService.offeredKeysFor(tenantId, staffRole) : Promise.resolve([]),
      ]);
      const granted = new Set([...teacher, ...classTeacher, ...staff]);
      return { permissions: PERMISSION_KEYS.filter((k) => granted.has(k)), schoolPermissions: staff };
    }
    const profile = await PermissionService.profileOf(user);
    if (!profile) return { permissions: [], schoolPermissions: [] };
    const permissions = await PermissionService.offeredKeysFor(tenantId, profile);
    return { permissions, schoolPermissions: user.role === "parent" || user.role === "student" ? [] : permissions };
  }

  /** What this login may do (see accessOf). */
  static async grantedTo(user: { userId: string; role: string; tenantId: string | null; homeTenantId?: string }): Promise<string[]> {
    return (await PermissionService.accessOf(user)).permissions;
  }

  /** The page: every kind of person with what they may do (the roles the school named after Other roles), and the catalogue of what can be given. */
  static async overview(tenantId: string) {
    const school = await PermissionService.rootOf(tenantId);
    const [savedRows, named] = await Promise.all([RolePermission.find({ tenantId: school }).select("profile permissions").lean(), PermissionService.namedRoles(tenantId)]);
    const saved = new Map(savedRows.map((r) => [r.profile, r.permissions]));
    const otherRoles = saved.get("other") ?? [...(DEFAULT_PERMISSIONS.other ?? [])];
    const kinds: (ProfileDef & Partial<Pick<NamedRole, "custom" | "people">>)[] = [...PROFILES, ...named];
    const profiles: ProfileAnswer[] = kinds.map((p) => ({
      key: p.key,
      label: p.label,
      kind: p.kind,
      permissions: saved.get(p.key) ?? (isNamedRoleKey(p.key) ? [...otherRoles] : [...(DEFAULT_PERMISSIONS[p.key] ?? [])]),
      offered: [...permissionsFor(p.kind)],
      isDefault: !saved.has(p.key),
      ...(p.custom !== undefined ? { custom: p.custom, people: p.people ?? 0 } : {}),
    }));
    return { groups: PERMISSION_GROUPS, profiles };
  }

  /** Saves what one kind of person may do: only what can be given to them, with what each needs added. */
  static async save(tenantId: string, profileKey: string, keys: readonly string[], actorId: string): Promise<ProfileAnswer> {
    const profile = await PermissionService.profileDef(tenantId, profileKey);
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

  /** Back to the usual list (a role the school named: back to following Other roles). */
  static async reset(tenantId: string, profileKey: string): Promise<ProfileAnswer> {
    const profile = await PermissionService.profileDef(tenantId, profileKey);
    if (!profile) throw NO_SUCH_PROFILE();
    const school = await PermissionService.rootOf(tenantId);
    await RolePermission.deleteOne({ tenantId: school, profile: profile.key });
    const { keys } = await PermissionService.keysFor(tenantId, profile.key);
    return { key: profile.key, label: profile.label, kind: profile.kind, permissions: keys, offered: [...permissionsFor(profile.kind)], isDefault: true };
  }
}
