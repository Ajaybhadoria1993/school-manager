import type { AppliesTo, Concession, FeeFrequency, FeeLine } from "../types";
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
