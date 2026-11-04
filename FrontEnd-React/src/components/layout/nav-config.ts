import {
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  MailCheck,
  Rocket,
  School,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "../../types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** The menu heading this item sits under. Items of one group are kept next to each other. */
  group: string;
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
      "parent",
      "student",
    ],
    group: "Overview",
  },
  {
    // Every class with its sections and students, and each class's own page. For the people who run the school (SchoolManagerRoute).
    label: "School Class",
    href: "/school-class",
    icon: School,
    roles: ["school_admin", "principal"],
    group: "Overview",
  },
  {
    // Every teacher, found by search and filters; a teacher's page gives their classes, class teacher post and login. (SchoolManagerRoute.)
    label: "Teacher",
    href: "/teachers",
    icon: UsersRound,
    roles: ["school_admin", "principal"],
    group: "Overview",
  },
  {
    // The school's holidays and events (2026-11-04): the school adds them, everyone of the school (teachers, parents) sees them.
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    roles: ["school_admin", "principal", "accountant", "teacher", "parent"],
    group: "Overview",
  },
  {
    // Leave sent by parents (2026-11-04): a class teacher answers their classes', the people who run the school every one.
    label: "Leave requests",
    href: "/leaves",
    icon: MailCheck,
    roles: ["school_admin", "principal", "teacher"],
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
    group: "Manage school",
  },
  {
    label: "Academic years",
    href: "/school/academic-years",
    icon: CalendarRange,
    roles: ["school_admin", "principal"],
    group: "Manage school",
  },
  {
    // Who goes to which class when the year ends; the school admin approves the list.
    label: "Promotion",
    href: "/school/promotion",
    icon: Rocket,
    roles: ["school_admin", "principal"],
    group: "Manage school",
  },
  {
    // Timings, subjects, teachers and each class's weekly timetable, as a few steps (TIMETABLE_WRITERS in constants/timetable.ts).
    label: "Timetable",
    href: "/school/timetable",
    icon: CalendarClock,
    roles: ["school_admin", "principal"],
    group: "Manage school",
  },
  {
    label: "Students",
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

/**
 * The menu entry the page belongs to. The longest matching address wins, so when one entry's address is the start of
 * another's only the longer one lights up.
 */
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

/** The menu heading as the person sees it: the platform team has a single "Platform" section. */
export const groupLabel = (group: string, role: UserRole) =>
  role === "super_admin" ? "Platform" : group;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  school_admin: "School Admin",
  principal: "Principal",
  accountant: "Accountant",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};
