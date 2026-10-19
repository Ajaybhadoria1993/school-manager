import {
  Award,
  Banknote,
  BarChart3,
  BadgeIndianRupee,
  BookOpen,
  Briefcase,
  Bus,
  CalendarCheck,
  ClipboardList,
  Contact,
  FileText,
  GraduationCap,
  Megaphone,
  Package,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "./tones";

export type ModuleGroup =
  "Overview" | "Academics" | "People" | "Finance" | "Operations";

export interface SchoolModule {
  slug: string;
  /** Short name used in the menu. */
  label: string;
  group: ModuleGroup;
  icon: LucideIcon;
  tone: Tone;
  /** One line under the title. */
  tagline: string;
  /** Two or three plain sentences on what the module is for. */
  about: string;
  /** What it is planned to cover, in the words a principal would use. */
  covers: string[];
}

// None of these exist yet. The menu and the preview pages say so ("Soon", "Planned"); the order is the order we plan to build them.
export const MODULES: SchoolModule[] = [
  {
    slug: "analytics",
    label: "Analytics",
    group: "Overview",
    icon: BarChart3,
    tone: "primary",
    tagline: "See how your school is doing, at a glance",
    about:
      "Charts and trends built from the school's own records, so a principal can spot a problem before it grows.",
    covers: [
      "Attendance trends by class and by month",
      "Fee collection against what is due",
      "Exam results compared across classes",
      "New admissions through the session",
    ],
  },
  {
    slug: "reports",
    label: "Reports",
    group: "Overview",
    icon: FileText,
    tone: "info",
    tagline: "Every report, one place, ready to print",
    about:
      "All the reports a school is asked for, in one list, with filters and a print or download button.",
    covers: [
      "Student, staff and fee lists",
      "Attendance and result reports",
      "Reports for the board and for parents",
      "Print or download in one click",
    ],
  },
  {
    slug: "attendance",
    label: "Attendance",
    group: "Academics",
    icon: CalendarCheck,
    tone: "warning",
    tagline: "Mark it in a minute, know it all day",
    about:
      "Teachers mark who is present class by class, and the school sees the day's picture straight away.",
    covers: [
      "Mark a whole class in a few taps",
      "Late, half day and leave marked clearly",
      "A daily summary for the principal",
      "Parents told when a child is absent",
    ],
  },
  {
    slug: "exams",
    label: "Exams",
    group: "Academics",
    icon: ClipboardList,
    tone: "danger",
    tagline: "From the timetable to the report card",
    about:
      "Set up exams, enter marks once, and get report cards without re-typing anything.",
    covers: [
      "Exam schedule and rooms",
      "Marks entry by subject",
      "Grades and rank worked out for you",
      "Printable report cards",
    ],
  },
  {
    slug: "students",
    label: "Students",
    group: "Academics",
    icon: GraduationCap,
    tone: "primary",
    tagline: "Every student's record, from admission onward",
    about:
      "One record per student: who they are, which class they are in, who their parents are, and how they are doing.",
    covers: [
      "Admission and class lists",
      "Parent and guardian details",
      "Documents and photos",
      "Promotion to the next class at year end",
    ],
  },
  {
    slug: "library",
    label: "Library",
    group: "Academics",
    icon: BookOpen,
    tone: "success",
    tagline: "Know where every book is",
    about:
      "A simple catalogue with issue and return, so books stop going missing.",
    covers: [
      "Book catalogue",
      "Issue and return with due dates",
      "Fines for late returns",
      "Who has what, right now",
    ],
  },
  {
    slug: "id-cards",
    label: "ID cards",
    group: "Academics",
    icon: Contact,
    tone: "info",
    tagline: "Print cards for students and staff",
    about:
      "Pick a design, and the school's records fill in the names, classes and photos.",
    covers: [
      "Student and staff card designs",
      "Photo, class and contact filled in for you",
      "Print a whole class at once",
    ],
  },
  {
    slug: "certificates",
    label: "Certificates",
    group: "Academics",
    icon: Award,
    tone: "warning",
    tagline: "Transfer, bonafide and merit certificates",
    about:
      "Common certificates made from the student's record, with your school's name and signature.",
    covers: [
      "Transfer and bonafide certificates",
      "Merit and participation certificates",
      "A register of everything issued",
    ],
  },
  {
    slug: "hrms",
    label: "Staff and HRMS",
    group: "People",
    icon: Briefcase,
    tone: "success",
    tagline: "Your teachers and staff, looked after",
    about:
      "Invite your principal, teachers and office staff, and keep their details, leave and duties in one place.",
    covers: [
      "Invite staff by email",
      "Roles and what each person can see",
      "Leave requests and approvals",
      "Duty and class allocation",
    ],
  },
  {
    slug: "notices",
    label: "Notices",
    group: "People",
    icon: Megaphone,
    tone: "danger",
    tagline: "Tell parents and staff, once",
    about: "Write a notice, pick who should get it, and it reaches them.",
    covers: [
      "Notices for the whole school or one class",
      "Holiday and event announcements",
      "A record of what was sent and when",
    ],
  },
  {
    slug: "fees",
    label: "Fees",
    group: "Finance",
    icon: BadgeIndianRupee,
    tone: "success",
    tagline: "Collect fees without the chasing",
    about:
      "Set the fee for each class, record what has been paid, and see who still owes.",
    covers: [
      "Fee structure by class",
      "Receipts for every payment",
      "Reminders for pending fees",
      "Discounts and concessions",
    ],
  },
  {
    slug: "accounts",
    label: "Accounts",
    group: "Finance",
    icon: Wallet,
    tone: "primary",
    tagline: "Money in, money out",
    about:
      "A clear record of the school's income and spending, month by month.",
    covers: [
      "Income and expense entries",
      "Monthly summary",
      "Categories that match how you think about money",
    ],
  },
  {
    slug: "salary",
    label: "Staff salary",
    group: "Finance",
    icon: Banknote,
    tone: "info",
    tagline: "Pay your team correctly and on time",
    about:
      "Salary structure for each person, with the month's pay worked out from attendance and leave.",
    covers: [
      "Salary structure per person",
      "Monthly pay run",
      "Payslips staff can see",
      "Advances and deductions",
    ],
  },
  {
    slug: "transport",
    label: "Transport",
    group: "Operations",
    icon: Bus,
    tone: "warning",
    tagline: "Routes, buses and who rides them",
    about:
      "Keep the school's routes and vehicles in order, and know which children ride which bus.",
    covers: [
      "Routes and stops",
      "Vehicles and drivers",
      "Students on each route",
      "Transport fee linked to the child",
    ],
  },
  {
    slug: "assets",
    label: "Assets",
    group: "Operations",
    icon: Package,
    tone: "navy",
    tagline: "Know what the school owns",
    about:
      "A list of furniture, equipment and devices, with where each one is and what shape it is in.",
    covers: [
      "Item list with locations",
      "Condition and repair notes",
      "Who an item was given to",
    ],
  },
];

export const MODULE_GROUPS: ModuleGroup[] = [
  "Overview",
  "Academics",
  "People",
  "Finance",
  "Operations",
];

export const findModule = (slug: string) =>
  MODULES.find((m) => m.slug === slug);
