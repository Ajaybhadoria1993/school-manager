import { describe, expect, it } from "vitest";
import type { Schedule, Slot } from "../../types";
import { classDayBody, classWeek, daySummaryOf, periodCount, referenceDay, resolveSlots, rowsFor, sameRows, withPeriods } from "../classWeek";

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

describe("a day with more or fewer periods", () => {
  it("fewer: keeps the rows up to that period (the lunch stays where it was) and drops what comes after", () => {
    expect(withPeriods(EIGHT, 5)).toEqual(FIVE);
    expect(withPeriods(EIGHT, 2)).toEqual([EIGHT[0], EIGHT[1]]);
    // The lunch after the last period is not kept.
    expect(withPeriods(EIGHT, 3)).toEqual(EIGHT.slice(0, 3));
  });

  it("more: after the last row, as long as the last period", () => {
    const ten = withPeriods(EIGHT, 10)!;
    expect(periodCount(ten)).toBe(10);
    expect(ten.slice(0, 9)).toEqual(EIGHT);
    expect(ten.slice(9)).toEqual([p("14:20", "15:00"), p("15:00", "15:40")]);
  });

  it("as many as it has: the rows as they are, even with a break at the end", () => {
    const rows = [...FOUR, brk("11:40", "11:50")];
    expect(withPeriods(rows, 4)).toEqual(rows);
  });

  it("none: no rows (no school that day)", () => {
    expect(withPeriods(EIGHT, 0)).toEqual([]);
  });

  it("cannot start from nothing, and cannot run past midnight", () => {
    expect(withPeriods([], 3)).toBeNull();
    expect(withPeriods([lunch("12:00", "12:30")], 3)).toBeNull();
    expect(withPeriods([p("22:00", "23:30")], 2)).toBeNull();
  });
});

describe("the rows a day gets for a number of periods", () => {
  const regular = timing("Regular");
  const dayOf = (schedules: Schedule[], day: number, classId = "nursery") => classWeek(schedules, classId)[day - 1];
  const reference = (schedules: Schedule[], classId = "nursery") => referenceDay(classWeek(schedules, classId));

  it("the day as it is when the number is the same", () => {
    const d = dayOf([regular], 1);
    expect(rowsFor(d, 8, reference([regular]))).toBe(d.current);
  });

  it("changes the school's day for this class: fewer from the end, more after it", () => {
    const d = dayOf([regular], 1);
    expect(rowsFor(d, 5, reference([regular]))).toEqual(FIVE);
    expect(periodCount(rowsFor(d, 9, reference([regular]))!)).toBe(9);
  });

  it("going back up from a trimmed day of its own gives the school's day again, not a copy that differs", () => {
    const own = timing("Nursery", { days: [1], scope: "only", classIds: ["nursery"], slots: FIVE });
    const d = dayOf([regular, own], 1);
    const back = rowsFor(d, 8, reference([regular, own]))!;
    expect(sameRows(back, d.inherited)).toBe(true);
  });

  it("an own day with times of its own keeps them when the number changes", () => {
    const own = timing("Nursery", { days: [1], scope: "only", classIds: ["nursery"], slots: FOUR });
    const d = dayOf([regular, own], 1);
    expect(rowsFor(d, 3, reference([regular, own]))).toEqual(FOUR.slice(0, 3));
    expect(rowsFor(d, 5, reference([regular, own]))!.slice(4)).toEqual([p("11:40", "12:20")]);
  });

  it("a day with no school gets the class's fullest day to start from; a class with no timing at all gets the usual day", () => {
    const d = dayOf([regular], 7);
    expect(rowsFor(d, 4, reference([regular]))).toEqual(EIGHT.slice(0, 5));
    const none = dayOf([], 1);
    const fresh = rowsFor(none, 5, reference([]))!;
    expect(periodCount(fresh)).toBe(5);
    expect(fresh[0].start).toBe("08:30");
    expect(rowsFor(none, 0, reference([]))).toEqual([]);
  });
});

describe("what is sent", () => {
  const regular = timing("Regular");
  const week = (schedules: Schedule[]) => classWeek(schedules, "nursery");
  const counts = (days: ReturnType<typeof classWeek>) => Object.fromEntries(days.map((d) => [d.day, periodCount(d.current)]));

  it("only the days that differ from what the class would follow anyway; the rest are left to follow", () => {
    const days = week([regular]);
    const sent = classDayBody("nursery", days, { ...counts(days), 1: 5, 7: 0 }, referenceDay(days), false);
    expect(sent.problem).toBeNull();
    expect(sent.body.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5"]);
    expect(sent.body).toMatchObject({ classId: "nursery", removeLessons: false });
  });

  it("a holiday is a day with no rows, and a day with no school can be given periods", () => {
    const days = week([regular]);
    const sent = classDayBody("nursery", days, { ...counts(days), 6: 0, 7: 3 }, referenceDay(days), false);
    expect(sent.body.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["6:0", "7:3"]);
  });

  it("days that are already the class's own stay in what is sent, so changing one does not give the others back", () => {
    const own = timing("Nursery", { days: [1, 2], scope: "only", classIds: ["nursery"], slots: FIVE });
    const days = week([regular, own]);
    const sent = classDayBody("nursery", days, { ...counts(days), 3: 6 }, referenceDay(days), false);
    expect(sent.body.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5", "2:5", "3:6"]);
  });

  it("every day back to what the school has: no days at all (the class follows the school)", () => {
    const own = timing("Nursery", { days: [1], scope: "only", classIds: ["nursery"], slots: FIVE });
    const days = week([regular, own]);
    const sent = classDayBody("nursery", days, { ...counts(days), 1: 8 }, referenceDay(days), true);
    expect(sent.body.days).toEqual([]);
    expect(sent.body.removeLessons).toBe(true);
  });

  it("says when a day cannot be made (it would run past midnight)", () => {
    const late = timing("Late", { slots: [p("22:00", "23:30")], days: [1] });
    const days = week([late]);
    const sent = classDayBody("nursery", days, { ...counts(days), 1: 3 }, referenceDay(days), false);
    expect(sent.problem).toBe("Monday cannot have 3 periods: the day would run past midnight.");
  });
});

describe("a day in words", () => {
  it("the first and last time, the periods and the lunch; no school for a day with no rows", () => {
    expect(daySummaryOf(FIVE)).toBe("08:30 to 12:20 · lunch 10:30 to 11:00");
    expect(daySummaryOf(FOUR)).toBe("09:00 to 11:40");
    expect(daySummaryOf([])).toBe("No school");
  });
});
