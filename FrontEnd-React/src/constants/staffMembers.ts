import type { UserRole } from "../types";

/**
 * The kinds of staff a school can invite (Staff > Add staff): the people who work for the school without teaching. The same list as
 * the server's STAFF_MEMBER_ROLES (backend/src/main/staff/constants.ts); a new kind is added there and here. `other` is a role of the
 * school's own: its name is written in the form. A person who also teaches is a Teacher too (the form's *Also a teacher*).
 */
export const STAFF_ROLES = [
  { key: "principal", label: "Principal", description: "Runs the school with the school admin: every page of the school's set-up." },
  { key: "vice_principal", label: "Vice principal", description: "Works with the principal. Sees the dashboard and the calendar." },
  { key: "accountant", label: "Accountant", description: "Fees and accounts." },
  { key: "receptionist", label: "Receptionist", description: "The front desk: enquiries, visitors and admissions." },
  { key: "management", label: "Management", description: "A member of the school's management, who looks at how the school is doing." },
  { key: "coordinator", label: "Coordinator", description: "Sees the dashboard and the calendar." },
  { key: "clerk", label: "Clerk / office staff", description: "Sees the dashboard and the calendar." },
  { key: "librarian", label: "Librarian", description: "Sees the dashboard and the calendar." },
  { key: "lab_assistant", label: "Lab assistant", description: "Sees the dashboard and the calendar." },
  { key: "counsellor", label: "Counsellor", description: "Sees the dashboard and the calendar." },
  { key: "nurse", label: "Nurse", description: "Sees the dashboard and the calendar." },
  { key: "it_support", label: "IT / computer support", description: "Sees the dashboard and the calendar." },
  { key: "transport", label: "Transport in-charge", description: "Sees the dashboard and the calendar." },
  { key: "driver", label: "Driver", description: "Sees the dashboard and the calendar." },
  { key: "security", label: "Security guard", description: "Sees the dashboard and the calendar." },
  { key: "peon", label: "Peon / attendant", description: "Sees the dashboard and the calendar." },
  { key: "housekeeping", label: "Housekeeping", description: "Sees the dashboard and the calendar." },
  { key: "warden", label: "Hostel warden", description: "Sees the dashboard and the calendar." },
  { key: "other", label: "Other", description: "A role of your own: write its name. Sees the dashboard and the calendar." },
] as const;

export type StaffRoleKey = (typeof STAFF_ROLES)[number]["key"];

/** The longest role name the school may write for Other (the server's MAX_ROLE_OTHER). */
export const MAX_ROLE_OTHER = 40;

/** The role's label; for Other, the name the school wrote. */
export const staffRoleLabel = (role: string, other?: string | null) => (role === "other" && other ? other : (STAFF_ROLES.find((r) => r.key === role)?.label ?? role));

/**
 * A role with pages of its own keeps its login even when the person also teaches (the server's ROLES_KEEPING_THEIR_LOGIN): a Principal
 * who takes a class is still the principal; they are a teacher of the school without a teacher login.
 */
export const ROLES_KEEPING_THEIR_LOGIN: readonly string[] = ["principal", "accountant"];

/** Who may add and manage staff (the server's STAFF_WRITERS). */
export const STAFF_MANAGERS: readonly UserRole[] = ["school_admin", "principal"];
