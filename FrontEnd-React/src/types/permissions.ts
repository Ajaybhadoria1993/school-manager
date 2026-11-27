/** What the school may allow a person to do (the Permissions page), as the API describes it (backend/src/main/permissions). */
/** `class_teacher` (2026-11-26): what only a class teacher does, in their own class; a teacher's login has it with the Teacher list. */
export type ProfileKind = "staff" | "teacher" | "class_teacher" | "parent";

export interface PermissionDef {
  key: string;
  label: string;
  /** The kinds of person it can be given to. */
  for: ProfileKind[];
}

export interface PermissionGroup {
  key: string;
  label: string;
  items: PermissionDef[];
}

/** One kind of person (Receptionist, Teacher, Parent...) with what they may do. */
export interface PermissionProfile {
  key: string;
  label: string;
  kind: ProfileKind;
  /** What they may do now: the school's choice, or the usual list while `isDefault`. */
  permissions: string[];
  /** What can be given to this kind (the rest is not offered). */
  offered: string[];
  isDefault: boolean;
  /** A role the school named ("other:sports coach"): made on this page (it can be deleted while nobody has it), or only typed in Add staff > Other. */
  custom?: boolean;
  /** A role the school named: how many of the staff (not inactive) have it. */
  people?: number;
}

/** A role the school named, for Add staff's Role list (2026-11-26). */
export interface NamedRoleChoice {
  key: string;
  label: string;
}

export interface PermissionsOverview {
  groups: PermissionGroup[];
  profiles: PermissionProfile[];
}
