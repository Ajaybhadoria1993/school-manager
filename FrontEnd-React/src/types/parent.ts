import type { AccountCharge, AccountTotals, ConcessionMode, ReceiptRow } from "./fees";
import type { PreviousSchool, StudentAddress } from "./students";
import type { GridAllotment, GridCell, GridDay } from "./timetable";

/** What a signed-in parent reads (`/parent/...`, 2026-11-04): their children, a child's record, its published week. */

export interface ChildPlace {
  className: string;
  sectionName: string | null;
  rollNumber: number | null;
  /** "Class 5 - A". */
  label: string;
}

export interface ChildSummary {
  id: string;
  name: string;
  admissionNumber: string;
  gender: string;
  dateOfBirth: string;
  place: ChildPlace | null;
}

export interface MyChildren {
  parent: { name: string; school: string };
  items: ChildSummary[];
}

export interface ChildGuardian {
  name: string;
  relation: string;
  isPrimary: boolean;
  mobile: string | null;
  alternateMobile: string | null;
  email: string | null;
  occupation: string | null;
}

export interface ChildDetail extends ChildSummary {
  firstName: string;
  lastName: string;
  admissionDate: string;
  bloodGroup: string | null;
  category: string | null;
  classTeacher: { name: string } | null;
  address: StudentAddress;
  previousSchool: PreviousSchool | null;
  /** The child's records by their key (Aadhaar, emergency number, medical notes...): only what the school filled in is shown. */
  records: Record<string, string | number | boolean | null>;
  guardians: ChildGuardian[];
}

/** The child's class's week as the school published it (null from the server before that). */
export interface ChildTimetable {
  label: string;
  status: "published";
  publishedAt: string | null;
  days: GridDay[];
  cells: GridCell[];
  allotments: Pick<GridAllotment, "subjectId" | "subjectName" | "subjectCode" | "periodsPerWeek" | "teacherId">[];
  teachers: { id: string; name: string }[];
}

/** The child's school bus, for their parent (`/parent/children/:id/bus`). Where it is comes only while it is live. */
export interface ChildBus {
  assigned: boolean;
  route?: { name: string; morningStart: string | null; afternoonStart: string | null };
  /** The stop the child boards at; null when the school renamed or took it off the route since. */
  stop?: { name: string; pickupTime: string | null; dropTime: string | null; fee: number | null } | null;
  vehicle?: { number: string; registrationNumber: string } | null;
  driver?: { name: string; mobile: string } | null;
  attendant?: { name: string; mobile: string } | null;
  tracking?: {
    /** The vehicle has a driver link, so it can be followed at all. */
    enabled: boolean;
    live: { lat: number; lng: number; speedKmph: number | null; heading: number | null; recordedAt: string; ageSeconds: number } | null;
    /** Seconds since it last reported; null when it never did. */
    lastSeenSeconds: number | null;
  };
}

export interface ChildFeeLine {
  id: string;
  headName: string;
  kind: string;
  /** One instalment, in rupees. */
  amount: number;
  frequency: "one_time" | "yearly" | "half_yearly" | "quarterly" | "monthly";
  /** The months it falls due (1 = January). */
  dueMonths: number[];
  appliesTo: "all" | "new" | "existing";
  optional: boolean;
  refundable: boolean;
  notes: string | null;
  /** What it comes to over the session. */
  yearly: number;
}

/** The child's fee account as their parent reads it: what is owed, paid and due, the concessions in force and the receipts that stand. */
export interface ChildFeeAccount {
  charges: AccountCharge[];
  totals: AccountTotals;
  lateFineToday: number;
  concessions: { id: string; name: string; mode: ConcessionMode; value: number }[];
  receipts: ReceiptRow[];
}

/**
 * The child's fees (`/parent/children/:id/fees`): their account (what is owed, paid and due; the money is taken at the school office, a parent
 * cannot pay here) and the school's fee chart for their class, the bus fee and the due rules.
 */
export interface ChildFees {
  /** Null when the child has no class this session, so nothing can be owed. */
  account: ChildFeeAccount | null;
  /** `startMonth`: the month (1 = January) the session starts in, where its months are counted from. */
  year: { name: string; startMonth: number } | null;
  rules: { dueDay: number; graceDays: number; lateFine: { mode: "none" | "flat" | "per_day" | "percent_per_month"; amount: number; maxAmount: number | null }; allowPartial: boolean };
  className: string | null;
  /** "new" for a child in their first session here, "existing" after. */
  audience: "new" | "existing" | null;
  chart: { lines: ChildFeeLine[]; compulsory: number; optional: number; refundable: number } | null;
  /** The bus fee of the stop the child boards at (rupees a month); null fee when the stop has none. */
  transport: { route: string; stop: string; monthlyFee: number | null } | null;
}
