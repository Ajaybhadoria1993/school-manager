import type { UserRole } from "../types";

/** Everyone who works at the school has personal details and a photo (not parents, students or the platform's admin). */
export const PROFILE_ROLES: readonly UserRole[] = ["school_admin", "principal", "accountant", "teacher", "receptionist", "management", "staff"];
