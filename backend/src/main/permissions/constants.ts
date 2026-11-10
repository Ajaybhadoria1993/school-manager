import { STAFF_MEMBER_ROLES } from "../staff/constants";

/**
 * What a person of the school may do, decided by the school (2026-11-10, the Permissions page). The school admin and the principal can do
 * everything; every other kind of login has a list of these permissions, chosen with checkboxes for the KIND of person (Receptionist,
 * Accountant, Teacher, Parent, Librarian...), not one by one.
 *
 * A key is "<what>.<action>". `for` says which kinds of person it can be given to: a `staff` member (the school's pages), a `teacher` (their
 * own classes), a `parent` (their own children). Only what has a page for that person is offered: more are added with their pages.
 */
export type ProfileKind = "staff" | "teacher" | "parent";
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
  {
    key: "school",
    label: "The school's set-up",
    items: [
      { key: "classes.view", label: "See classes, sections and their students", for: ["staff"] },
      { key: "classes.manage", label: "Make and change classes, sections and departments", for: ["staff"] },
      { key: "years.manage", label: "Set up the next academic year (switching it on stays with the school admin)", for: ["staff"] },
      { key: "promotion.manage", label: "Prepare the promotion list (approving it stays with the school admin)", for: ["staff"] },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    items: [
      { key: "attendance.view", label: "See students' attendance", for: ["staff", "teacher"] },
      { key: "attendance.mark", label: "Take and correct students' attendance", for: ["staff", "teacher"] },
      { key: "attendance.teachers", label: "See and correct teachers' attendance", for: ["staff"] },
    ],
  },
  {
    key: "leaves",
    label: "Leave requests",
    items: [
      { key: "leaves.view", label: "See leave requests", for: ["staff", "teacher"] },
      { key: "leaves.decide", label: "Approve or reject leave requests", for: ["staff", "teacher"] },
    ],
  },
  {
    key: "classwork",
    label: "Diary, homework and tests",
    items: [
      { key: "classwork.view", label: "See the diary, homework, tests and marks", for: ["teacher"] },
      { key: "classwork.manage", label: "Write the diary and homework, make tests and enter their marks", for: ["teacher"] },
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
    label: "Timetable",
    items: [
      { key: "timetable.view", label: "See timetables", for: ["teacher"] },
      { key: "timetable.edit", label: "Make and change the school's timings and the class timetables", for: ["staff"] },
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
};

/** The people who can do everything: no checkbox for them. */
export const FULL_ACCESS_ROLES: readonly string[] = ["school_admin", "principal"];

/**
 * The kinds of person a school sets permissions for: a teacher, a parent, and each kind of staff (Receptionist, Accountant, Librarian...). The
 * principal is not one (they run the school with the admin). "Other" stands for every role the school wrote itself.
 */
export interface ProfileDef {
  key: string;
  label: string;
  kind: ProfileKind;
}
export const PROFILES: readonly ProfileDef[] = [
  { key: "teacher", label: "Teacher", kind: "teacher" },
  { key: "parent", label: "Parent", kind: "parent" },
  ...STAFF_MEMBER_ROLES.filter((r) => r.key !== "principal").map((r) => ({ key: r.key, label: r.key === "other" ? "Other roles" : r.label, kind: "staff" as const })),
];
export const PROFILE_KEYS: readonly string[] = PROFILES.map((p) => p.key);

/** The permissions that can be given to a kind of person. */
export const permissionsFor = (kind: ProfileKind): readonly string[] => PERMISSIONS.filter((p) => p.for.includes(kind)).map((p) => p.key);

/**
 * What each kind of person may do until the school decides (what they could do before there were permissions, so nothing changes by
 * itself): a teacher works with their own classes, a parent sees their children, the accountant the numbers, everyone else the calendar.
 */
const SCHOOL_DEFAULT = ["calendar.view"];
export const DEFAULT_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  teacher: [
    "calendar.view",
    "attendance.view",
    "attendance.mark",
    "leaves.view",
    "leaves.decide",
    "classwork.view",
    "classwork.manage",
    "exams.view",
    "exams.marks",
    "timetable.view",
  ],
  parent: ["calendar.view", "child.attendance", "child.timetable", "child.exams", "child.diary", "child.leave"],
  accountant: ["dashboard.view", "students.view", "students.export", "calendar.view"],
  ...Object.fromEntries(PROFILES.filter((p) => p.kind === "staff" && p.key !== "accountant").map((p) => [p.key, SCHOOL_DEFAULT])),
};

/** The logins that have a profile of their own (a staff login of any other kind is looked up by the person's role). */
export const PROFILE_OF_ROLE: Readonly<Record<string, string>> = { teacher: "teacher", parent: "parent", receptionist: "receptionist", accountant: "accountant", management: "management" };
