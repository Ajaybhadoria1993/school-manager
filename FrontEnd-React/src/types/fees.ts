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
