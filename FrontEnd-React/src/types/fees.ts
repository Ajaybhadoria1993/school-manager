/** Fees (set-up only, 2026-11-12): the fee heads, each class's fee chart for a session, the concessions and the fee rules. */

export type FeeKind = "tuition" | "admission" | "development" | "annual" | "exam" | "facility" | "deposit" | "transport" | "hostel" | "supplies" | "other";
export type FeeFrequency = "one_time" | "yearly" | "half_yearly" | "quarterly" | "monthly";
export type AppliesTo = "all" | "new" | "existing";
export type ConcessionBasis = "sibling" | "staff_ward" | "merit" | "need" | "rte" | "defence" | "sports" | "single_girl" | "other";
export type ConcessionMode = "percent" | "flat";
export type LateFineMode = "none" | "flat" | "per_day" | "percent_per_month";
export type FeeStatus = "active" | "inactive" | "all";

export interface FeeHead {
  id: string;
  name: string;
  kind: FeeKind;
  kindLabel: string;
  refundable: boolean;
  defaultFrequency: FeeFrequency;
  defaultAppliesTo: AppliesTo;
  defaultOptional: boolean;
  notes: string | null;
  isActive: boolean;
  /** On a fee chart or in a concession: it cannot be deleted, only switched off. */
  inUse: boolean;
}

export interface FeeHeadBody {
  name: string;
  kind: FeeKind;
  refundable?: boolean;
  defaultFrequency?: FeeFrequency;
  defaultAppliesTo?: AppliesTo;
  defaultOptional?: boolean;
  notes?: string;
  isActive?: boolean;
}

export interface FeeLine {
  id: string;
  headId: string;
  headName: string;
  kind: FeeKind;
  refundable: boolean;
  /** Rupees for one instalment. */
  amount: number;
  frequency: FeeFrequency;
  /** The calendar months (1 = January) it falls due in; none for a one-time fee. */
  dueMonths: number[];
  appliesTo: AppliesTo;
  optional: boolean;
  notes: string | null;
  /** What one student pays for it over the session. */
  yearly: number;
}

export interface FeeTotals {
  /** A student who joins, in their first session. */
  newStudent: number;
  /** Only what is paid once, when joining. */
  atJoining: number;
  /** A student who is already in the school, for the session. */
  existingStudent: number;
  refundable: number;
  optional: number;
}

export interface ClassFees {
  id: string;
  name: string;
  department: string | null;
  lines: FeeLine[];
  totals: FeeTotals;
  warnings: string[];
}

export interface FeeYear {
  id: string;
  name: string;
  status: "pending" | "active" | "closed";
}

export interface FeeStructure {
  year: (FeeYear & { startMonth: number }) | null;
  /** The running session and the upcoming one: the sessions whose fees can be set. */
  years: FeeYear[];
  classes: ClassFees[];
  /** The heads that are switched on. */
  heads: FeeHead[];
}

export interface FeeLineBody {
  yearId?: string;
  classIds: string[];
  headId: string;
  amount: number;
  frequency: FeeFrequency;
  dueMonths?: number[];
  appliesTo?: AppliesTo;
  optional?: boolean;
  notes?: string;
}

export interface FeeLinePatch {
  amount?: number;
  frequency?: FeeFrequency;
  dueMonths?: number[];
  appliesTo?: AppliesTo;
  optional?: boolean;
  notes?: string | null;
}

export interface Concession {
  id: string;
  name: string;
  basis: ConcessionBasis;
  mode: ConcessionMode;
  value: number;
  appliesTo: "all" | "selected";
  headIds: string[];
  headNames: string[];
  needsApproval: boolean;
  notes: string | null;
  isActive: boolean;
}

export interface ConcessionBody {
  name: string;
  basis: ConcessionBasis;
  mode: ConcessionMode;
  value: number;
  appliesTo: "all" | "selected";
  headIds: string[];
  needsApproval: boolean;
  notes?: string;
  isActive?: boolean;
}

export interface FeeRules {
  dueDay: number;
  graceDays: number;
  lateFine: { mode: LateFineMode; amount: number; maxAmount: number | null };
  allowPartial: boolean;
  holdReportCard: boolean;
  holdCertificate: boolean;
}

export type SavedFeeRules = FeeRules & { isDefault: boolean };

// ---- collecting (2026-11-19, backend/src/main/fees/services/feeAccount.service.ts) -------------------------------------------------------

export type PaymentMode = "cash" | "cheque" | "dd" | "upi" | "card" | "online";
/** Where a charge stands: settled, not due yet, late, partly paid, or due. */
export type ChargeStatus = "paid" | "upcoming" | "overdue" | "partial" | "due";

/** One instalment a student owes ("Tuition fee · Apr"). What is still owed is `outstanding`. */
export interface AccountCharge {
  id: string;
  label: string;
  headName: string;
  kind: string;
  source: "chart" | "transport" | "optional";
  /** The chart line it came from; null for the bus. */
  lineId: string | null;
  /** "2026-04-10". */
  dueDate: string;
  amount: number;
  /** What a concession takes off. */
  concession: number;
  net: number;
  paid: number;
  outstanding: number;
  status: ChargeStatus;
}

export interface AccountTotals {
  amount: number;
  concession: number;
  net: number;
  paid: number;
  outstanding: number;
  /** Owed on instalments that have come due. */
  dueNow: number;
  /** Owed on instalments that are late. */
  overdue: number;
}

export interface AccountConcession {
  id: string;
  name: string;
  mode: ConcessionMode;
  value: number;
  /** "pending" takes nothing off until the school admin or the principal approves it. */
  status: "pending" | "approved";
  note: string | null;
  headIds: string[];
  givenBy: string;
}

export interface ReceiptRow {
  id: string;
  number: string;
  paidOn: string;
  total: number;
  mode: PaymentMode;
  status: "valid" | "cancelled";
}

/** An optional fee of the student's class the family has not taken yet. */
export interface OptionalOffer {
  lineId: string;
  headName: string;
  amount: number;
  frequency: FeeFrequency;
  yearly: number;
}

export interface FeeAccount {
  student: { id: string; name: string; admissionNumber: string; classLabel: string | null };
  year: { id: string; name: string; status: "pending" | "active" | "closed" };
  rules: { dueDay: number; graceDays: number; lateFine: { mode: LateFineMode; amount: number; maxAmount: number | null }; allowPartial: boolean };
  charges: AccountCharge[];
  totals: AccountTotals;
  /** The late fine if every late instalment were paid today. */
  lateFineToday: number;
  concessions: AccountConcession[];
  receipts: ReceiptRow[];
  optional: OptionalOffer[];
}

export interface StudentToCollect {
  id: string;
  name: string;
  admissionNumber: string;
  classLabel: string | null;
}

export interface Receipt {
  id: string;
  /** "2026-2027/0001". */
  number: string;
  seq: number;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classLabel: string | null;
  mode: PaymentMode;
  modeLabel: string;
  reference: string | null;
  paidOn: string;
  items: { chargeId: string; label: string; amount: number }[];
  lateFine: number;
  total: number;
  note: string | null;
  status: "valid" | "cancelled";
  receivedBy: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
}

/** One receipt as it is printed: with the school and the session. */
export interface ReceiptSheet extends Receipt {
  school: string;
  year: string;
}

/** What the person typed in the Collect window. */
export interface CollectBody {
  studentId: string;
  mode: PaymentMode;
  reference: string | null;
  paidOn?: string;
  items: { chargeId: string; amount: number }[];
  lateFine?: number;
  note: string | null;
}

export interface DueRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  classId: string | null;
  classLabel: string | null;
  dueNow: number;
  overdue: number;
  instalments: number;
  oldestDue: string;
  lateFine: number;
}

export interface Dues {
  year: string;
  asOn: string;
  totals: { students: number; dueNow: number; overdue: number };
  items: DueRow[];
}

export interface CollectionSummary {
  from: string;
  to: string;
  receipts: number;
  total: number;
  lateFine: number;
  cancelled: { count: number; total: number };
  byMode: { mode: PaymentMode; modeLabel: string; count: number; total: number }[];
  byDay: { day: string; total: number }[];
}
