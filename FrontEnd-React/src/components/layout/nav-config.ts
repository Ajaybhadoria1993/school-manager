import {
  Backpack,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Clock3,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  MailCheck,
  Rocket,
  School,
  UserCog,
  UserRoundCheck,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser, UserRole } from "../../types";
import { FULL_ACCESS_ROLES, can } from "../../utils/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  /**
   * The permissions that show this page to a person who is not in `roles`: anyone whose kind of person has ANY of them (the school's
   * Permissions page). The school admin and the principal see a page only through `roles`; the platform team never through this.
   */
  permission?: string[];
  /**
   * A page about the WHOLE school (every student, every class's attendance): a teacher, a parent or a student is not given it by a permission,
   * because what they may do is about their own classes or children (the server refuses them these pages too).
   */
  schoolWide?: boolean;
  /** The menu heading this item sits under. Items of one group are kept next to each other. */
  group: string;
  /** What the top bar calls the page, when the menu's short word would not say it ("Teacher attendance", where the menu says "Teacher"). */
  title?: string;
  /**
   * The row of the menu this page is nested under ("Timetable", "Attendance"): the row opens its pages one step further in when it is clicked.
   * Pages of one submenu are kept next to each other; the row takes its icon from `SUBMENUS`.
   */
  submenu?: string;
  /** Show the number of schools waiting for approval next to the label. */
  showPendingBadge?: boolean;
  /** Planned but not built yet: the menu marks it "Soon" and its page explains what it will do. */
  comingSoon?: boolean;
}

// The menu holds only the pages that exist today: Dashboard, then "Manage school" (built one page at a time, see README).
// The planned modules in constants/modules.ts still have preview pages, but stay out of the menu until they are built.
// The menu draws a heading whenever the group changes, so keep the items of one group together.
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: [
      "super_admin",
      "school_admin",
      "principal",
      "accountant",
      "teacher",
      "receptionist",
      "management",
      "staff",
      "parent",
      "student",
    ],
    group: "Overview",
  },
  {
    // Every class with its sections, students and seats, and each class's own page. For the people who run the school
    // (SchoolManagerRoute). Since 2026-11-04 Classes and Students are two entries of the menu (they were two tabs of one School Class page).
    label: "Classes",
    href: "/school-class",
    icon: School,
    roles: ["school_admin", "principal"],
    permission: ["classes.view"],
    schoolWide: true,
    group: "Overview",
  },
  {
    // Every student of the year, class by class, found by search and filters. A longer address than Classes', so it lights up on its own.
    label: "Students",
    href: "/school-class/students",
    icon: Backpack,
    roles: ["school_admin", "principal"],
    group: "Overview",
  },
  {
    // The students' list for a person the school allowed to see students (Permissions, 2026-11-10): search, filters, a student's page, and
    // Add student / Bulk upload / Export when they may. The people who run the school have Students above and Manage Students under Manage school.
    label: "Students",
    href: "/school/students",
    icon: Backpack,
    roles: [],
    permission: ["students.view"],
    schoolWide: true,
    group: "Overview",
  },
  {
    // Every teacher, found by search and filters; a teacher's page gives their classes, class teacher post and login. (SchoolManagerRoute.)
    label: "Teacher",
    href: "/teachers",
    icon: UsersRound,
    roles: ["school_admin", "principal"],
    permission: ["teachers.view"],
    schoolWide: true,
    group: "Overview",
  },
  {
    // Attendance, for the people who run the school: one row of the menu that opens Student, Teacher and Staff (2026-11-10; they were three tabs).
    // A teacher marks themselves present on their home; a class teacher takes a class's attendance in its work page.
    label: "Student",
    title: "Student attendance",
    href: "/attendance/students",
    icon: Backpack,
    roles: ["school_admin", "principal"],
    permission: ["attendance.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Attendance",
  },
  {
    label: "Teacher",
    title: "Teacher attendance",
    href: "/attendance/teachers",
    icon: UsersRound,
    roles: ["school_admin", "principal"],
    permission: ["attendance.teachers"],
    schoolWide: true,
    group: "Overview",
    submenu: "Attendance",
  },
  {
    label: "Staff",
    title: "Staff attendance",
    href: "/attendance/staff",
    icon: UserRoundCog,
    roles: ["school_admin", "principal"],
    group: "Overview",
    submenu: "Attendance",
  },
  {
    // The people who work for the school without teaching (a receptionist, an accountant, the management): added with a role and an email,
    // invited by email, they set a password and sign in (2026-11-07). STAFF_MANAGERS in constants/staffMembers.ts.
    label: "Staff",
    href: "/staff",
    icon: UserCog,
    roles: ["school_admin", "principal"],
    permission: ["staff.view"],
    schoolWide: true,
    group: "Overview",
  },
  {
    // What each kind of person of the school (Receptionist, Teacher, Parent...) may do, with checkboxes (2026-11-10). Only the school admin changes it.
    label: "Permissions",
    href: "/permissions",
    icon: ShieldCheck,
    roles: ["school_admin"],
    group: "Overview",
  },
  {
    // The school's holidays and events (2026-11-04): the school adds them, everyone of the school (teachers, parents) sees them.
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    roles: ["school_admin", "principal"],
    permission: ["calendar.view"],
    group: "Overview",
  },
  {
    // Leave sent by parents (2026-11-04): a class teacher answers their classes', the people who run the school every one.
    label: "Leave requests",
    href: "/leaves",
    icon: MailCheck,
    roles: ["school_admin", "principal"],
    permission: ["leaves.view"],
    group: "Overview",
  },
  {
    label: "Schools",
    href: "/super-admin/schools",
    icon: Building2,
    roles: ["super_admin"],
    group: "Overview",
    showPendingBadge: true,
  },
  {
    label: "Classes & Sections",
    href: "/school/classes",
    icon: FolderTree,
    roles: ["school_admin", "principal"],
    permission: ["classes.manage"],
    schoolWide: true,
    group: "Manage school",
  },
  {
    label: "Academic years",
    href: "/school/academic-years",
    icon: CalendarRange,
    roles: ["school_admin", "principal"],
    permission: ["years.manage"],
    schoolWide: true,
    group: "Manage school",
  },
  {
    // Who goes to which class when the year ends; the school admin approves the list.
    label: "Promotion",
    href: "/school/promotion",
    icon: Rocket,
    roles: ["school_admin", "principal"],
    permission: ["promotion.manage"],
    schoolWide: true,
    group: "Manage school",
  },
  {
    // The school's one day: when it starts, how long a period is, the lunch, the days (TIMETABLE_WRITERS in constants/timetable.ts).
    // 2026-11-09: School timings and Class timetables are two pages (they were the two tabs of one Timetable page); 2026-11-10: they sit
    // nested under ONE "Timetable" row of the menu, which opens them.
    label: "School timings",
    href: "/school/timings",
    icon: Clock3,
    roles: ["school_admin", "principal"],
    permission: ["timetable.edit"],
    schoolWide: true,
    group: "Manage school",
    submenu: "Timetable",
  },
  {
    // Each class's weekly timetable. Its subjects page and a teacher's week are longer addresses under it, so they light it up too.
    label: "Class timetables",
    href: "/school/timetable",
    icon: CalendarClock,
    roles: ["school_admin", "principal"],
    permission: ["timetable.edit"],
    schoolWide: true,
    group: "Manage school",
    submenu: "Timetable",
  },
  {
    // Exams and tests of the year (2026-11-06): Half-Yearly, Annual, Unit, Monthly, Class test; which classes write what, when and for how long.
    label: "Test & Exam",
    href: "/school/exams",
    icon: ClipboardList,
    roles: ["school_admin", "principal"],
    permission: ["exams.manage"],
    schoolWide: true,
    group: "Manage school",
  },
  {
    // Admit, edit, import, export, make inactive: "Manage Students" like "Manage Teacher", so it is not mistaken for the Students list above.
    label: "Manage Students",
    href: "/school/students",
    icon: GraduationCap,
    // The people who admit students (STUDENT_WRITERS in constants/students.ts; the accountant reads through the API only for now).
    roles: ["school_admin", "principal"],
    group: "Manage school",
  },
  {
    // The people who teach: added in steps with their own login, left, brought back (STAFF_WRITERS in constants/teachers.ts).
    label: "Manage Teacher",
    href: "/school/teachers",
    icon: UserRoundCheck,
    roles: ["school_admin", "principal"],
    group: "Manage school",
  },
];

/** Whether this person's menu has the entry: by their role, or (for anyone but the people who run the school and the platform team) by a permission. */
export function navVisible(item: NavItem, user: AuthUser): boolean {
  if (item.roles.includes(user.role)) return true;
  if (!item.permission || user.role === "super_admin" || FULL_ACCESS_ROLES.includes(user.role)) return false;
  if (item.schoolWide && (user.role === "teacher" || user.role === "parent" || user.role === "student")) return false;
  return can(user, ...item.permission);
}

/**
 * The menu entry the page belongs to. The longest matching address wins, so when one entry's address is the start of
 * another's only the longer one lights up.
 */
/** Where a person was when they opened a page that sits under another menu entry (see `cameFrom`). */
export interface CameFrom {
  /** An address of the app, with its filters. */
  href: string;
  /** What the way back is called ("Students", "Class 5"); the page's own word when missing. */
  label?: string;
}

/**
 * The state of a link that opens a page of another menu entry: Add student is a page of Manage Students, but a person who pressed it on the
 * Students page (or a class's page) is still working there, so that menu entry stays lit, the top bar keeps its title and the way back
 * leads to where they were.
 */
export const cameFrom = (href: string, label?: string) => ({ cameFrom: { href, label } });

/** What a link said about where the person came from; nothing unless it is an address of this app (never another site). */
export function cameFromOf(state: unknown): CameFrom | null {
  const from = (state as { cameFrom?: { href?: unknown; label?: unknown } } | null)?.cameFrom;
  if (!from || typeof from.href !== "string" || !from.href.startsWith("/") || from.href.startsWith("//")) return null;
  return { href: from.href, label: typeof from.label === "string" ? from.label : undefined };
}

/** The address the menu is lit by: the page the person came from when the link said so, else the page's own address. */
export function pathForMenu(location: { pathname: string; state: unknown }): string {
  const from = cameFromOf(location.state);
  return from ? from.href.split(/[?#]/)[0] : location.pathname;
}

/** What the top bar calls the page of a menu entry. */
export const pageTitleOf = (item: NavItem | undefined): string => item?.title ?? item?.label ?? "Dashboard";

export function activeNavItem(pathname: string, items: readonly NavItem[] = NAV_ITEMS): NavItem | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Groups that fold under one menu row instead of showing their pages under a heading: click the row ("Manage school")
 * and its pages open below it. The row takes this icon. Every other group is a plain heading with its pages.
 */
export const FOLDING_GROUPS: Record<string, { icon: LucideIcon }> = {
  "Manage school": { icon: LayoutGrid },
};

/** The rows of the menu that open their own pages (`NavItem.submenu`): the row's name is the key, and it takes this icon. */
export const SUBMENUS: Record<string, { icon: LucideIcon }> = {
  Timetable: { icon: CalendarClock },
  Attendance: { icon: CalendarCheck2 },
};

/** The menu heading as the person sees it: the platform team has a single "Platform" section. */
export const groupLabel = (group: string, role: UserRole) =>
  role === "super_admin" ? "Platform" : group;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  school_admin: "School Admin",
  principal: "Principal",
  accountant: "Accountant",
  teacher: "Teacher",
  receptionist: "Receptionist",
  management: "Management",
  staff: "Staff",
  parent: "Parent",
  student: "Student",
};
