import { describe, expect, it } from "vitest";
import { daysBetween, defaultMonths, dueRulesWords, howOften, lateFineFor, monthNames, monthsFrom, monthsProblem, offWords, ordinal, raiseNote, rupees, sumWords, yearlyCost } from "../fees";

describe("money", () => {
  it("is written in rupees the Indian way, with paise only when there are some", () => {
    expect(rupees(1200)).toBe("₹1,200");
    expect(rupees(1234567)).toBe("₹12,34,567");
    expect(rupees(1200.5)).toBe("₹1,200.50");
    expect(rupees(0)).toBe("₹0");
  });

  it("a repeating fee costs its amount for each month it falls due in, a one-time fee once", () => {
    expect(yearlyCost(1000, "monthly", [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3])).toBe(12000);
    expect(yearlyCost(1000, "monthly", [4, 7, 8, 9, 10, 11, 12, 1, 2, 3])).toBe(10000);
    expect(yearlyCost(5000, "one_time", [])).toBe(5000);
    expect(yearlyCost(333.33, "quarterly", [4, 7, 10, 1])).toBe(1333.32);
  });
});

describe("the months a fee falls due in", () => {
  it("start from the month the session starts (April for most schools, but not always)", () => {
    expect(defaultMonths("yearly", 4)).toEqual([4]);
    expect(defaultMonths("half_yearly", 4)).toEqual([4, 10]);
    expect(defaultMonths("quarterly", 4)).toEqual([4, 7, 10, 1]);
    expect(defaultMonths("monthly", 4)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
    expect(defaultMonths("quarterly", 7)).toEqual([7, 10, 1, 4]);
    expect(defaultMonths("one_time", 4)).toEqual([]);
  });

  it("are listed in the order of the session, not of the calendar", () => {
    expect(monthsFrom(4)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
    expect(monthNames([1, 4, 10, 7], 4)).toBe("Apr, Jul, Oct, Jan");
  });

  it("must fit how often the fee is charged, and say so in words", () => {
    expect(monthsProblem("quarterly", [4, 7, 10, 1])).toBeUndefined();
    expect(monthsProblem("quarterly", [4, 10])).toBe("Choose 4 months: the fee is charged four times a year");
    expect(monthsProblem("half_yearly", [4])).toBe("Choose 2 months: the fee is charged twice a year");
    expect(monthsProblem("yearly", [])).toBe("Choose 1 month: the fee is charged once a year");
    expect(monthsProblem("monthly", [])).toBe("Choose the months the fee is charged in (1 to 12)");
    expect(monthsProblem("monthly", [4, 5, 6])).toBeUndefined();
    expect(monthsProblem("one_time", [])).toBeUndefined();
  });
});

describe("how a fee is said", () => {
  it("how often, in words", () => {
    expect(howOften({ frequency: "one_time", dueMonths: [] }, 4)).toBe("Once, when joining");
    expect(howOften({ frequency: "monthly", dueMonths: monthsFrom(4) }, 4)).toBe("Every month");
    expect(howOften({ frequency: "monthly", dueMonths: [4, 7, 8, 9, 10, 11, 12, 1, 2, 3] }, 4)).toBe("10 months a year");
    expect(howOften({ frequency: "quarterly", dueMonths: [1, 4, 7, 10] }, 4)).toBe("Quarterly (Apr, Jul, Oct, Jan)");
    expect(howOften({ frequency: "yearly", dueMonths: [4] }, 4)).toBe("Every year (Apr)");
  });

  it("the sum under the Add fee form says what a year comes to, and nothing until there is an amount", () => {
    expect(sumWords(1200, "monthly", monthsFrom(4))).toBe("₹1,200 × 12 times = ₹14,400 a year");
    expect(sumWords(500, "yearly", [4])).toBe("₹500 × 1 time = ₹500 a year");
    expect(sumWords(5000, "one_time", [])).toBe("₹5,000, paid once");
    expect(sumWords(NaN, "monthly", monthsFrom(4))).toBe("");
    expect(sumWords(0, "monthly", monthsFrom(4))).toBe("");
  });

  it("a concession is said by what it takes off", () => {
    expect(offWords({ mode: "percent", value: 10, appliesTo: "selected", headNames: ["Tuition fee"] })).toBe("10% off Tuition fee");
    expect(offWords({ mode: "flat", value: 5000, appliesTo: "all", headNames: [] })).toBe("₹5,000 off every fee");
  });

  it("a raise above 10% on last year's fees says it may need the fee committee's approval; a small one says nothing", () => {
    expect(raiseNote(10, 10)).toBeUndefined();
    expect(raiseNote(0, 10)).toBeUndefined();
    expect(raiseNote(12, 10)).toBe("More than 10% over last year needs the fee committee's approval in some states (Madhya Pradesh: 10%). Check your state's rule.");
  });
});

describe("the due rules, as a parent reads them", () => {
  it("says a day of the month with its ending: 1st, 2nd, 3rd, 5th, 11th, 12th, 13th, 21st, 22nd, 28th", () => {
    expect([1, 2, 3, 5, 10, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual(["1st", "2nd", "3rd", "5th", "10th", "11th", "12th", "13th", "21st", "22nd", "23rd", "28th"]);
  });

  it("gives the due day, the days to pay without a fine, and what a late payment costs", () => {
    const none = { dueDay: 10, graceDays: 0, lateFine: { mode: "none" as const, amount: 0, maxAmount: null } };
    expect(dueRulesWords(none)).toEqual(["Due on the 10th of the month."]);
    expect(dueRulesWords({ ...none, graceDays: 1 })).toEqual(["Due on the 10th of the month.", "1 day to pay without a fine."]);
    expect(dueRulesWords({ dueDay: 5, graceDays: 3, lateFine: { mode: "flat", amount: 100, maxAmount: null } })).toEqual(["Due on the 5th of the month.", "3 days to pay without a fine.", "Late fine: ₹100."]);
    expect(dueRulesWords({ ...none, lateFine: { mode: "per_day", amount: 10, maxAmount: 500 } }).at(-1)).toBe("Late fine: ₹10 for each day late (up to ₹500).");
    expect(dueRulesWords({ ...none, lateFine: { mode: "percent_per_month", amount: 2, maxAmount: null } }).at(-1)).toBe("Late fine: 2% of what is due for each month late.");
  });
});

describe("the late fine, as the Collect window offers it (the server's rule, repeated)", () => {
  const rules = (mode: "none" | "flat" | "per_day" | "percent_per_month", amount: number, maxAmount: number | null = null, graceDays = 0) => ({ graceDays, lateFine: { mode, amount, maxAmount } });
  // 9 days late, 40 days late, and one that is not due yet.
  const rows = [
    { base: 1000, dueDate: "2026-11-10" },
    { base: 2000, dueDate: "2026-10-10" },
    { base: 500, dueDate: "2026-12-10" },
  ];
  const on = "2026-11-19";

  it("counts days between two days", () => {
    expect(daysBetween("2026-11-19", "2026-11-10")).toBe(9);
    expect(daysBetween("2026-11-10", "2026-11-19")).toBe(-9);
  });

  it("is the same as the server for each mode, with a cap and with grace", () => {
    expect(lateFineFor(rules("none", 100), rows, on)).toBe(0);
    expect(lateFineFor(rules("flat", 100), rows, on)).toBe(200);
    expect(lateFineFor(rules("per_day", 10), rows, on)).toBe(490);
    expect(lateFineFor(rules("percent_per_month", 2), rows, on)).toBe(100);
    expect(lateFineFor(rules("per_day", 10, 300), rows, on)).toBe(300);
    expect(lateFineFor(rules("flat", 100, null, 10), rows, on)).toBe(100);
  });
});
