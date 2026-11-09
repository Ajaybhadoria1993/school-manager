import { describe, it, expect } from "vitest";
import { clockToMinutes, minutesToClock, overlaps } from "../time";
import {
  FUTURE_CLASS,
  appliesTo,
  clashes,
  periodsOf,
  resolveSchedule,
  slotProblems,
  weekPeriods,
  type ScheduleRule,
  type Slot,
} from "../services/scheduleRules";

const t = (clock: string) => clockToMinutes(clock)!;
const period = (start: string, end: string, label = ""): Slot => ({ kind: "period", label, start: t(start), end: t(end) });
const lunch = (start: string, end: string): Slot => ({ kind: "lunch", label: "Lunch", start: t(start), end: t(end) });
const rest = (start: string, end: string, label = "Short break"): Slot => ({ kind: "break", label, start: t(start), end: t(end) });

const rule = (id: string, over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id,
  name: id,
  days: [1, 2, 3, 4, 5],
  scope: "all",
  classIds: [],
  slots: [period("08:30", "09:10"), period("09:10", "09:50")],
  ...over,
});

describe("times of day", () => {
  it("are read from HH:MM and written back, and nothing else is a time", () => {
    expect(clockToMinutes("08:30")).toBe(510);
    expect(clockToMinutes("00:00")).toBe(0);
    expect(clockToMinutes("23:59")).toBe(1439);
    expect(minutesToClock(510)).toBe("08:30");
    expect(minutesToClock(0)).toBe("00:00");
    for (const bad of ["8:30", "24:00", "12:60", "12", "", "ab:cd", "12:5", "12:30pm"]) expect(clockToMinutes(bad), bad).toBeNull();
  });

  it("overlap only when they share time: one ending as the other starts do not", () => {
    expect(overlaps({ start: 510, end: 550 }, { start: 540, end: 580 })).toBe(true);
    expect(overlaps({ start: 510, end: 550 }, { start: 550, end: 590 })).toBe(false);
    expect(overlaps({ start: 510, end: 590 }, { start: 520, end: 530 })).toBe(true);
  });
});

describe("which timing a class follows on a day", () => {
  it("is the one that covers the day and the class; a class no timing covers has no school that day", () => {
    const regular = rule("Regular");
    const saturday = rule("Saturday", { days: [6] });
    expect(resolveSchedule([regular, saturday], "c1", 3)?.id).toBe("Regular");
    expect(resolveSchedule([regular, saturday], "c1", 6)?.id).toBe("Saturday");
    expect(resolveSchedule([regular, saturday], "c1", 7)).toBeNull();
  });

  it("prefers a timing made for the class over one made for all classes", () => {
    const regular = rule("Regular");
    const junior = rule("Junior", { scope: "only", classIds: ["nursery", "lkg"] });
    expect(resolveSchedule([regular, junior], "nursery", 2)?.id).toBe("Junior");
    expect(resolveSchedule([regular, junior], "c5", 2)?.id).toBe("Regular");
  });

  it("prefers a timing made for named classes over a department's, and a department's over the school's", () => {
    const regular = rule("Regular");
    const pre = rule("Pre-Primary", { scope: "only", classIds: ["nursery", "lkg"], departmentId: "dep-pre" });
    const own = rule("Zero Nursery", { scope: "only", classIds: ["nursery"] });
    expect(resolveSchedule([regular, pre], "nursery", 2)?.id).toBe("Pre-Primary");
    expect(resolveSchedule([regular, pre, own], "nursery", 2)?.id).toBe("Zero Nursery");
    expect(resolveSchedule([regular, pre, own], "lkg", 2)?.id).toBe("Pre-Primary");
    expect(resolveSchedule([regular, pre, own], "c5", 2)?.id).toBe("Regular");
  });

  it("a timing made for a class that has no periods is a holiday for it, even when its department or the school has school", () => {
    const regular = rule("Regular");
    const pre = rule("Pre-Primary", { scope: "only", classIds: ["nursery"], departmentId: "dep-pre" });
    const off = rule("Nursery holiday", { days: [2], scope: "only", classIds: ["nursery"], slots: [] });
    expect(resolveSchedule([regular, pre, off], "nursery", 2)).toBeNull();
    expect(resolveSchedule([regular, pre, off], "nursery", 3)?.id).toBe("Pre-Primary");
  });

  it('"all but these classes" leaves the listed classes without school that day', () => {
    const saturday = rule("Saturday", { days: [6], scope: "except", classIds: ["nursery"] });
    expect(resolveSchedule([saturday], "c5", 6)?.id).toBe("Saturday");
    expect(resolveSchedule([saturday], "nursery", 6)).toBeNull();
    expect(appliesTo(saturday, "nursery")).toBe(false);
    expect(appliesTo(saturday, "c5")).toBe(true);
  });

  it("lists the periods of a day in order, numbered from 1, whatever breaks are between them", () => {
    const day = rule("Regular", { slots: [period("08:30", "09:10"), period("09:10", "09:50"), lunch("09:50", "10:20"), period("10:20", "11:00", "Library")] });
    expect(periodsOf(day)).toEqual([
      { period: 1, label: "Period 1", start: t("08:30"), end: t("09:10") },
      { period: 2, label: "Period 2", start: t("09:10"), end: t("09:50") },
      { period: 3, label: "Library", start: t("10:20"), end: t("11:00") },
    ]);
  });

  it("counts the periods a class has in a week, from the timing of each of its days", () => {
    const regular = rule("Regular", { slots: [period("08:30", "09:10"), period("09:10", "09:50"), period("10:00", "10:40")] });
    const saturday = rule("Saturday", { days: [6], slots: [period("08:30", "09:10"), period("09:10", "09:50")] });
    expect(weekPeriods([regular, saturday], "c5")).toEqual([
      { day: 1, periods: 3 },
      { day: 2, periods: 3 },
      { day: 3, periods: 3 },
      { day: 4, periods: 3 },
      { day: 5, periods: 3 },
      { day: 6, periods: 2 },
    ]);
  });
});

describe("two timings that cannot both be true", () => {
  it("two for all classes on the same day clash, even when the school has no class yet", () => {
    const found = clashes([rule("Regular"), rule("Winter", { days: [5, 6] })], []);
    expect(found).toEqual([{ classId: FUTURE_CLASS, day: 5, first: "Regular", second: "Winter" }]);
  });

  it("two made for the same class on the same day clash", () => {
    const a = rule("Junior A", { scope: "only", classIds: ["nursery", "lkg"] });
    const b = rule("Junior B", { scope: "only", classIds: ["lkg"] });
    const found = clashes([a, b], ["nursery", "lkg"]);
    expect(found.map((c) => `${c.classId} ${c.day}`)).toEqual(["lkg 1", "lkg 2", "lkg 3", "lkg 4", "lkg 5"]);
  });

  it("one for a class and one for all classes do not clash (the class's own wins), and different days do not clash", () => {
    const regular = rule("Regular");
    const junior = rule("Junior", { scope: "only", classIds: ["nursery"] });
    const saturday = rule("Saturday", { days: [6] });
    expect(clashes([regular, junior, saturday], ["nursery", "c5"])).toEqual([]);
  });

  it("one for named classes and a department's do not clash (the named classes' own wins); two for the same department still do", () => {
    const pre = rule("Pre-Primary", { scope: "only", classIds: ["nursery", "lkg"], departmentId: "dep-pre" });
    const own = rule("Zero Nursery", { scope: "only", classIds: ["nursery"], days: [1] });
    expect(clashes([rule("Regular"), pre, own], ["nursery", "lkg"])).toEqual([]);
    const second = rule("Pre-Primary 2", { scope: "only", classIds: ["nursery"], departmentId: "dep-pre", days: [1] });
    expect(clashes([pre, second], ["nursery", "lkg"]).map((c) => `${c.classId} ${c.day}`)).toEqual(["nursery 1"]);
  });

  it('"all but" and "all" clash on a shared day (a class is in both)', () => {
    const all = rule("Regular");
    const except = rule("Other", { scope: "except", classIds: ["nursery"] });
    expect(clashes([all, except], ["nursery", "c5"]).some((c) => c.classId === "c5")).toBe(true);
  });
});

describe("the rows of a day's timing", () => {
  const problems = (slots: Slot[]) => slotProblems(slots).map((p) => `${p.path}: ${p.message}`);

  it("accept a day with periods, a short break and a lunch in order", () => {
    expect(problems([period("08:30", "09:10"), period("09:10", "09:50"), rest("09:50", "10:00"), period("10:00", "10:40"), lunch("10:40", "11:10"), period("11:10", "11:50")])).toEqual([]);
  });

  it("accept a gap between two rows (the school's own choice)", () => {
    expect(problems([period("08:30", "09:10"), period("09:20", "10:00")])).toEqual([]);
  });

  it("need at least one period", () => {
    expect(problems([])).toEqual(["slots: Add at least one period"]);
    expect(problems([lunch("10:00", "10:30")])).toEqual(["slots: Add at least one period"]);
  });

  it("refuse a row that ends before it starts, or lasts no time", () => {
    expect(problems([period("09:10", "08:30")])).toEqual(["slots.0.end: The end must be after the start"]);
    expect(problems([period("09:10", "09:10")])).toEqual(["slots.0.end: The end must be after the start"]);
  });

  it("keep a period between 10 minutes and 2 hours, and a break up to 3 hours", () => {
    expect(problems([period("08:30", "08:35")])).toEqual(["slots.0.end: A period lasts 10 to 120 minutes"]);
    expect(problems([period("08:30", "11:00")])).toEqual(["slots.0.end: A period lasts 10 to 120 minutes"]);
    expect(problems([period("08:30", "09:10"), rest("09:10", "12:30")])).toEqual(["slots.1.end: A break lasts up to 180 minutes"]);
  });

  it("refuse a row that starts before the row above ends, naming the time", () => {
    expect(problems([period("08:30", "09:10"), period("09:00", "09:40")])).toEqual(["slots.1.start: Starts before the row above ends (09:10)"]);
  });

  it("allow one lunch only", () => {
    expect(problems([period("08:30", "09:10"), lunch("09:10", "09:40"), period("09:40", "10:20"), lunch("10:20", "10:50")])).toEqual(["slots.3.kind: A day has one lunch break"]);
  });

  it("allow up to 12 periods and 24 rows", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => period(minutesToClock(480 + i * 30), minutesToClock(480 + i * 30 + 30)));
    expect(problems(thirteen)).toEqual(["slots: Up to 12 periods in a day"]);
    const many = Array.from({ length: 25 }, (_, i) => rest(minutesToClock(300 + i * 10), minutesToClock(300 + i * 10 + 5)));
    expect(problems([period("04:00", "04:40"), ...many])).toContain("slots: Up to 24 rows in a day");
  });
});
