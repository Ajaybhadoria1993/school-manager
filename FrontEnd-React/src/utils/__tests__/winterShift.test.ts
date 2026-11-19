import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, generateDay, shiftClock, shiftSetup, shiftSlots, type DaySetup } from "../timings";
import { moveStart, readWeek, shiftMinutes, type WeekPlan } from "../schoolWeek";
import type { Schedule } from "../../types";

/**
 * The winter shift (2026-11-17): when the school starts an hour later, so do its lunch and the other days of its week that have hours of their
 * own; the classes' and departments' own timings move with it on the server (`shiftOthers`).
 */

const plan = (over: Partial<WeekPlan> = {}): WeekPlan => {
  const usual: DaySetup = { ...DEFAULT_SETUP };
  const days: WeekPlan["days"] = {};
  for (const d of [1, 2, 3, 4, 5, 6, 7]) days[d] = { mode: d === 7 ? "off" : "usual", setup: { ...usual } };
  return { usual, days, ...over };
};

describe("moving a clock time", () => {
  it("08:30 an hour later is 09:30; earlier, 07:30", () => {
    expect(shiftClock("08:30", 60)).toBe("09:30");
    expect(shiftClock("08:30", -60)).toBe("07:30");
    expect(shiftClock("23:30", 29)).toBe("23:59");
  });

  it("a time that would leave the day (before 00:00, after 23:59) or is not a time is null", () => {
    expect(shiftClock("23:30", 30)).toBeNull();
    expect(shiftClock("00:30", -31)).toBeNull();
    expect(shiftClock("", 60)).toBeNull();
    expect(shiftClock("8:3", 60)).toBeNull();
  });

  it("how far apart two start times are, in minutes; none when either is not a time yet", () => {
    expect(shiftMinutes("08:30", "09:30")).toBe(60);
    expect(shiftMinutes("09:30", "08:00")).toBe(-90);
    expect(shiftMinutes("08:30", "08:30")).toBe(0);
    expect(shiftMinutes("08:30", "")).toBeNull();
    expect(shiftMinutes("", "08:30")).toBeNull();
  });
});

describe("moving a day's numbers", () => {
  it("the start, the lunch and the short break all move; the length of a period and how many stay", () => {
    const setup: DaySetup = { ...DEFAULT_SETUP, breakStart: "09:50", breakEnd: "10:00" };
    expect(shiftSetup(setup, 60)).toEqual({ ...setup, start: "09:30", lunchStart: "11:30", lunchEnd: "12:00", breakStart: "10:50", breakEnd: "11:00" });
  });

  it("a day without a lunch or a break keeps none", () => {
    const setup: DaySetup = { ...DEFAULT_SETUP, lunchStart: null, lunchEnd: null };
    expect(shiftSetup(setup, 60)).toMatchObject({ start: "09:30", lunchStart: null, lunchEnd: null, breakStart: null, breakEnd: null });
  });

  it("is null when any of it would leave the day", () => {
    expect(shiftSetup({ ...DEFAULT_SETUP, start: "20:00", lunchStart: "23:00", lunchEnd: "23:30" }, 60)).toBeNull();
  });

  it("the rows of a day move together and keep their kinds and names", () => {
    const rows = generateDay(DEFAULT_SETUP).slots;
    const later = shiftSlots(rows, 60);
    expect(later?.map((r) => r.kind)).toEqual(rows.map((r) => r.kind));
    expect(later?.[0]).toMatchObject({ kind: "period", start: "09:30", end: "10:10" });
    expect(later?.find((r) => r.kind === "lunch")).toMatchObject({ start: "11:30", end: "12:00" });
    expect(shiftSlots(rows, 600)).toBeNull();
    expect(shiftSlots([], 60)).toEqual([]);
  });
});

describe("the school's start moves in the page: the lunch and the days of its own go with it", () => {
  it("moving the start an hour later moves the usual lunch too, so the periods are not cut", () => {
    const before = plan();
    const next = moveStart(before, { ...before.usual, start: "09:30" }, "08:30");
    expect(next.usual).toMatchObject({ start: "09:30", lunchStart: "11:30", lunchEnd: "12:00", periods: 8, periodMinutes: 40 });
    expect(generateDay(next.usual).notes).toEqual([]);
  });

  it("a day of its own (a short Saturday) moves by the same minutes; a usual day and a holiday keep their copies", () => {
    const before = plan();
    before.days[6] = { mode: "own", setup: { ...DEFAULT_SETUP, start: "08:30", periods: 4, lunchStart: null, lunchEnd: null } };
    const next = moveStart(before, { ...before.usual, start: "09:00" }, "08:30");
    expect(next.days[6].setup.start).toBe("09:00");
    expect(next.days[1].setup).toEqual(before.days[1].setup);
    expect(next.days[7].mode).toBe("off");
  });

  it("changing something other than the start changes only that", () => {
    const before = plan();
    const next = moveStart(before, { ...before.usual, periodMinutes: 45 }, "08:30");
    expect(next.usual).toEqual({ ...before.usual, periodMinutes: 45 });
    expect(next.days).toEqual(before.days);
  });

  it("a start that is not a whole time yet (the box was cleared) moves nothing; typing a time after it moves by what the start was before", () => {
    const before = plan();
    const cleared = moveStart(before, { ...before.usual, start: "" }, "08:30");
    expect(cleared.usual).toEqual({ ...before.usual, start: "" });
    // The page remembers the last whole start ("08:30") for this.
    const typed = moveStart(cleared, { ...cleared.usual, start: "09:30" }, "08:30");
    expect(typed.usual).toMatchObject({ start: "09:30", lunchStart: "11:30", lunchEnd: "12:00" });
  });

  it("the lunch stays where it is when moving it would take it out of the day", () => {
    const before = plan();
    before.usual = { ...before.usual, start: "08:30", lunchStart: "23:00", lunchEnd: "23:30" };
    const next = moveStart(before, { ...before.usual, start: "09:30" }, "08:30");
    expect(next.usual).toMatchObject({ start: "09:30", lunchStart: "23:00", lunchEnd: "23:30" });
  });
});

describe("what the server has: the school's start as saved", () => {
  const regular: Schedule = {
    id: "s1",
    name: "Regular",
    days: [1, 2, 3, 4, 5, 6],
    scope: "all",
    classIds: [],
    departmentId: null,
    slots: generateDay(DEFAULT_SETUP).slots,
    periods: 8,
  };

  it("is read back as the usual start", () => {
    expect(readWeek([regular]).plan.usual.start).toBe("08:30");
  });
});
