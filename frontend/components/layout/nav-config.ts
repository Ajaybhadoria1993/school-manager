import {
  LayoutDashboard,
  Users,
  UserCog,
  CalendarCheck,
  Wallet,
  BookOpen,
  MessageSquare,
  FileBadge,
  Settings,
  Building2,
  Baby,
  CalendarOff,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "school_admin", "principal", "accountant", "teacher", "parent", "student"],
  },
  {
    label: "My Children",
    href: "/my-children",
    icon: Baby,
    roles: ["parent"],
  },
  {
    label: "Students",
    href: "/students",
    icon: Users,
    roles: ["super_admin", "school_admin", "principal", "teacher", "accountant"],
  },
  {
    label: "Staff",
    href: "/staff",
    icon: UserCog,
    roles: ["super_admin", "school_admin", "principal"],
  },
  {
    label: "Leave",
    href: "/leave",
    icon: CalendarOff,
    roles: ["super_admin", "school_admin", "principal", "teacher"],
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: CalendarCheck,
    roles: ["super_admin", "school_admin", "principal", "teacher"],
  },
  {
    label: "Fees",
    href: "/fees",
    icon: Wallet,
    roles: ["super_admin", "school_admin", "principal", "accountant", "parent"],
  },
  {
    label: "Academics",
    href: "/academics",
    icon: BookOpen,
    roles: ["super_admin", "school_admin", "principal", "teacher"],
  },
  {
    label: "Communication",
    href: "/communication",
    icon: MessageSquare,
    roles: ["super_admin", "school_admin", "principal", "teacher", "parent"],
  },
  {
    label: "Certificates",
    href: "/certificates",
    icon: FileBadge,
    roles: ["super_admin", "school_admin", "principal", "accountant"],
  },
  {
    label: "Users & Logins",
    href: "/users",
    icon: Users,
    roles: ["super_admin", "school_admin", "principal"],
  },
  {
    label: "School Setup",
    href: "/settings",
    icon: Settings,
    roles: ["super_admin", "school_admin"],
  },
  {
    label: "Tenants",
    href: "/super-admin/tenants",
    icon: Building2,
    roles: ["super_admin"],
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  school_admin: "School Admin",
  principal: "Principal",
  accountant: "Accountant",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};
