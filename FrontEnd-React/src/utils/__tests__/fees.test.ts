import { describe, expect, it } from "vitest";
import { defaultMonths, howOften, monthNames, monthsFrom, monthsProblem, offWords, raiseNote, rupees, sumWords, yearlyCost } from "../fees";

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
