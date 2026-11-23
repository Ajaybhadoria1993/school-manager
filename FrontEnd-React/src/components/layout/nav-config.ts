import {
  ArrowLeftRight,
  Backpack,
  BadgePercent,
  FileText,
  CircleAlert,
  HandCoins,
  ReceiptText,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Clock3,
  CalendarDays,
  Bus,
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  MailCheck,
  Rocket,
  School,
  ScrollText,
  Settings2,
  Tags,
  UserCog,
  ShieldCheck,
  Route,
  MapPinned,
  UserRoundCog,
  UsersRound,
  IndianRupee,
  Wallet,
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

// The menu holds the pages that exist today; planned modules in constants/modules.ts stay out until they are built.
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
    // The school's class overview and its setup page share one menu entry. Manage classes from the overview; Students stays separate.
    label: "Classes",
    href: "/school-class",
    icon: School,
    roles: ["school_admin", "principal"],
    permission: ["classes.view"],
    schoolWide: true,
    group: "Overview",
  },
  {
    // Students is ONE row (2026-11-22): its lists (Active students, New admissions, Inactive) are tabs on its page, not pages of a submenu.
    label: "Students",
    href: "/school/students",
    icon: Backpack,
    roles: ["school_admin", "principal"],
    permission: ["students.view"],
    schoolWide: true,
    group: "Overview",
  },
  {
    // Teachers is ONE row (2026-11-22), like Students: the active and the inactive teachers are tabs on its page, not pages of a submenu.
    label: "Teachers",
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
    // School timings and class timetables sit just below Attendance in the main sidebar (2026-11-11).
    label: "School timings",
    href: "/school/timings",
    icon: Clock3,
    roles: ["school_admin", "principal"],
    permission: ["timetable.edit"],
    schoolWide: true,
    group: "Overview",
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
    group: "Overview",
    submenu: "Timetable",
  },
  {
    // The day's arrangement (2026-11-22): who is away today, their periods, and a free teacher put in for each.
    label: "Arrangements",
    href: "/school/arrangements",
    icon: ArrowLeftRight,
    roles: ["school_admin", "principal"],
    permission: ["timetable.edit"],
    schoolWide: true,
    group: "Overview",
    submenu: "Timetable",
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
    // Transport (2026-11-10): the school's vehicles, the drivers and attendants, and the routes with their stops: one row of the menu that opens
    // Vehicles, Drivers and Routes. For the people the school allowed (transport.view / transport.manage).
    label: "Vehicles",
    href: "/transport/vehicles",
    icon: Bus,
    roles: ["school_admin", "principal"],
    permission: ["transport.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Transport",
  },
  {
    label: "Drivers",
    href: "/transport/drivers",
    icon: UserRoundCog,
    roles: ["school_admin", "principal"],
    permission: ["transport.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Transport",
  },
  {
    label: "Routes",
    href: "/transport/routes",
    icon: Route,
    roles: ["school_admin", "principal"],
    permission: ["transport.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Transport",
  },
  {
    // Live tracking (2026-11-19): where each vehicle is now, from the driver's phone, on a map.
    label: "Live tracking",
    href: "/transport/tracking",
    icon: MapPinned,
    roles: ["school_admin", "principal"],
    permission: ["transport.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Transport",
  },
  {
    // Fees (2026-11-12): the set-up of what the school charges: the fee chart of each class, the list of fees, the concessions and the fee rules.
    // One row of the menu; for the people the school allowed (fees.view / fees.manage). Collecting (2026-11-19): taking a payment from a student's fee
    // account, the dues and the receipts, for the people allowed fees.collect (they come first: a cashier opens the row on Collect fees).
    label: "Collect fees",
    href: "/fees/collect",
    icon: HandCoins,
    roles: ["school_admin", "principal"],
    permission: ["fees.collect"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
  },
  {
    label: "Dues",
    href: "/fees/dues",
    icon: CircleAlert,
    roles: ["school_admin", "principal"],
    permission: ["fees.collect"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
  },
  {
    label: "Receipts",
    href: "/fees/receipts",
    icon: ReceiptText,
    roles: ["school_admin", "principal"],
    permission: ["fees.collect"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
  },
  {
    label: "Fee structure",
    href: "/fees/structure",
    icon: IndianRupee,
    roles: ["school_admin", "principal"],
    permission: ["fees.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
  },
  {
    label: "Fee heads",
    href: "/fees/heads",
    icon: Tags,
    roles: ["school_admin", "principal"],
    permission: ["fees.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
  },
  {
    label: "Concessions",
    href: "/fees/concessions",
    icon: BadgePercent,
    roles: ["school_admin", "principal"],
    permission: ["fees.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
  },
  {
    label: "Fee rules",
    href: "/fees/rules",
    icon: ScrollText,
    roles: ["school_admin", "principal"],
    permission: ["fees.view"],
    schoolWide: true,
    group: "Overview",
    submenu: "Fees",
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
  // The pages of Manage school sit together (2026-11-22: Documents was between Fees and Permissions, so the menu drew the folding row twice).
  {
    // Documents (2026-11-19): the ID cards and the exam report cards of a class, to print; for the people the school allowed (documents.view).
    label: "Documents",
    href: "/documents",
    icon: FileText,
    roles: ["school_admin", "principal"],
    permission: ["documents.view"],
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
    label: "Settings",
    href: "/settings",
    icon: Settings2,
    roles: ["super_admin", "school_admin", "principal", "accountant", "teacher", "receptionist", "management", "staff", "parent", "student"],
    group: "Account",
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
 * The state of a link that opens a child page: Add student is part of Students, but a person who pressed it on a class-filtered list or a
 * class page is still working there, so the correct sidebar entry stays lit and the way back leads to where they were.
 */
export const cameFrom = (href: string, label?: string) => ({ cameFrom: { href, label } });

/** What a link said about where the person came from; nothing unless it is an address of this app (never another site). */
export function cameFromOf(state: unknown): CameFrom | null {
  const from = (state as { cameFrom?: { href?: unknown; label?: unknown } } | null)?.cameFrom;
  if (!from || typeof from.href !== "string" || !from.href.startsWith("/") || from.href.startsWith("//")) return null;
  return { href: from.href, label: typeof from.label === "string" ? from.label : undefined };
}

/** The address the menu is lit by: the page the person came from when the link said so, else the page's own address. */
export function pathForMenu(location: { pathname: string; state: unknown; search?: string }): string {
  const from = cameFromOf(location.state);
  return from ? from.href.split(/[?#]/)[0] : location.pathname;
}

/** What the top bar calls the page of a menu entry. */
export const pageTitleOf = (item: NavItem | undefined): string => item?.title ?? item?.label ?? "Dashboard";

export function activeNavItem(pathname: string, items: readonly NavItem[] = NAV_ITEMS): NavItem | undefined {
  // Class setup is reached from the Classes overview's Manage classes button, so both addresses light the same sidebar entry.
  if (pathname === "/school/classes" || pathname.startsWith("/school/classes/")) {
    return items.find((item) => item.href === "/school-class");
  }
  // The class-filtered student list and the management routes share the single Students menu entry.
  if (pathname === "/school-class/students" || pathname.startsWith("/school-class/students/")) {
    return items.find((item) => item.href === "/school/students");
  }
  // Old Manage Teacher addresses stay valid, but now light up the single Teacher section.
  if (pathname === "/school/teachers" || pathname.startsWith("/school/teachers/")) {
    return items.find((item) => item.href === "/teachers");
  }
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
  Transport: { icon: Bus },
  Fees: { icon: Wallet },
};

/**
 * The heading of the menu an item stands under (2026-11-22, from the reference pictures): Main (the daily pages), Finance & transport
 * (fees and the buses) and Admin (permissions, the calendar, leave). An item of a folding group (Manage school) or Settings keeps its own
 * group's name. `group` itself is unchanged: it is what the pages and the permissions know the item by.
 */
export function sectionOf(item: NavItem): string {
  if (item.group !== "Overview") return item.group;
  if (item.href.startsWith("/transport") || item.href.startsWith("/fees")) return "Finance & transport";
  if (["/permissions", "/calendar", "/leaves", "/super-admin/schools"].includes(item.href)) return "Admin";
  return "Main";
}

/**
 * The small capital words above the page's name in the top bar: the kind of page (People, Daily register, Finance...); the school's name for
 * the dashboard and for a page with no kind of its own.
 */
export function kickerOf(item: NavItem | undefined, school: string): string {
  if (!item) return school;
  const { href } = item;
  if (href === "/dashboard") return school;
  if (href.startsWith("/attendance")) return "Daily register";
  if (href.startsWith("/fees")) return "Finance";
  if (href.startsWith("/transport")) return "Transport";
  if (href.startsWith("/school/students") || href.startsWith("/teachers") || href === "/staff") return "People";
  if (href.startsWith("/school/timings") || href.startsWith("/school/timetable") || href.startsWith("/school/arrangements") || href === "/school-class") return "Academics";
  if (["/permissions", "/calendar", "/leaves"].includes(href)) return "Admin";
  return school;
}

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
