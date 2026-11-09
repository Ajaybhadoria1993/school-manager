import { describe, expect, it } from "vitest";
import { dayCount, isLowPercent, lateText, percentText, rangePresets, showsEveryDay, teacherLook, weekdayLetter } from "../attendance";

/** The rules of the attendance pages (2026-11-06): the ranges the school picks, the words for a teacher's time, the marks. */

describe("the ranges the school can pick", () => {
  it("Today, This month (the default: the 1st to the last day), Last month, Last 3 months", () => {
    const presets = rangePresets("2026-11-06");
    expect(presets.map((p) => p.id)).toEqual(["today", "month", "lastMonth", "quarter"]);
    expect(presets.find((p) => p.id === "today")).toMatchObject({ label: "Today", from: "2026-11-06", to: "2026-11-06" });
    expect(presets.find((p) => p.id === "month")).toMatchObject({ label: "This month", from: "2026-11-01", to: "2026-11-30" });
    expect(presets.find((p) => p.id === "lastMonth")).toMatchObject({ label: "Last month", from: "2026-10-01", to: "2026-10-31" });
    expect(presets.find((p) => p.id === "quarter")).toMatchObject({ label: "Last 3 months", from: "2026-09-01", to: "2026-11-30" });
  });

  it("goes back over a year's end: January's last month is December of the year before", () => {
    const presets = rangePresets("2027-01-15");
    expect(presets.find((p) => p.id === "lastMonth")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(presets.find((p) => p.id === "quarter")).toMatchObject({ from: "2026-11-01", to: "2027-01-31" });
  });

  it("February in a leap year and in an ordinary one", () => {
    expect(rangePresets("2028-02-10").find((p) => p.id === "month")).toMatchObject({ to: "2028-02-29" });
    expect(rangePresets("2027-02-10").find((p) => p.id === "month")).toMatchObject({ to: "2027-02-28" });
  });
});

describe("the days of a range", () => {
  it("counts both ends: one day is 1, a month is 30, May to November is 214", () => {
    expect(dayCount("2026-11-06", "2026-11-06")).toBe(1);
    expect(dayCount("2026-11-01", "2026-11-30")).toBe(30);
    expect(dayCount("2026-05-01", "2026-11-30")).toBe(214);
    expect(dayCount("2026-11-06", "2026-11-01")).toBe(0);
  });

  it("every day gets a column of its own up to a month (31 days); a longer range is shown by its counts", () => {
    expect(showsEveryDay(1)).toBe(true);
    expect(showsEveryDay(31)).toBe(true);
    expect(showsEveryDay(32)).toBe(false);
    expect(showsEveryDay(0)).toBe(false);
  });

  it("the weekday letter over a day's column: Monday M... Sunday S", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(weekdayLetter).join("")).toBe("MTWTFSS");
  });
});

describe("a teacher's time in words", () => {
  it("on the minute or before is on time; a few minutes; an hour and more", () => {
    expect(lateText(0)).toBe("On time");
    expect(lateText(1)).toBe("Late by 1 min");
    expect(lateText(12)).toBe("Late by 12 min");
    expect(lateText(60)).toBe("Late by 1 h");
    expect(lateText(65)).toBe("Late by 1 h 5 min");
    expect(lateText(135)).toBe("Late by 2 h 15 min");
  });

  it("says nothing when the lateness is not known", () => {
    expect(lateText(null)).toBe("");
  });
});

describe("how a teacher's day looks", () => {
  it("each status has its word and a letter for the grid: present P, late L, absent A, off and holiday a dash", () => {
    expect(teacherLook("present")).toMatchObject({ label: "Present", letter: "P" });
    expect(teacherLook("late")).toMatchObject({ label: "Late", letter: "L" });
    expect(teacherLook("absent")).toMatchObject({ label: "Absent", letter: "A" });
    expect(teacherLook("off")).toMatchObject({ label: "Off", letter: "–" });
    expect(teacherLook("holiday")).toMatchObject({ label: "Holiday", letter: "H" });
    expect(teacherLook("pending")).toMatchObject({ label: "Not yet", letter: "·" });
    expect(teacherLook("upcoming")).toMatchObject({ label: "Coming", letter: "·" });
    expect(teacherLook("before")).toMatchObject({ label: "Not joined", letter: "" });
    expect(teacherLook("no_login")).toMatchObject({ label: "No login", letter: "?" });
  });
});

describe("a percentage", () => {
  it("a dash when there is nothing to count", () => {
    expect(percentText(null)).toBe("–");
    expect(percentText(0)).toBe("0%");
    expect(percentText(83)).toBe("83%");
  });
});

describe("below 75% (2026-11-06)", () => {
  it("under 75 is low, 75 and over is not, and nothing to count is not low", () => {
    expect(isLowPercent(74)).toBe(true);
    expect(isLowPercent(0)).toBe(true);
    expect(isLowPercent(75)).toBe(false);
    expect(isLowPercent(100)).toBe(false);
    expect(isLowPercent(null)).toBe(false);
  });

  it("a day on Leave has its word and letter", () => {
    expect(teacherLook("leave")).toMatchObject({ label: "Leave", letter: "Lv" });
  });
});
