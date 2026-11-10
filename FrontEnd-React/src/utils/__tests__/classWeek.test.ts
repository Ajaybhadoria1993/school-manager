import { describe, expect, it } from "vitest";
import type { Schedule, Slot } from "../../types";
import { classHours, classTimingBody, classWeek, daySummaryOf, periodCount, resolveSlots, rowsBetween, rowsForPeriods } from "../classWeek";

const p = (start: string, end: string, label = ""): Slot => ({ kind: "period", label, start, end });
const lunch = (start: string, end: string): Slot => ({ kind: "lunch", label: "Lunch", start, end });
const brk = (start: string, end: string): Slot => ({ kind: "break", label: "Short break", start, end });

/** Eight periods of 40 minutes from 08:30, the lunch 10:30 to 11:00 after the third. */
const EIGHT: Slot[] = [p("08:30", "09:10"), p("09:10", "09:50"), p("09:50", "10:30"), lunch("10:30", "11:00"), p("11:00", "11:40"), p("11:40", "12:20"), p("12:20", "13:00"), p("13:00", "13:40"), p("13:40", "14:20")];
const FIVE = EIGHT.slice(0, 6);
const FOUR: Slot[] = [p("09:00", "09:40"), p("09:40", "10:20"), p("10:20", "11:00"), p("11:00", "11:40")];

const timing = (id: string, over: Partial<Schedule> = {}): Schedule => ({
  id,
  name: id,
  days: [1, 2, 3, 4, 5, 6],
  scope: "all",
  classIds: [],
  departmentId: null,
  slots: EIGHT,
  periods: periodCount(over.slots ?? EIGHT),
  ...over,
});

describe("which rows a class follows on each day", () => {
  it("the school's day for every day it has, none for a day nobody has school", () => {
    const week = classWeek([timing("Regular")], "nursery");
    expect(week.map((d) => `${d.day}:${periodCount(d.current)}`)).toEqual(["1:8", "2:8", "3:8", "4:8", "5:8", "6:8", "7:0"]);
    expect(week.every((d) => !d.own)).toBe(true);
    expect(week[0].inherited).toEqual(EIGHT);
  });

  it("a day of the class's own is marked, and what the class would follow without it is kept", () => {
    const own = timing("Nursery", { days: [1], scope: "only", classIds: ["nursery"], slots: FIVE });
    const week = classWeek([timing("Regular"), own], "nursery");
    expect(week[0]).toMatchObject({ day: 1, own: true });
    expect(periodCount(week[0].current)).toBe(5);
    expect(periodCount(week[0].inherited)).toBe(8);
    expect(week[1].own).toBe(false);
    // Another class sees none of it.
    expect(periodCount(classWeek([timing("Regular"), own], "lkg")[0].current)).toBe(8);
  });

  it("a timing made for several classes is not the class's own: it is what the class follows", () => {
    const little = timing("Little ones", { days: [1], scope: "only", classIds: ["nursery", "lkg"], slots: FOUR });
    const day = classWeek([timing("Regular"), little], "nursery")[0];
    expect(day.own).toBe(false);
    expect(periodCount(day.inherited)).toBe(4);
  });

  it("follows the department's timing, and the class's own beats it", () => {
    const pre = timing("Pre-Primary", { scope: "only", classIds: ["nursery"], departmentId: "dep", slots: FOUR });
    const own = timing("Nursery", { days: [1], scope: "only", classIds: ["nursery"], slots: FIVE });
    expect(resolveSlots([timing("Regular"), pre], "nursery", 2)).toEqual(FOUR);
    expect(resolveSlots([timing("Regular"), pre, own], "nursery", 1)).toEqual(FIVE);
    expect(resolveSlots([timing("Regular"), pre, own], "nursery", 2)).toEqual(FOUR);
  });

  it("a timing with no rows is a holiday, and 'all but' leaves the listed classes out", () => {
    const off = timing("Nursery holiday", { days: [6], scope: "only", classIds: ["nursery"], slots: [] });
    expect(resolveSlots([timing("Regular"), off], "nursery", 6)).toBeNull();
    const but = timing("Saturday", { days: [6], scope: "except", classIds: ["nursery"] });
    expect(resolveSlots([but], "nursery", 6)).toBeNull();
    expect(resolveSlots([but], "lkg", 6)).toEqual(EIGHT);
  });
});

describe("a class that comes at other hours", () => {
  it("the school's own hours give the school's day, rows and all", () => {
    expect(rowsBetween("08:30", "14:20", EIGHT)).toEqual(EIGHT);
  });

  it("shorter hours end the day after the last period that fits (the lunch stays where it was)", () => {
    expect(rowsBetween("08:30", "12:20", EIGHT)).toEqual(FIVE);
  });

  it("another start: periods of the school's length from there, the last one cut to end when the class ends", () => {
    const rows = rowsBetween("09:00", "14:00", EIGHT)!;
    expect(rows[0]).toEqual(p("09:00", "09:40"));
    expect(rows[rows.length - 1]).toEqual(p("13:40", "14:00"));
    expect(rows.find((r) => r.kind === "lunch")).toEqual(lunch("10:30", "11:00"));
    expect(rows.every((r) => r.start >= "09:00" && r.end <= "14:00")).toBe(true);
  });

  it("a remainder too short for a period is not a period: the day ends with the last whole one", () => {
    expect(rowsBetween("08:30", "09:15", EIGHT)).toEqual([p("08:30", "09:10")]);
  });

  it("the lunch is kept only when it falls inside the hours", () => {
    const rows = rowsBetween("13:00", "16:00", EIGHT)!;
    expect(rows.some((r) => r.kind !== "period")).toBe(false);
    expect(rows[0]).toEqual(p("13:00", "13:40"));
    expect(rows[rows.length - 1]).toEqual(p("15:40", "16:00"));
  });

  it("the short break is kept where it falls inside the hours", () => {
    const school = [p("08:30", "09:10"), p("09:10", "09:50"), brk("09:50", "10:05"), p("10:05", "10:45"), p("10:45", "11:25")];
    expect(rowsBetween("08:30", "11:25", school)).toEqual(school);
  });

  it("there is no assembly: the class starts with its first period", () => {
    const school: Slot[] = [{ kind: "break", label: "Assembly", start: "08:00", end: "08:15" }, p("08:15", "08:55"), p("08:55", "09:35")];
    const rows = rowsBetween("08:00", "09:35", school)!;
    expect(rows.some((r) => r.label === "Assembly")).toBe(false);
    expect(rows[0]).toEqual(p("08:00", "08:40"));
    expect(rows[rows.length - 1].end).toBe("09:35");
  });

  it("nothing when the end is not after the start, a time is missing, or the hours are too short for a period", () => {
    expect(rowsBetween("14:00", "09:00", EIGHT)).toBeNull();
    expect(rowsBetween("08:30", "08:35", EIGHT)).toBeNull();
    expect(rowsBetween("", "09:00", EIGHT)).toBeNull();
  });

  it("takes the length of a period from the usual day when the school has no rows", () => {
    expect(rowsBetween("08:30", "09:10", [])).toEqual([p("08:30", "09:10")]);
  });
});

describe("what is sent for a class that comes at other hours", () => {
  const regular = timing("Regular", { days: [1, 2, 3, 4, 5] });
  const weekOf = (schedules: Schedule[]) => classWeek(schedules, "nursery");
  const sentDays = (r: ReturnType<typeof classTimingBody>) => r.body.days.map((d) => `${d.day}:${periodCount(d.slots)}`);

  it("every day the class has school gets the hours; only the days that differ from the school's are sent", () => {
    const sent = classTimingBody("nursery", weekOf([regular]), "08:30", "12:20", false);
    expect(sent.problem).toBeNull();
    expect(sentDays(sent)).toEqual(["1:5", "2:5", "3:5", "4:5", "5:5"]);
    expect(sent.body).toMatchObject({ classId: "nursery", removeLessons: false });
  });

  it("the school's own hours send nothing: the class follows the school", () => {
    const sent = classTimingBody("nursery", weekOf([regular]), "08:30", "14:20", false);
    expect(sent.body.days).toEqual([]);
    expect(sent.problem).toBeNull();
  });

  it("a day with no school stays without, and a day the class has off by itself stays off", () => {
    const off = timing("Nursery Wednesday", { days: [3], scope: "only", classIds: ["nursery"], slots: [] });
    const sent = classTimingBody("nursery", weekOf([regular, off]), "08:30", "12:20", false);
    expect(sentDays(sent)).toEqual(["1:5", "2:5", "3:0", "4:5", "5:5"]);
  });

  it("a class with no school at all gets Monday to Friday, made from the usual day", () => {
    const sent = classTimingBody("nursery", weekOf([]), "09:00", "13:00", false);
    expect(sent.body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(sent.body.days[0].slots[0].start).toBe("09:00");
    expect(sent.body.days[0].slots.at(-1)!.end).toBe("13:00");
  });

  it("says why when the hours make no day, and sends nothing", () => {
    const short = classTimingBody("nursery", weekOf([regular]), "08:30", "08:35", false);
    expect(short.problem).toBe("These hours are too short for a period");
    expect(short.body.days).toEqual([]);
    expect(classTimingBody("nursery", weekOf([regular]), "12:00", "09:00", false).problem).toBe("The class must end after it starts");
    expect(classTimingBody("nursery", weekOf([regular]), "", "09:00", false).problem).toBe("Enter when the class starts and ends");
  });

  it("passes on that the lessons in the periods that go may be taken out", () => {
    expect(classTimingBody("nursery", weekOf([regular]), "08:30", "12:20", true).body.removeLessons).toBe(true);
  });
});

describe("the hours a class has now", () => {
  it("the school's day for a class that follows it", () => {
    expect(classHours(classWeek([timing("Regular")], "nursery"))).toEqual({ start: "08:30", end: "14:20" });
  });

  it("the hours of its own day, when it has one", () => {
    const own = timing("Nursery", { days: [1, 2, 3, 4, 5, 6], scope: "only", classIds: ["nursery"], slots: FOUR });
    expect(classHours(classWeek([timing("Regular"), own], "nursery"))).toEqual({ start: "09:00", end: "11:40" });
  });

  it("the usual day for a class with no school at all", () => {
    expect(classHours(classWeek([], "nursery"))).toEqual({ start: "08:30", end: "14:20" });
  });
});

describe("a day in words", () => {
  it("the first and last time, the periods and the lunch; no school for a day with no rows", () => {
    expect(daySummaryOf(FIVE)).toBe("08:30 to 12:20 · lunch 10:30 to 11:00");
    expect(daySummaryOf(FOUR)).toBe("09:00 to 11:40");
    expect(daySummaryOf([])).toBe("No school");
  });
});

describe("a class with a number of periods", () => {
  it("from the start, that many periods with the school's lunch where it falls after them", () => {
    expect(rowsForPeriods("08:30", 5, EIGHT)).toEqual(FIVE);
    // The lunch after the last period is not a row of the day.
    expect(rowsForPeriods("08:30", 3, EIGHT)).toEqual(EIGHT.slice(0, 3));
  });

  it("more than the school's day has: after its last period, as long as the others", () => {
    const nine = rowsForPeriods("08:30", 9, EIGHT)!;
    expect(periodCount(nine)).toBe(9);
    expect(nine.at(-1)).toEqual(p("14:20", "15:00"));
  });

  it("another start moves the whole day (the lunch only if it is still after the start)", () => {
    expect(rowsForPeriods("09:00", 2, EIGHT)).toEqual([p("09:00", "09:40"), p("09:40", "10:20")]);
    expect(rowsForPeriods("12:00", 2, EIGHT)).toEqual([p("12:00", "12:40"), p("12:40", "13:20")]);
  });

  it("nothing for no period, more than a day can have, or a day that would run past midnight", () => {
    expect(rowsForPeriods("08:30", 0, EIGHT)).toBeNull();
    expect(rowsForPeriods("08:30", 13, EIGHT)).toBeNull();
    expect(rowsForPeriods("22:00", 5, EIGHT)).toBeNull();
    expect(rowsForPeriods("", 5, EIGHT)).toBeNull();
  });

  it("the end of those rows, taken as the class's end, gives the same rows back (the number and the hours agree)", () => {
    for (const n of [1, 3, 4, 5, 8, 9]) {
      const rows = rowsForPeriods("08:30", n, EIGHT)!;
      expect(rowsBetween("08:30", rows.at(-1)!.end, EIGHT), `${n} periods`).toEqual(rows);
    }
  });
});

describe("a class's hours on a day the school keeps short", () => {
  const regular = timing("Regular", { days: [1, 2, 3, 4, 5] });
  const saturday = timing("Saturday", { days: [6], slots: FIVE });

  it("are not given to that day: the class follows the school on it", () => {
    const sent = classTimingBody("nursery", classWeek([regular, saturday], "nursery"), "08:30", "10:30", false);
    expect(sent.body.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:3", "2:3", "3:3", "4:3", "5:3"]);
  });

  it("a day of its own on it stays as it was", () => {
    const own = timing("Nursery Saturday", { days: [6], scope: "only", classIds: ["nursery"], slots: FOUR });
    const sent = classTimingBody("nursery", classWeek([regular, saturday, own], "nursery"), "08:30", "10:30", false);
    expect(sent.body.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:3", "2:3", "3:3", "4:3", "5:3", "6:4"]);
  });
});
