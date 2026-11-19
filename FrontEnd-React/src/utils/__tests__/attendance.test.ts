import { describe, expect, it } from "vitest";
import type { StudentRangeRow } from "../../types";
import { cameToSchool, dayCount, daySplit, isLowPercent, lateText, percentText, rangePresets, showsEveryDay, studentStartRange, teacherLook, weekColumns, weekdayLetter } from "../attendance";

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

describe("the week the school reads (2026-11-16): Monday to Saturday", () => {
  it("with weeks asked for, This week and Last week come after Today; without, the list is the old one", () => {
    expect(rangePresets("2026-11-16", true).map((p) => p.id)).toEqual(["today", "week", "lastWeek", "month", "lastMonth", "quarter"]);
    expect(rangePresets("2026-11-16").map((p) => p.id)).toEqual(["today", "month", "lastMonth", "quarter"]);
  });

  it("on a Monday This week starts that day and ends on Saturday; Last week is the six days before", () => {
    const presets = rangePresets("2026-11-16", true);
    expect(presets.find((p) => p.id === "week")).toMatchObject({ label: "This week", from: "2026-11-16", to: "2026-11-21" });
    expect(presets.find((p) => p.id === "lastWeek")).toMatchObject({ label: "Last week", from: "2026-11-09", to: "2026-11-14" });
  });

  it("on a Wednesday and on a Saturday it is still that Monday's week", () => {
    expect(rangePresets("2026-11-18", true).find((p) => p.id === "week")).toMatchObject({ from: "2026-11-16", to: "2026-11-21" });
    expect(rangePresets("2026-11-21", true).find((p) => p.id === "week")).toMatchObject({ from: "2026-11-16", to: "2026-11-21" });
  });

  it("a Sunday belongs to the week that ended the day before (Sunday is not a school day)", () => {
    expect(rangePresets("2026-11-15", true).find((p) => p.id === "week")).toMatchObject({ from: "2026-11-09", to: "2026-11-14" });
  });

  it("goes back over a month's and a year's end", () => {
    expect(rangePresets("2027-01-01", true).find((p) => p.id === "week")).toMatchObject({ from: "2026-12-28", to: "2027-01-02" });
    expect(rangePresets("2027-01-01", true).find((p) => p.id === "lastWeek")).toMatchObject({ from: "2026-12-21", to: "2026-12-26" });
  });

  it("the Student page opens on this week; a year that is over opens on its last month, as before", () => {
    expect(studentStartRange("2026-11-18", null)).toEqual({ from: "2026-11-16", to: "2026-11-21" });
    expect(studentStartRange("2026-11-18", { endDate: "2026-03-31" })).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });
});

describe("a day of a class, split into who was there and who was not", () => {
  const kid = (id: string, name: string, roll: number, records: StudentRangeRow["records"]): StudentRangeRow => ({
    id,
    name,
    admissionNumber: `ADM-${roll}`,
    rollNumber: roll,
    section: null,
    records,
    tally: { present: 0, absent: 0, late: 0, leave: 0, days: records.length, percent: null },
  });
  const students = [
    kid("a", "Asha", 1, [{ date: "2026-11-03", status: "present", reason: null }]),
    kid("b", "Kabir", 2, [{ date: "2026-11-03", status: "absent", reason: "Fever" }]),
    kid("c", "Chitra", 3, [{ date: "2026-11-03", status: "late", reason: "Bus was late" }]),
    kid("d", "Dev", 4, [{ date: "2026-11-03", status: "leave", reason: "Wedding" }]),
    kid("e", "Esha", 5, [{ date: "2026-11-04", status: "present", reason: null }]),
  ];

  it("present and late are on one side (late is still there), absent and leave on the other, in the order given", () => {
    const split = daySplit(students, "2026-11-03");
    expect(split.present.map((p) => [p.student.name, p.status])).toEqual([["Asha", "present"], ["Chitra", "late"]]);
    expect(split.absent.map((p) => [p.student.name, p.status])).toEqual([["Kabir", "absent"], ["Dev", "leave"]]);
  });

  it("carries the reason of each mark", () => {
    const split = daySplit(students, "2026-11-03");
    expect(split.absent[0].reason).toBe("Fever");
    expect(split.present[0].reason).toBeNull();
  });

  it("a child with no mark that day is on neither side", () => {
    const split = daySplit(students, "2026-11-04");
    expect(split.present.map((p) => p.student.name)).toEqual(["Esha"]);
    expect(split.absent).toEqual([]);
  });
});

describe("did the child come (2026-11-17): two answers, not four", () => {
  it("present and late are there; absent and leave are not", () => {
    expect(cameToSchool("present")).toBe(true);
    expect(cameToSchool("late")).toBe(true);
    expect(cameToSchool("absent")).toBe(false);
    expect(cameToSchool("leave")).toBe(false);
  });
});

describe("the whole week is in the register, also the days that have not come (2026-11-16)", () => {
  // The server stops at today: on Monday it sends Monday only.
  const sent = (...dates: string[]) => dates.map((date) => ({ date, weekday: new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7, holiday: null, taken: true }));

  it("on Monday the register has Monday to Saturday; the five that have not come are marked coming", () => {
    const columns = weekColumns(sent("2026-11-16"), { from: "2026-11-16", to: "2026-11-21" }, "2026-11-16");
    expect(columns.map((c) => c.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(columns.map((c) => c.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(columns.map((c) => c.coming === true)).toEqual([false, true, true, true, true, true]);
    expect(columns[1]).toMatchObject({ holiday: null, taken: false });
  });

  it("midweek only the days after the last one sent are added", () => {
    const columns = weekColumns(sent("2026-11-16", "2026-11-17", "2026-11-18"), { from: "2026-11-16", to: "2026-11-21" }, "2026-11-18");
    expect(columns.filter((c) => c.coming).map((c) => c.date)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21"]);
  });

  it("a week that is over, or a month, is left as the server sent it", () => {
    const week = sent("2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14");
    expect(weekColumns(week, { from: "2026-11-09", to: "2026-11-14" }, "2026-11-14")).toEqual(week);
    const month = sent("2026-11-01", "2026-11-02");
    expect(weekColumns(month, { from: "2026-11-01", to: "2026-11-30" }, "2026-11-02")).toEqual(month);
  });

  it("a week that has not started has all its days coming, none before the week", () => {
    const columns = weekColumns([], { from: "2026-11-23", to: "2026-11-28" }, "2026-11-16");
    expect(columns.map((c) => c.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
    expect(columns.every((c) => c.coming)).toBe(true);
  });
});
