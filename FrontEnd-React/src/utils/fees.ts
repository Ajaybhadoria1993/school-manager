import type { AppliesTo, Concession, FeeFrequency, FeeLine, LateFineMode } from "../types";
import { MONTH_COUNT, MONTH_NAMES } from "../constants/fees";

/** 1200 -> "₹1,200"; 1200.5 -> "₹1,200.50" (paise only when there are some). */
export function rupees(amount: number): string {
  const whole = Number.isInteger(amount);
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** The months a repeating fee falls due in when the school gave none, counted from the month the session starts (the server's `defaultMonths`). */
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

/** The twelve months in the order of the session, from its first month: [4, 5, ... 12, 1, 2, 3] for a session that starts in April. */
export const monthsFrom = (startMonth: number): number[] => Array.from({ length: 12 }, (_, i) => ((startMonth - 1 + i) % 12) + 1);

/** A set of months in the order of the session, as their short names: "Apr, Jul, Oct, Jan". */
export const monthNames = (months: readonly number[], startMonth: number): string =>
  monthsFrom(startMonth)
    .filter((m) => months.includes(m))
    .map((m) => MONTH_NAMES[m - 1])
    .join(", ");

/** What a fee costs one student over the session: a one-time fee once, a repeating one for each month it falls due in. */
export const yearlyCost = (amount: number, frequency: FeeFrequency, dueMonths: readonly number[]): number =>
  Math.round(amount * (frequency === "one_time" ? 1 : dueMonths.length) * 100) / 100;

/** "Once, when joining", "Every month", "10 months a year", "Every year (Apr)", "Quarterly (Apr, Jul, Oct, Jan)". */
export function howOften(line: Pick<FeeLine, "frequency" | "dueMonths">, startMonth: number): string {
  const { frequency, dueMonths } = line;
  if (frequency === "one_time") return "Once, when joining";
  if (frequency === "monthly") return dueMonths.length === 12 ? "Every month" : `${dueMonths.length} months a year`;
  const label = frequency === "yearly" ? "Every year" : frequency === "half_yearly" ? "Half-yearly" : "Quarterly";
  return `${label} (${monthNames(dueMonths, startMonth)})`;
}

/** The sum an Add fee form shows while it is filled: "₹1,200 × 12 months = ₹14,400 a year". Empty until the amount is a number. */
export function sumWords(amount: number, frequency: FeeFrequency, dueMonths: readonly number[]): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  if (frequency === "one_time") return `${rupees(amount)}, paid once`;
  const times = dueMonths.length;
  if (times === 0) return "";
  return `${rupees(amount)} × ${times} ${times === 1 ? "time" : "times"} = ${rupees(yearlyCost(amount, frequency, dueMonths))} a year`;
}

/** What is wrong with the months chosen for a frequency, in words (the server's words), or nothing. */
export function monthsProblem(frequency: FeeFrequency, dueMonths: readonly number[]): string | undefined {
  const { min, max } = MONTH_COUNT[frequency];
  if (frequency === "one_time" || (dueMonths.length >= min && dueMonths.length <= max)) return undefined;
  if (frequency === "monthly") return "Choose the months the fee is charged in (1 to 12)";
  const count = frequency === "yearly" ? "1 month" : frequency === "half_yearly" ? "2 months" : "4 months";
  return `Choose ${count}: the fee is charged ${frequency === "yearly" ? "once" : frequency === "half_yearly" ? "twice" : "four times"} a year`;
}

/** Who pays a one-time fee: only a child who joins. */
export const appliesFor = (frequency: FeeFrequency, appliesTo: AppliesTo): AppliesTo => (frequency === "one_time" ? "new" : appliesTo);

/** The note under a raise on last year's fees that is more than a school may do without approval in some states; nothing when it is small. */
export function raiseNote(percent: number, limit: number): string | undefined {
  return percent > limit ? `More than ${limit}% over last year needs the fee committee's approval in some states (Madhya Pradesh: ${limit}%). Check your state's rule.` : undefined;
}

/** "10% off Tuition fee", "₹5,000 off every fee". */
export const offWords = (c: Pick<Concession, "mode" | "value" | "appliesTo" | "headNames">) =>
  `${c.mode === "percent" ? `${c.value}%` : rupees(c.value)} off ${c.appliesTo === "all" ? "every fee" : c.headNames.join(", ")}`;

/** The server's word about each box, by path. */
export function fieldErrorsOf(err: unknown, get: (e: unknown) => { details?: unknown } | null): Record<string, string> {
  const details = get(err)?.details;
  const out: Record<string, string> = {};
  if (Array.isArray(details)) for (const d of details as { path?: string; message?: string }[]) if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  return out;
}

/** 1 -> "1st", 2 -> "2nd", 5 -> "5th", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen || last === 0 || last > 3 ? "th" : ["th", "st", "nd", "rd"][last]}`;
}

/** The school's rules for when a fee is due and what being late costs, as a parent reads them: "Due on the 5th of the month. 3 days to pay without a fine. Late fine: ₹100." */
export function dueRulesWords(rules: { dueDay: number; graceDays: number; lateFine: { mode: "none" | "flat" | "per_day" | "percent_per_month"; amount: number; maxAmount: number | null } }): string[] {
  const out = [`Due on the ${ordinal(rules.dueDay)} of the month.`];
  if (rules.graceDays > 0) out.push(`${rules.graceDays} day${rules.graceDays === 1 ? "" : "s"} to pay without a fine.`);
  const { mode, amount, maxAmount } = rules.lateFine;
  const most = maxAmount != null ? ` (up to ${rupees(maxAmount)})` : "";
  if (mode === "flat") out.push(`Late fine: ${rupees(amount)}.`);
  else if (mode === "per_day") out.push(`Late fine: ${rupees(amount)} for each day late${most}.`);
  else if (mode === "percent_per_month") out.push(`Late fine: ${amount}% of what is due for each month late${most}.`);
  return out;
}

// ---- collecting ---------------------------------------------------------------------------------------------------------------------------

/** Today in India as "2026-11-19" (the server reckons its days the same way). */
export const todayInIndia = (now = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const dayNumber = (day: string) => Math.floor(new Date(`${day}T00:00:00.000Z`).getTime() / 86_400_000);
/** Whole days from one "2026-11-10" to another. */
export const daysBetween = (later: string, earlier: string) => dayNumber(later) - dayNumber(earlier);

/**
 * The late fine on these amounts, by the school's rules (the server's `lateFineFor`): nothing, a flat amount for each late instalment, an amount for
 * each day late, or a percentage for each month (30 days) late; no more than the most a family pays. An instalment is late once the days of grace
 * after its due day have passed. The server decides in the end: this is what the window offers to take.
 */
export function lateFineFor(
  rules: { graceDays: number; lateFine: { mode: LateFineMode; amount: number; maxAmount: number | null } },
  rows: { base: number; dueDate: string }[],
  on: string,
): number {
  const { mode, amount, maxAmount } = rules.lateFine;
  if (mode === "none" || amount <= 0) return 0;
  let total = 0;
  for (const row of rows) {
    const late = daysBetween(on, row.dueDate);
    if (late <= rules.graceDays) continue;
    if (mode === "flat") total += amount;
    else if (mode === "per_day") total += amount * late;
    else total += (row.base * amount * Math.ceil(late / 30)) / 100;
  }
  if (maxAmount != null) total = Math.min(total, maxAmount);
  return Math.round(total * 100) / 100;
}

/** "Tuition fee, 12 instalments" style words for what a receipt or a window says about its items: "3 fees". */
export const countWords = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
