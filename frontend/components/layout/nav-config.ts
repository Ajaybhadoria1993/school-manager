import {
  Building2,
  LayoutDashboard,
  School,
  type LucideIcon,
} from "lucide-react";
import { MODULES } from "@/lib/modules";
import type { UserRole } from "@/types";

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

const SCHOOL_ROLES: UserRole[] = [
  "school_admin",
  "principal",
  "accountant",
  "teacher",
];

// The first two are real today; the rest come from lib/modules.ts and open a preview page.
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
    label: "My school",
    href: "/school",
    icon: School,
    roles: ["school_admin", "principal"],
    group: "Overview",
  },
  ...MODULES.map<NavItem>((m) => ({
    label: m.label,
    href: `/modules/${m.slug}`,
    icon: m.icon,
    roles: SCHOOL_ROLES,
    group: m.group,
    comingSoon: true,
  })),
];

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
