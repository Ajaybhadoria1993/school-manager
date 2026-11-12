/**
 * Fees (2026-11-12): what the school charges, set up before anything is collected. The school's fee heads (Tuition, Admission, Exam,
 * Uniform...), each class's fee chart for a session (which heads, how much, how often, for whom), the concessions it gives (sibling, staff
 * child, RTE...) and its rules (due day, late fine). Collecting money, receipts and dues are a later phase: nothing here bills anyone.
 */

/**
 * What a fee is about. It groups the fee chart and carries the few rules that depend on the kind: a `deposit` (caution money) is refundable,
 * `transport` comes from the stop a child boards at (Transport > Routes), not from the class, and `development` is held to the Supreme
 * Court's 15% of tuition.
 */
export const FEE_KINDS = ["tuition", "admission", "development", "annual", "exam", "facility", "deposit", "transport", "hostel", "supplies", "other"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];
export const FEE_KIND_LABELS: Record<FeeKind, string> = {
  tuition: "Tuition",
  admission: "Registration and admission",
  development: "Development",
  annual: "Annual charges",
  exam: "Exam",
  facility: "Facilities and activities",
  deposit: "Refundable deposit",
  transport: "Transport",
  hostel: "Hostel and mess",
  supplies: "Uniform, books and stationery",
  other: "Other",
};

/** How often a fee is charged. `one_time` is once, when the child joins; the others repeat in the session. */
export const FEE_FREQUENCIES = ["one_time", "yearly", "half_yearly", "quarterly", "monthly"] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];
/** How many due months each frequency has (monthly: any 1 to 12: a school that does not charge May and June has 10). */
export const MONTHS_OF: Record<FeeFrequency, { min: number; max: number }> = {
  one_time: { min: 0, max: 0 },
  yearly: { min: 1, max: 1 },
  half_yearly: { min: 2, max: 2 },
  quarterly: { min: 4, max: 4 },
  monthly: { min: 1, max: 12 },
};

/** Who pays it: every student, only a student who joins (registration, admission, caution money), only one who is already in the school (re-admission). */
export const APPLIES_TO = ["all", "new", "existing"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];

/** Why a concession is given: the school's own reasons, as schools in India give them. */
export const CONCESSION_BASES = ["sibling", "staff_ward", "merit", "need", "rte", "defence", "sports", "single_girl", "other"] as const;
export type ConcessionBasis = (typeof CONCESSION_BASES)[number];
export const CONCESSION_MODES = ["percent", "flat"] as const;
export type ConcessionMode = (typeof CONCESSION_MODES)[number];

/** What a late payment costs: nothing, one flat amount, an amount for each day late, or a percentage of what is due for each month late. */
export const LATE_FINE_MODES = ["none", "flat", "per_day", "percent_per_month"] as const;
export type LateFineMode = (typeof LATE_FINE_MODES)[number];

/** The Supreme Court (Modern School v. Union of India, 2004) lets a school charge a development fee of up to this share of its tuition fee. */
export const DEVELOPMENT_FEE_CAP_PERCENT = 15;

export const MAX_FEE_HEADS = 80;
export const MAX_CONCESSIONS = 40;
export const MAX_CLASSES_AT_ONCE = 60;
export const MAX_HEADS_AT_ONCE = 40;
/** The most one fee line may be, in rupees (ten lakh): a typing mistake of an extra zero is caught. */
export const MAX_AMOUNT = 1_000_000;
export const MAX_NAME = 60;
export const MAX_NOTE = 200;

/** The month numbers (1 = January) a recurring fee falls due in when the school gave none, counted from the month the session starts. */
export function defaultMonths(frequency: FeeFrequency, startMonth: number): number[] {
  const at = (offset: number) => ((startMonth - 1 + offset) % 12) + 1;
  switch (frequency) {
    case "one_time":
      return [];
    case "yearly":
      return [at(0)];
    case "half_yearly":
      return [at(0), at(6)];
    case "quarterly":
      return [at(0), at(3), at(6), at(9)];
    case "monthly":
      return Array.from({ length: 12 }, (_, i) => at(i));
  }
}

/** What a line costs one student over the session, in rupees: a one-time fee once, a repeating one for each due month. */
export const yearlyCost = (amount: number, frequency: FeeFrequency, dueMonths: readonly number[]): number =>
  Math.round(amount * (frequency === "one_time" ? 1 : dueMonths.length) * 100) / 100;
