import { describe, expect, it } from "vitest";
import { comparisonLabel, dayState, indiaMinutes, percentChange, pointsChange, rangeFor, rangeLabel, stepDays, todayLabel } from "../dashboardRange";

/** 10 Nov 2026 is a Tuesday. */
const TODAY = "2026-11-10";

describe("the days a tab means", () => {
  it("Today is today; This week is Monday to Sunday; This month is the first day to the last", () => {
    expect(rangeFor("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(rangeFor("week", TODAY)).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(rangeFor("month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("a Sunday belongs to the week that began on the Monday before; a month knows its own length", () => {
    expect(rangeFor("week", "2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(rangeFor("week", "2026-11-09")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(rangeFor("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(rangeFor("month", "2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("stepping moves the days by their own length: a day, a week, a run of days", () => {
    expect(stepDays({ from: TODAY, to: TODAY }, -1)).toEqual({ from: "2026-11-09", to: "2026-11-09" });
    expect(stepDays({ from: TODAY, to: TODAY }, 1)).toEqual({ from: "2026-11-11", to: "2026-11-11" });
    expect(stepDays({ from: "2026-11-09", to: "2026-11-15" }, -1)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(stepDays({ from: "2026-11-28", to: "2026-12-02" }, 1)).toEqual({ from: "2026-12-03", to: "2026-12-07" });
  });
});

describe("how the days are said", () => {
  it("Today, Yesterday and Tomorrow by name, any other day by its weekday", () => {
    expect(todayLabel(TODAY, TODAY)).toBe("Today, 10 Nov");
    expect(todayLabel("2026-11-09", TODAY)).toBe("Yesterday, 9 Nov");
    expect(todayLabel("2026-11-11", TODAY)).toBe("Tomorrow, 11 Nov");
    expect(todayLabel("2026-11-06", TODAY)).toBe("Fri, 6 Nov");
  });

  it("a run of days is its first and last day; one day is itself; a run in two months or years keeps them", () => {
    expect(rangeLabel({ from: "2026-11-01", to: "2026-11-30" })).toBe("1 Nov – 30 Nov");
    expect(rangeLabel({ from: TODAY, to: TODAY })).toBe("10 Nov");
    expect(rangeLabel({ from: "2026-12-28", to: "2027-01-03" })).toBe("28 Dec 2026 – 3 Jan 2027");
  });

  it("each tab compares with what came just before it", () => {
    expect([comparisonLabel("today"), comparisonLabel("week"), comparisonLabel("month"), comparisonLabel("custom")]).toEqual(["yesterday", "last week", "last month", "previous period"]);
  });
});

describe("the change from the days before", () => {
  it("is a percent of what there was; New when there was nothing; nothing at all when neither has any", () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(10, 10)).toBe(0);
    expect(percentChange(3, 0)).toBe("new");
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(0, 4)).toBe(-100);
  });

  it("a share is compared in points, and only when both days have one", () => {
    expect(pointsChange(86, 80)).toBe(6);
    expect(pointsChange(70, 80)).toBe(-10);
    expect(pointsChange(null, 80)).toBeNull();
    expect(pointsChange(80, null)).toBeNull();
  });
});

describe("school's day, as the line under the figures says it", () => {
  const school = { working: true, holiday: null, start: "08:30", end: "14:20" };
  const at = (h: number, m: number) => h * 60 + m;

  it("before school: not open yet and when it opens; during it: open, with how long is left and how much has gone; after: closed", () => {
    expect(dayState(school, at(7, 0))).toEqual({ label: "Not open yet", open: false, hours: "08:30 – 14:20", readout: "Opens 08:30", percent: 0 });
    expect(dayState(school, at(11, 0))).toMatchObject({ label: "Open now", open: true, readout: "3h 20m left", percent: 43 });
    expect(dayState(school, at(14, 0))).toMatchObject({ label: "Open now", open: true, readout: "20m left" });
    expect(dayState(school, at(15, 0))).toEqual({ label: "Closed now", open: false, hours: "08:30 – 14:20", readout: "Closed at 14:20", percent: 100 });
  });

  it("a holiday and a day without school say so, with no hours", () => {
    expect(dayState({ working: false, holiday: "Diwali", start: null, end: null }, at(10, 0))).toEqual({ label: "Holiday", open: false, hours: null, readout: "Diwali", percent: null });
    expect(dayState({ working: false, holiday: null, start: null, end: null }, at(10, 0))).toEqual({ label: "No school today", open: false, hours: null, readout: null, percent: null });
  });

  it("the minutes of the day are read in India, whatever the computer's clock says", () => {
    // 04:30 UTC is 10:00 in India.
    expect(indiaMinutes(new Date("2026-11-10T04:30:00Z"))).toBe(600);
    expect(indiaMinutes(new Date("2026-11-10T18:45:00Z"))).toBe(15); // 00:15 the next day
  });
});
