import {
  Building2,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
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
    label: "Students",
    href: "/school/students",
    icon: GraduationCap,
    // The people who admit students (STUDENT_WRITERS in constants/students.ts; the accountant reads through the API only for now).
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
