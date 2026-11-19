/** What the school may allow a person to do (the Permissions page), as the API describes it (backend/src/main/permissions). */
export type ProfileKind = "staff" | "teacher" | "parent";

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
}

export interface PermissionsOverview {
  groups: PermissionGroup[];
  profiles: PermissionProfile[];
}
