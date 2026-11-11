import type { AuthUser, UserRole } from "../types";

/** The people who run the school: they can do everything, so no permission is asked of them. */
export const FULL_ACCESS_ROLES: readonly UserRole[] = ["school_admin", "principal"];

/**
 * What a kind of login may do until the school chooses (the server's DEFAULT_PERMISSIONS): used only for a session that does not carry its own
 * list (a server that is older than this screen), so nobody loses a page they had.
 */
const USUAL: Partial<Record<UserRole, readonly string[]>> = {
  teacher: ["calendar.view", "attendance.view", "attendance.mark", "leaves.view", "leaves.decide", "classwork.view", "classwork.manage", "exams.view", "exams.marks", "timetable.view"],
  parent: ["calendar.view", "child.attendance", "child.timetable", "child.exams", "child.diary", "child.leave"],
  accountant: ["dashboard.view", "students.view", "students.export", "calendar.view"],
  receptionist: ["calendar.view"],
  management: ["calendar.view"],
  staff: ["calendar.view"],
};

/**
 * Whether this person may do what any of the permissions say: always for the school admin and the principal; for anyone else when their
 * kind of person has one of them (the school ticked it on the Permissions page). The menu and the pages follow this; the server checks too.
 */
export function can(user: AuthUser | null | undefined, ...keys: string[]): boolean {
  if (!user) return false;
  if (FULL_ACCESS_ROLES.includes(user.role)) return true;
  const list = user.permissions ?? USUAL[user.role] ?? [];
  return keys.some((key) => list.includes(key));
}

/** A permission that needs another to make sense (a person who adds students must see them): the server adds it too. */
export const IMPLIES: Readonly<Record<string, string>> = {
  "students.add": "students.view",
  "students.edit": "students.view",
  "students.status": "students.view",
  "students.export": "students.view",
  "attendance.mark": "attendance.view",
  "leaves.decide": "leaves.view",
  "classwork.manage": "classwork.view",
  "exams.marks": "exams.view",
  "calendar.manage": "calendar.view",
  "students.settings": "students.view",
  "promotion.manage": "students.view",
  "teachers.add": "teachers.view",
  "teachers.edit": "teachers.view",
  "teachers.export": "teachers.view",
  "teachers.settings": "teachers.view",
  "staff.add": "staff.view",
  "staff.edit": "staff.view",
  "classes.manage": "classes.view",
  "years.manage": "classes.view",
  "transport.manage": "transport.view",
};

/** The list after one box is ticked or cleared: ticking brings what it needs, clearing takes away what needed it. */
export function toggled(list: readonly string[], key: string, on: boolean): string[] {
  const next = new Set(list);
  if (on) {
    next.add(key);
    const needed = IMPLIES[key];
    if (needed) next.add(needed);
  } else {
    next.delete(key);
    for (const [dependent, needed] of Object.entries(IMPLIES)) if (needed === key) next.delete(dependent);
  }
  return [...next];
}

/** Two lists hold the same permissions, whatever the order. */
export const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));
