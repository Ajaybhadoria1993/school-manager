import { describe, expect, it } from "vitest";
import { hasLater, lengthText, pickDay, pickerPresets, rangeText, stampDay, startMonth, stepRange, yearChoices } from "../dateRange";

/** The date filter of the whole app (2026-11-17, like Infinity Medisetu's): a box that says the days, arrows, and a window to pick them. 17 Nov 2026 is a Tuesday. */

describe("how the days are said", () => {
  it("a day is '17 Nov 26' and a range is two of them with a dash and the number of days", () => {
    expect(stampDay("2026-11-17")).toBe("17 Nov 26");
    expect(stampDay("2027-01-05")).toBe("5 Jan 27");
    expect(rangeText({ from: "2026-11-17", to: "2026-11-17" })).toBe("17 Nov 26 — 17 Nov 26");
    expect(lengthText({ from: "2026-11-17", to: "2026-11-17" })).toBe("1 day");
    expect(lengthText({ from: "2026-11-16", to: "2026-11-21" })).toBe("6 days");
  });
});

describe("the ready-made ranges of the window", () => {
  const presets = pickerPresets("2026-11-17");
  const of = (label: string) => presets.find((p) => p.label === label);

  it("are Today, This Week, Last Week, Last 7 Days, This Month, Last Month and Last 3 Months, in that order", () => {
    expect(presets.map((p) => p.label)).toEqual(["Today", "This Week", "Last Week", "Last 7 Days", "This Month", "Last Month", "Last 3 Months"]);
  });

  it("a week is Monday to Saturday (the school's week), the months are whole", () => {
    expect(of("Today")).toMatchObject({ from: "2026-11-17", to: "2026-11-17" });
    expect(of("This Week")).toMatchObject({ from: "2026-11-16", to: "2026-11-21" });
    expect(of("Last Week")).toMatchObject({ from: "2026-11-09", to: "2026-11-14" });
    expect(of("Last 7 Days")).toMatchObject({ from: "2026-11-11", to: "2026-11-17" });
    expect(of("This Month")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(of("Last Month")).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(of("Last 3 Months")).toMatchObject({ from: "2026-09-01", to: "2026-11-30" });
  });
});

describe("the arrows beside the box", () => {
  it("one day steps one day; a Monday-to-Saturday week steps a whole week; a whole month steps a month", () => {
    expect(stepRange({ from: "2026-11-17", to: "2026-11-17" }, -1)).toEqual({ from: "2026-11-16", to: "2026-11-16" });
    expect(stepRange({ from: "2026-11-16", to: "2026-11-21" }, -1)).toEqual({ from: "2026-11-09", to: "2026-11-14" });
    expect(stepRange({ from: "2026-11-09", to: "2026-11-14" }, 1)).toEqual({ from: "2026-11-16", to: "2026-11-21" });
    expect(stepRange({ from: "2026-11-01", to: "2026-11-30" }, -1)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(stepRange({ from: "2026-12-01", to: "2026-12-31" }, 1)).toEqual({ from: "2027-01-01", to: "2027-01-31" });
  });

  it("any other range steps by its own number of days", () => {
    expect(stepRange({ from: "2026-11-05", to: "2026-11-14" }, -1)).toEqual({ from: "2026-10-26", to: "2026-11-04" });
  });

  it("there is nothing later to look at once the range reaches today", () => {
    expect(hasLater({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-17")).toBe(false);
    expect(hasLater({ from: "2026-11-17", to: "2026-11-17" }, "2026-11-17")).toBe(false);
    expect(hasLater({ from: "2026-11-09", to: "2026-11-14" }, "2026-11-17")).toBe(true);
  });
});

describe("picking days in the calendar: a first click, then a second", () => {
  const start = { from: "2026-11-17", to: "2026-11-17", open: false };

  it("the first click is a day of its own, waiting for the last day", () => {
    expect(pickDay(start, "2026-11-10")).toEqual({ from: "2026-11-10", to: "2026-11-10", open: true });
  });

  it("the second click, on a later day, ends the range", () => {
    const first = pickDay(start, "2026-11-10");
    expect(pickDay(first, "2026-11-14")).toEqual({ from: "2026-11-10", to: "2026-11-14", open: false });
    expect(pickDay(first, "2026-11-10")).toEqual({ from: "2026-11-10", to: "2026-11-10", open: false });
  });

  it("a second click on an earlier day starts again from that day; a click after a whole range starts a new one", () => {
    const first = pickDay(start, "2026-11-10");
    expect(pickDay(first, "2026-11-03")).toEqual({ from: "2026-11-03", to: "2026-11-03", open: true });
    const whole = pickDay(first, "2026-11-14");
    expect(pickDay(whole, "2026-11-20")).toEqual({ from: "2026-11-20", to: "2026-11-20", open: true });
  });
});

describe("the months the window opens on", () => {
  it("a day or a range inside one month opens on that month; a longer range opens with its last month on the right", () => {
    expect(startMonth({ from: "2026-11-17", to: "2026-11-17" })).toBe("2026-11");
    expect(startMonth({ from: "2026-11-01", to: "2026-11-30" })).toBe("2026-11");
    expect(startMonth({ from: "2026-09-01", to: "2026-11-30" })).toBe("2026-10");
    expect(startMonth({ from: "2026-10-28", to: "2026-11-03" })).toBe("2026-10");
  });

  it("the years to choose from reach back a few years and one ahead, and always hold the year being looked at", () => {
    const years = yearChoices("2026-11-17", "2026-11");
    expect(years[0]).toBe("2021");
    expect(years.at(-1)).toBe("2027");
    expect(yearChoices("2026-11-17", "2015-03")).toContain("2015");
  });
});
