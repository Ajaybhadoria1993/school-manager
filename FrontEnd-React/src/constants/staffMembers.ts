import type { UserRole } from "../types";

/**
 * The kinds of staff a school can invite (Staff > Add staff): the people who work for the school without teaching. The same list as
 * the server's STAFF_MEMBER_ROLES (backend/src/main/staff/constants.ts); a new kind is added there and here.
 */
export const STAFF_ROLES = [
  { key: "principal", label: "Principal", description: "Runs the school with the school admin: every page of the school's set-up." },
  { key: "accountant", label: "Accountant", description: "Fees and accounts." },
  { key: "receptionist", label: "Receptionist", description: "The front desk: enquiries, visitors and admissions." },
  { key: "management", label: "Management", description: "A member of the school's management, who looks at how the school is doing." },
] as const satisfies readonly { key: UserRole; label: string; description: string }[];

export type StaffRoleKey = (typeof STAFF_ROLES)[number]["key"];

export const staffRoleLabel = (role: string) => STAFF_ROLES.find((r) => r.key === role)?.label ?? role;

/** Who may add and manage staff (the server's STAFF_WRITERS). */
export const STAFF_MANAGERS: readonly UserRole[] = ["school_admin", "principal"];
