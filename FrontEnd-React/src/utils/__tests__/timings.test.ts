import { describe, expect, it } from "vitest";
import type { Slot } from "../../types";
import { clockToMinutes, describeDay, formatMinutes, generateDay, minutesToClock, setupFromSlots, setupProblems, slotProblems, type DaySetup } from "../timings";

const SETUP: DaySetup = { start: "08:30", periodMinutes: 40, periods: 8, assemblyMinutes: 0, lunchStart: "10:30", lunchEnd: "11:00", breakStart: null, breakEnd: null };
const rows = (slots: Slot[]) => slots.map((s) => `${s.kind === "period" ? "P" : s.kind === "lunch" ? "L" : "B"} ${s.start}-${s.end}${s.label && s.kind !== "period" ? ` ${s.label}` : ""}`);
const problems = (slots: Slot[]) => slotProblems(slots).map((p) => `${p.path}: ${p.message}`);

describe("times of day", () => {
  it("are read from HH:MM and written back; anything else is not a time", () => {
    expect(clockToMinutes("08:30")).toBe(510);
    expect(minutesToClock(510)).toBe("08:30");
    for (const bad of ["8:30", "24:00", "12:60", "", "ab"]) expect(clockToMinutes(bad), bad).toBeNull();
  });
});

describe("a length of time in words", () => {
  it("is minutes up to an hour, then hours (and the minutes left): 60 minutes is 1 hr", () => {
    expect([0, 5, 40, 59].map(formatMinutes)).toEqual(["0 min", "5 min", "40 min", "59 min"]);
    expect([60, 90, 120, 135].map(formatMinutes)).toEqual(["1 hr", "1 hr 30 min", "2 hr", "2 hr 15 min"]);
  });
});

describe("making a day from what the head tells: start, period length, number of periods, lunch", () => {
  it("fits the periods round the lunch: the school's own example (08:30, 40 minutes, lunch 10:30 to 11:00, eight periods)", () => {
    const { slots, notes } = generateDay(SETUP);
    expect(rows(slots)).toEqual([
      "P 08:30-09:10",
      "P 09:10-09:50",
      "P 09:50-10:30",
      "L 10:30-11:00 Lunch",
      "P 11:00-11:40",
      "P 11:40-12:20",
      "P 12:20-13:00",
      "P 13:00-13:40",
      "P 13:40-14:20",
    ]);
    expect(notes).toEqual([]);
  });

  it("puts an assembly first and a short break at the time asked (from 09:35 to 09:45)", () => {
    const { slots, notes } = generateDay({ ...SETUP, start: "08:00", assemblyMinutes: 15, periods: 4, lunchStart: null, lunchEnd: null, breakStart: "09:35", breakEnd: "09:45" });
    expect(rows(slots)).toEqual(["B 08:00-08:15 Assembly", "P 08:15-08:55", "P 08:55-09:35", "B 09:35-09:45 Short break", "P 09:45-10:25", "P 10:25-11:05"]);
    expect(notes).toEqual([]);
  });

  it("cuts the period that would run into the short break, as it does for the lunch, and says so", () => {
    const { slots, notes } = generateDay({ ...SETUP, periods: 3, lunchStart: null, lunchEnd: null, breakStart: "09:30", breakEnd: "09:45" });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:30", "B 09:30-09:45 Short break", "P 09:45-10:25"]);
    expect(notes).toEqual(["Period 2 is cut to 20 minutes so that the short break starts at 09:30."]);
  });

  it("puts the short break and the lunch in the order of their times, whichever is filled first", () => {
    const { slots } = generateDay({ ...SETUP, periods: 6, breakStart: "09:50", breakEnd: "10:00", lunchStart: "11:00", lunchEnd: "11:30" });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:50", "B 09:50-10:00 Short break", "P 10:00-10:40", "P 10:40-11:00", "L 11:00-11:30 Lunch", "P 11:30-12:10", "P 12:10-12:50"]);
    const swapped = generateDay({ ...SETUP, periods: 6, breakStart: "11:00", breakEnd: "11:10", lunchStart: "09:50", lunchEnd: "10:20" });
    expect(rows(swapped.slots).filter((r) => !r.startsWith("P"))).toEqual(["L 09:50-10:20 Lunch", "B 11:00-11:10 Short break"]);
  });

  it("leaves the short break out, and says so, when the last period ends before it", () => {
    const { slots, notes } = generateDay({ ...SETUP, periods: 2, lunchStart: null, lunchEnd: null, breakStart: "12:00", breakEnd: "12:10" });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:50"]);
    expect(notes).toEqual(["The short break (12:00 to 12:10) comes after the last period, so no short break row was added."]);
  });

  it("is a day without lunch when none is given", () => {
    const { slots } = generateDay({ ...SETUP, lunchStart: null, lunchEnd: null, periods: 3 });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:50", "P 09:50-10:30"]);
  });

  it("cuts the period that would run into the lunch short, and says so", () => {
    // 08:30 + 40 x 3 = 10:30, but lunch is at 10:20.
    const { slots, notes } = generateDay({ ...SETUP, lunchStart: "10:20", lunchEnd: "10:50", periods: 4 });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:50", "P 09:50-10:20", "L 10:20-10:50 Lunch", "P 10:50-11:30"]);
    expect(notes).toEqual(["Period 3 is cut to 30 minutes so that lunch starts at 10:20."]);
  });

  it("turns a gap too small for a period into a short break before the lunch", () => {
    // 08:30 + 40 x 3 = 10:30; lunch at 10:35: 5 minutes are left.
    const { slots, notes } = generateDay({ ...SETUP, lunchStart: "10:35", lunchEnd: "11:05", periods: 4 });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:50", "P 09:50-10:30", "B 10:30-10:35 Short break", "L 10:35-11:05 Lunch", "P 11:05-11:45"]);
    expect(notes).toEqual(["The 5 minutes left before lunch are a break."]);
  });

  it("leaves the lunch out, and says so, when the last period ends before it", () => {
    const { slots, notes } = generateDay({ ...SETUP, periods: 2 });
    expect(rows(slots)).toEqual(["P 08:30-09:10", "P 09:10-09:50"]);
    expect(notes).toEqual(["The lunch (10:30 to 11:00) comes after the last period, so no lunch row was added."]);
  });

  it("always makes a day the server accepts", () => {
    for (const periods of [1, 4, 8, 12]) {
      const { slots } = generateDay({ ...SETUP, periods });
      expect(problems(slots), `${periods} periods`).toEqual([]);
      const withBreak = generateDay({ ...SETUP, periods, breakStart: "09:50", breakEnd: "10:05" }).slots;
      expect(problems(withBreak), `${periods} periods, a short break`).toEqual([]);
    }
  });
});

describe("reading a day back as the head's own numbers (to change it)", () => {
  it("finds the start, the period length, the lunch, the assembly and the short break", () => {
    // 08:05 + 15 (assembly) + 2 x 40 + 10 (break) + 40 = 10:30: the lunch meets the third period's end.
    const setup: DaySetup = { start: "08:05", periodMinutes: 40, periods: 6, assemblyMinutes: 15, lunchStart: "10:30", lunchEnd: "11:00", breakStart: "09:40", breakEnd: "09:50" };
    expect(setupFromSlots(generateDay(setup).slots)).toEqual(setup);
  });

  it("keeps the first short break when a day made by hand has more than one (the page says rows changed by hand are made again)", () => {
    const slots: Slot[] = [
      { kind: "period", label: "", start: "08:30", end: "09:10" },
      { kind: "break", label: "Short break", start: "09:10", end: "09:20" },
      { kind: "period", label: "", start: "09:20", end: "10:00" },
      { kind: "break", label: "Short break", start: "10:00", end: "10:10" },
      { kind: "period", label: "", start: "10:10", end: "10:50" },
    ];
    expect(setupFromSlots(slots)).toMatchObject({ breakStart: "09:10", breakEnd: "09:20" });
  });

  it("is the usual day for a new timing", () => {
    expect(setupFromSlots([])).toEqual({ start: "08:30", periodMinutes: 40, periods: 8, assemblyMinutes: 0, lunchStart: "10:30", lunchEnd: "11:00", breakStart: null, breakEnd: null });
  });

  it("takes the length most periods have", () => {
    const slots = generateDay({ ...SETUP, periods: 5, lunchStart: null, lunchEnd: null }).slots;
    slots[1] = { ...slots[1], end: "09:45" };
    expect(setupFromSlots(slots).periodMinutes).toBe(40);
  });
});

describe("what is wrong with a day's numbers (said before anything is sent)", () => {
  it("is nothing for a usual day, a lunch, a short break, both", () => {
    expect(setupProblems(SETUP)).toEqual([]);
    expect(setupProblems({ ...SETUP, lunchStart: null, lunchEnd: null })).toEqual([]);
    expect(setupProblems({ ...SETUP, breakStart: "09:50", breakEnd: "10:05" })).toEqual([]);
  });

  it("wants both times of a lunch or a short break that is on, and the end after the start", () => {
    expect(setupProblems({ ...SETUP, lunchStart: "", lunchEnd: "11:00" })).toEqual(["Enter the lunch times"]);
    expect(setupProblems({ ...SETUP, lunchStart: "11:00", lunchEnd: "10:30" })).toEqual(["The lunch must end after it starts"]);
    expect(setupProblems({ ...SETUP, breakStart: "10:00", breakEnd: "" })).toEqual(["Enter the short break times"]);
    expect(setupProblems({ ...SETUP, breakStart: "10:15", breakEnd: "10:00" })).toEqual(["The short break must end after it starts"]);
  });

  it("does not let the short break and the lunch share time (one ending as the other starts is fine)", () => {
    expect(setupProblems({ ...SETUP, breakStart: "10:20", breakEnd: "10:40" })).toEqual(["The short break and the lunch overlap"]);
    expect(setupProblems({ ...SETUP, breakStart: "10:15", breakEnd: "10:30" })).toEqual([]);
  });
});

describe("saying how a day reads", () => {
  it("gives the first and last time, the periods and the lunch", () => {
    expect(describeDay(generateDay(SETUP).slots)).toEqual({ start: "08:30", end: "14:20", periods: 8, lunch: { start: "10:30", end: "11:00" } });
    expect(describeDay([])).toEqual({ start: null, end: null, periods: 0, lunch: null });
  });
});

describe("the rows of a day, checked before they are sent (the server's own words)", () => {
  const p = (start: string, end: string): Slot => ({ kind: "period", label: "", start, end });
  it("accept a normal day", () => {
    expect(problems(generateDay(SETUP).slots)).toEqual([]);
  });

  it("need a period, and a time that is a time", () => {
    expect(problems([])).toEqual(["slots: Add at least one period"]);
    expect(problems([p("9:00", "09:40")])).toEqual(["slots.0.start: Enter a time like 08:30"]);
  });

  it("say what is wrong with a row's length and its place", () => {
    expect(problems([p("09:10", "08:30")])).toEqual(["slots.0.end: The end must be after the start"]);
    expect(problems([p("08:30", "08:35")])).toEqual(["slots.0.end: A period lasts 10 to 120 minutes"]);
    expect(problems([p("08:30", "09:10"), p("09:00", "09:40")])).toEqual(["slots.1.start: Starts before the row above ends (09:10)"]);
    expect(problems([p("08:30", "09:10"), { kind: "break", label: "Break", start: "09:10", end: "12:30" }])).toEqual(["slots.1.end: A break lasts up to 180 minutes"]);
  });

  it("allow one lunch only, and up to 12 periods", () => {
    const two: Slot[] = [p("08:30", "09:10"), { kind: "lunch", label: "Lunch", start: "09:10", end: "09:40" }, { kind: "lunch", label: "Lunch", start: "09:40", end: "10:10" }];
    expect(problems(two)).toEqual(["slots.2.kind: A day has one lunch break"]);
    const many = Array.from({ length: 13 }, (_, i) => p(minutesToClock(480 + i * 30), minutesToClock(510 + i * 30)));
    expect(problems(many)).toEqual(["slots: Up to 12 periods in a day"]);
  });
});
