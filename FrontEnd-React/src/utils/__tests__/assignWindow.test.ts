import { describe, expect, it } from "vitest";
import { GRID } from "../../test/timetableFixtures";
import type { GridView } from "../../types";
import { assignWindow, isPast, lastPeriodEnd, weekdayOf } from "../assignWindow";
import { shortDate } from "../weekDates";

/**
 * The seven days a teacher can be given periods in (Assign class, 2026-11-13: "aaj 13 ho gaye to 14 se dikhe; school time over to us din nahi,
 * next date se; purana assign karke kya karunga"): they start today while the class still has a period to come today, else tomorrow.
 * GRID is Monday to Friday, its last period ends at 14:20.
 */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const dates = (columns: ReturnType<typeof assignWindow>) => columns.map((c) => `${["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][c.day]} ${shortDate(c.date)}`);

describe("weekdayOf", () => {
  it("is 1 for Monday and 7 for Sunday", () => {
    expect([at(2026, 11, 9), at(2026, 11, 13), at(2026, 11, 14), at(2026, 11, 15)].map(weekdayOf)).toEqual([1, 5, 6, 7]);
  });
});

describe("lastPeriodEnd", () => {
  it("is when the class's last period of that weekday ends, and null for a day it has no school", () => {
    expect(lastPeriodEnd(GRID, 5)).toBe("14:20");
    expect(lastPeriodEnd(GRID, 6)).toBeNull();
    expect(lastPeriodEnd({ ...GRID, days: [] }, 1)).toBeNull();
  });
});

describe("assignWindow", () => {
  it("starts today while the class still has a period to come today (Friday 13 November, morning)", () => {
    const columns = assignWindow(GRID, at(2026, 11, 13, 10, 0));
    expect(dates(columns)).toEqual(["Fri 13 Nov", "Sat 14 Nov", "Sun 15 Nov", "Mon 16 Nov", "Tue 17 Nov", "Wed 18 Nov", "Thu 19 Nov"]);
    expect(columns.map((c) => c.today)).toEqual([true, false, false, false, false, false, false]);
  });

  it("starts tomorrow once the school day is over (Friday 13 November, 10:48 PM): the 14th, not the 13th", () => {
    const columns = assignWindow(GRID, at(2026, 11, 13, 22, 48));
    expect(dates(columns)).toEqual(["Sat 14 Nov", "Sun 15 Nov", "Mon 16 Nov", "Tue 17 Nov", "Wed 18 Nov", "Thu 19 Nov", "Fri 20 Nov"]);
    expect(columns.some((c) => c.today)).toBe(false);
  });

  it("the last period ending is the end of today: at 14:20 sharp it is over, a minute before it is not", () => {
    expect(assignWindow(GRID, at(2026, 11, 13, 14, 19))[0].today).toBe(true);
    expect(assignWindow(GRID, at(2026, 11, 13, 14, 20))[0].today).toBe(false);
  });

  it("a day the class has no school (Saturday here) starts tomorrow, whatever the hour", () => {
    expect(dates(assignWindow(GRID, at(2026, 11, 14, 7, 0)))[0]).toBe("Sun 15 Nov");
  });

  it("always has seven consecutive days, each weekday once, across a month and a year end", () => {
    const columns = assignWindow(GRID, at(2026, 12, 29, 22, 0));
    expect(dates(columns)).toEqual(["Wed 30 Dec", "Thu 31 Dec", "Fri 1 Jan", "Sat 2 Jan", "Sun 3 Jan", "Mon 4 Jan", "Tue 5 Jan"]);
    expect(new Set(columns.map((c) => c.day)).size).toBe(7);
  });

  it("a class with no timing at all starts tomorrow", () => {
    const none: GridView = { ...GRID, days: [] };
    expect(dates(assignWindow(none, at(2026, 11, 13, 8, 0)))[0]).toBe("Sat 14 Nov");
  });
});

describe("isPast", () => {
  it("is for a period of today that has ended; never for another day", () => {
    const [today, tomorrow] = assignWindow(GRID, at(2026, 11, 13, 10, 0));
    expect(isPast("09:50", today, at(2026, 11, 13, 10, 0))).toBe(true);
    expect(isPast("10:30", today, at(2026, 11, 13, 10, 0))).toBe(false);
    expect(isPast("09:10", tomorrow, at(2026, 11, 13, 10, 0))).toBe(false);
  });
});
