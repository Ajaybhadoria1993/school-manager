import { STAFF_MEMBER_ROLES } from "../staff/constants";

/**
 * What a person of the school may do, decided by the school (2026-11-10, the Permissions page). The school admin and the principal can do
 * everything; every other kind of login has a list of these permissions, chosen with checkboxes for the KIND of person (Receptionist,
 * Accountant, Teacher, Parent, Librarian...), not one by one.
 *
 * A key is "<what>.<action>". `for` says which kinds of person it can be given to: a `staff` member (the school's pages), a `teacher` (their
 * own classes and subjects), a `class_teacher` (what only the class teacher does, in their own class: 2026-11-26), a `parent` (their own
 * children). Only what has a page for that person is offered: more are added with their pages.
 */
export type ProfileKind = "staff" | "teacher" | "class_teacher" | "parent";
export interface PermissionDef {
  key: string;
  label: string;
  for: readonly ProfileKind[];
}
export interface PermissionGroup {
  key: string;
  label: string;
  items: readonly PermissionDef[];
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { key: "dashboard", label: "Dashboard", items: [{ key: "dashboard.view", label: "See the dashboard", for: ["staff"] }] },
  {
    key: "students",
    label: "Students",
    items: [
      { key: "students.view", label: "See students and their details", for: ["staff"] },
      { key: "students.add", label: "Add students, one by one or with Bulk upload", for: ["staff"] },
      { key: "students.edit", label: "Change a student's details, class and roll number", for: ["staff"] },
      { key: "students.status", label: "Make students inactive or active, and transfer them out", for: ["staff"] },
      { key: "students.export", label: "Export students to Excel", for: ["staff"] },
      { key: "students.settings", label: "Choose what Add student asks and the Excel's columns", for: ["staff"] },
    ],
  },
  {
    key: "teachers",
    label: "Teachers",
    items: [
      { key: "teachers.view", label: "See the teachers and their pages", for: ["staff"] },
      { key: "teachers.add", label: "Add teachers, one by one or with Bulk upload", for: ["staff"] },
      { key: "teachers.edit", label: "Change a teacher's details, classes and login, and make them inactive", for: ["staff"] },
      { key: "teachers.export", label: "Export teachers to Excel", for: ["staff"] },
      { key: "teachers.settings", label: "Choose the extra fields the school keeps for its teachers", for: ["staff"] },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    items: [
      { key: "staff.view", label: "See the staff", for: ["staff"] },
      { key: "staff.add", label: "Add staff, with their login", for: ["staff"] },
      { key: "staff.edit", label: "Change a staff member's details and login, and make them inactive", for: ["staff"] },
    ],
  },
  // In the order of the menu (2026-11-26, user: "jitne bhi features hain sab yahan ho, clearly samajh aaye kis role ko kya de raha hoon").
  {
    key: "attendance",
    label: "Attendance",
    items: [
      // A class teacher: their own class's (and a class they were given for a day its class teacher is away). The staff: every class's.
      { key: "attendance.view", label: "See students' attendance", for: ["staff", "class_teacher"] },
      // Only a class teacher takes attendance (2026-11-17): the school and its staff look, so this is offered to the class teacher only.
      { key: "attendance.mark", label: "Take and correct students' attendance", for: ["class_teacher"] },
      { key: "attendance.teachers", label: "See and correct teachers' attendance", for: ["staff"] },
      // Attendance > Staff (2026-11-26): the sheet only; a staff member marks their own day from their login.
      { key: "attendance.staff", label: "See the staff's attendance", for: ["staff"] },
    ],
  },
  {
    key: "leaves",
    label: "Students' leave (sent by parents)",
    items: [
      { key: "leaves.view", label: "See the leave parents ask for their children", for: ["staff", "class_teacher"] },
      { key: "leaves.decide", label: "Approve or reject it", for: ["staff", "class_teacher"] },
    ],
  },
  {
    // Leave & arrangements > Leave requests (2026-11-26): what the teachers and the staff ask from their own login.
    key: "staffleaves",
    label: "Teachers' and staff leave",
    items: [
      { key: "staffleaves.view", label: "See the leave teachers and staff ask for", for: ["staff"] },
      { key: "staffleaves.decide", label: "Approve or reject it (never their own)", for: ["staff"] },
    ],
  },
  {
    key: "classwork",
    label: "Diary, homework and tests",
    items: [
      { key: "classwork.view", label: "See the diary, homework, tests and marks", for: ["teacher"] },
      { key: "classwork.manage", label: "Write the diary and homework, make tests and enter their marks", for: ["teacher"] },
      // Teaching progress (docs/teaching-progress.md): a teacher sees their own classes with classwork.view; this is every class's.
      { key: "progress.view", label: "See every class's teaching progress: chapters, what was taught and the homework", for: ["staff"] },
    ],
  },
  {
    key: "exams",
    label: "Test & Exam",
    items: [
      { key: "exams.view", label: "See their classes' exams and exam days", for: ["teacher"] },
      { key: "exams.marks", label: "Enter exam marks", for: ["teacher"] },
      { key: "exams.manage", label: "Make and change the school's exams, their papers and marks", for: ["staff"] },
    ],
  },
  {
    key: "timetable",
    label: "Timetable and arrangements",
    items: [
      { key: "timetable.view", label: "See timetables", for: ["teacher"] },
      { key: "timetable.edit", label: "Make and change the school timings, the class timetables and the subjects, and put in a substitute for a teacher who is away", for: ["staff"] },
    ],
  },
  {
    key: "school",
    label: "Classes and the school year",
    items: [
      { key: "classes.view", label: "See classes, sections and their students", for: ["staff"] },
      { key: "classes.manage", label: "Make and change classes, sections and departments", for: ["staff"] },
      { key: "years.manage", label: "Set up the next academic year (switching it on stays with the school admin)", for: ["staff"] },
      { key: "promotion.manage", label: "Prepare the promotion list (approving it stays with the school admin)", for: ["staff"] },
    ],
  },
  {
    key: "transport",
    label: "Transport",
    items: [
      { key: "transport.view", label: "See the vehicles, drivers, routes and the live map", for: ["staff"] },
      { key: "transport.manage", label: "Add and change vehicles, drivers and routes, and who rides each route", for: ["staff"] },
    ],
  },
  {
    key: "fees",
    label: "Fees",
    items: [
      { key: "fees.collect", label: "Collect fees: take a payment, give the receipt, see the dues and the day's collection", for: ["staff"] },
      { key: "fees.view", label: "See the fee set-up: fee heads, each class's fee chart, concessions and rules", for: ["staff"] },
      { key: "fees.manage", label: "Change the fee set-up, give a student a concession, cancel a receipt", for: ["staff"] },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    items: [
      { key: "documents.view", label: "See and print ID cards, report cards, admit cards and certificates", for: ["staff"] },
      { key: "documents.manage", label: "Write report card remarks, issue and cancel certificates, set the grading", for: ["staff"] },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    items: [
      { key: "calendar.view", label: "See the calendar", for: ["staff", "teacher", "parent"] },
      { key: "calendar.manage", label: "Add and change holidays and events", for: ["staff"] },
    ],
  },
  {
    key: "child",
    label: "Their child",
    items: [
      { key: "child.attendance", label: "See their child's attendance", for: ["parent"] },
      { key: "child.timetable", label: "See their child's timetable", for: ["parent"] },
      { key: "child.exams", label: "See their child's exams and results", for: ["parent"] },
      { key: "child.diary", label: "See their child's diary, homework and tests", for: ["parent"] },
      { key: "child.leave", label: "Send leave requests and see them", for: ["parent"] },
      { key: "child.transport", label: "See their child's school bus: route, stop, driver and where it is now", for: ["parent"] },
      { key: "child.fees", label: "See their child's fee account and fee chart", for: ["parent"] },
      { key: "child.documents", label: "See and print their child's ID card and exam report card", for: ["parent"] },
    ],
  },
];

export const PERMISSIONS: readonly PermissionDef[] = PERMISSION_GROUPS.flatMap((g) => g.items);
export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);

/** A permission that needs another to make sense (a person who adds students must see them): ticking one ticks the other, and the server adds it. */
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
  "fees.manage": "fees.view",
  "documents.manage": "documents.view",
  "staffleaves.decide": "staffleaves.view",
};

/** The people who can do everything: no checkbox for them. */
export const FULL_ACCESS_ROLES: readonly string[] = ["school_admin", "principal"];

/**
 * The kinds of person a school sets permissions for: a teacher, a class teacher, a parent, and each kind of staff (Receptionist, Accountant,
 * Librarian...). The principal is not one (they run the school with the admin). "Other" stands for every role the school wrote itself.
 * A class teacher is not a login of its own: a teacher's login has the Teacher list and the Class teacher list together, and what is on the
 * class teacher's list works only in the class they are the class teacher of (the services check it: classroom/services/access.ts).
 */
export interface ProfileDef {
  key: string;
  label: string;
  kind: ProfileKind;
}
export const PROFILES: readonly ProfileDef[] = [
  { key: "teacher", label: "Teacher", kind: "teacher" },
  { key: "class_teacher", label: "Class teacher", kind: "class_teacher" },
  { key: "parent", label: "Parent", kind: "parent" },
  ...STAFF_MEMBER_ROLES.filter((r) => r.key !== "principal").map((r) => ({ key: r.key, label: r.key === "other" ? "Other roles" : r.label, kind: "staff" as const })),
];
export const PROFILE_KEYS: readonly string[] = PROFILES.map((p) => p.key);

/**
 * A role the school named itself (Staff > Add staff > Other: "Sports coach", "Gardener") is a kind of its own (2026-11-26, user: "Other ka bhi
 * option rakho, jo other role rahe use bhi permission de sakein"): its key is "other:" and the name, written once however it was typed. Until the
 * school chooses for it, it follows "Other roles" (the list of every named role without one of its own).
 */
export const NAMED_ROLE_PREFIX = "other:";
export const namedRoleKey = (name: string) => `${NAMED_ROLE_PREFIX}${name.trim().replace(/\s+/g, " ").toLowerCase()}`;
export const isNamedRoleKey = (key: string) => key.startsWith(NAMED_ROLE_PREFIX);
/** What can be given to a kind (a named role is staff), or null for a key that is no kind. */
export const kindOfProfile = (key: string): ProfileKind | null => PROFILES.find((p) => p.key === key)?.kind ?? (isNamedRoleKey(key) ? "staff" : null);

/** The permissions that can be given to a kind of person. */
export const permissionsFor = (kind: ProfileKind): readonly string[] => PERMISSIONS.filter((p) => p.for.includes(kind)).map((p) => p.key);

/**
 * What each kind of person may do until the school decides (what they could do before there were permissions, so nothing changes by
 * itself): a teacher works with their own classes, a parent sees their children, the accountant the numbers, everyone else the calendar.
 */
const SCHOOL_DEFAULT = ["calendar.view"];
export const DEFAULT_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  teacher: ["calendar.view", "classwork.view", "classwork.manage", "exams.view", "exams.marks", "timetable.view"],
  // What was on every teacher's list and only a class teacher could use (2026-11-26: a list of its own).
  class_teacher: ["attendance.view", "attendance.mark", "leaves.view", "leaves.decide"],
  // The bus and the fee chart are new and are only the parent's own child's: they start on, and the school unticks them in Permissions.
  parent: ["calendar.view", "child.attendance", "child.timetable", "child.exams", "child.diary", "child.leave", "child.transport", "child.fees", "child.documents"],
  // Fees are new: the accountant starts with them (the fee chart and taking fees are their work), so nobody loses anything.
  accountant: ["dashboard.view", "students.view", "students.export", "calendar.view", "fees.view", "fees.manage", "fees.collect"],
  // Transport is new: the transport in-charge starts with it (nobody had it before, so nothing is taken away from anyone).
  transport: ["calendar.view", "transport.view", "transport.manage"],
  ...Object.fromEntries(PROFILES.filter((p) => p.kind === "staff" && p.key !== "accountant" && p.key !== "transport").map((p) => [p.key, SCHOOL_DEFAULT])),
};

/** The logins that have a profile of their own (a staff login of any other kind is looked up by the person's role). */
export const PROFILE_OF_ROLE: Readonly<Record<string, string>> = { teacher: "teacher", parent: "parent", receptionist: "receptionist", accountant: "accountant", management: "management" };
