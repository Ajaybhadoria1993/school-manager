import { describe, expect, it } from "vitest";
import { sameDay, shortDate } from "../weekDates";

/** The small date words of the pages that give a teacher periods ("9 Nov"). */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("shortDate", () => {
  it("is the day and the month's short name", () => {
    expect(shortDate(d(2026, 11, 9))).toBe("9 Nov");
    expect(shortDate(d(2027, 1, 31))).toBe("31 Jan");
    expect(shortDate(d(2026, 12, 1))).toBe("1 Dec");
  });

  it("the time of the day does not matter", () => {
    expect(shortDate(new Date(2026, 10, 13, 23, 59))).toBe("13 Nov");
  });
});

describe("sameDay", () => {
  it("compares the calendar day, not the time", () => {
    expect(sameDay(new Date(2026, 10, 13, 1, 0), new Date(2026, 10, 13, 23, 0))).toBe(true);
    expect(sameDay(d(2026, 11, 13), d(2026, 11, 14))).toBe(false);
  });
});
