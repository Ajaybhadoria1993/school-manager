import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../types";
import {
  addDays,
  dayKinds,
  eventsOnDay,
  eventsTouching,
  fullDay,
  longDay,
  monthBounds,
  monthGrid,
  monthsOfYear,
  shiftMonth,
  shiftYear,
  visibleLanes,
  weekLanes,
  yearRange,
} from "../calendar";

/** The school's calendar as a grid of days (Sunday first), the days of an event, and where its bars go in a week. */

const ev = (id: string, startDate: string, endDate: string, kind: CalendarEvent["kind"] = "event", title = id): CalendarEvent => ({ id, title, kind, startDate, endDate, note: null, source: "school" });

describe("the month grid", () => {
  it("starts on the Sunday of the week the month begins and ends on the Saturday of the week it ends", () => {
    const weeks = monthGrid("2026-11"); // 1 Nov 2026 is a Sunday, 30 Nov a Monday
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(weeks[4][0]).toBe("2026-11-29");
    expect(weeks[4][6]).toBe("2026-12-05");
  });

  it("brings in the last days of the month before when the first is not a Sunday", () => {
    const weeks = monthGrid("2026-12"); // 1 Dec 2026 is a Tuesday
    expect(weeks[0][0]).toBe("2026-11-29");
    expect(weeks[0][2]).toBe("2026-12-01");
  });

  it("is only as tall as the month needs: four rows for a February that starts on a Sunday, six at most", () => {
    expect(monthGrid("2026-02")).toHaveLength(4);
    expect(monthGrid("2026-08")).toHaveLength(6); // 1 Aug 2026 is a Saturday
    for (const month of monthsOfYear(2027)) expect(monthGrid(month).every((w) => w.length === 7)).toBe(true);
  });

  it("knows a leap year", () => {
    expect(monthGrid("2028-02").flat()).toContain("2028-02-29");
    expect(monthGrid("2027-02").flat()).not.toContain("2027-02-29");
  });
});

describe("months and years", () => {
  it("steps a month before or after, over the end of a year", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("steps a year and keeps the month", () => {
    expect(shiftYear("2026-11", 1)).toBe("2027-11");
    expect(shiftYear("2026-11", -1)).toBe("2025-11");
  });

  it("lists the twelve months of a year", () => {
    const months = monthsOfYear(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });

  it("reads a year from a week before its first day to a week after its last, so the grids of January and December are full", () => {
    expect(yearRange(2026)).toEqual({ from: "2025-12-25", to: "2027-01-07" });
  });

  it("knows the first and the last day of a month", () => {
    expect(monthBounds("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("writes a day in full", () => {
    expect(fullDay("2026-11-08")).toBe("8 November 2026");
    expect(longDay("2026-11-08")).toBe("Sunday, 8 November 2026");
    expect(longDay("2026-11-05")).toBe("Thursday, 5 November 2026");
  });
});

describe("what is on a day", () => {
  const diwali = ev("diwali", "2026-11-08", "2026-11-10", "holiday");
  const sports = ev("sports", "2026-11-10", "2026-11-10");
  const events = [sports, diwali];

  it("an event covers every day from its first to its last, both included", () => {
    expect(eventsOnDay(events, "2026-11-07")).toEqual([]);
    expect(eventsOnDay(events, "2026-11-08")).toEqual([diwali]);
    expect(eventsOnDay(events, "2026-11-10").map((e) => e.id)).toEqual(["diwali", "sports"]);
    expect(eventsOnDay(events, "2026-11-11")).toEqual([]);
  });

  it("lists the ones that touch a stretch of days, in date order, even when they began before it", () => {
    expect(eventsTouching(events, "2026-11-09", "2026-11-30").map((e) => e.id)).toEqual(["diwali", "sports"]);
    expect(eventsTouching(events, "2026-11-11", "2026-11-30")).toEqual([]);
    expect(eventsTouching(events, "2026-10-01", "2026-11-08").map((e) => e.id)).toEqual(["diwali"]);
  });

  it("says, for each day of a stretch, whether a holiday and whether an event is on it", () => {
    const kinds = dayKinds(events, "2026-11-01", "2026-11-30");
    expect(kinds.get("2026-11-07")).toBeUndefined();
    expect(kinds.get("2026-11-08")).toEqual({ holiday: true, event: false, titles: ["diwali"] });
    expect(kinds.get("2026-11-10")).toEqual({ holiday: true, event: true, titles: ["diwali", "sports"] });
  });

  it("does not run past the stretch it was asked for (a long break across two years)", () => {
    const winter = ev("winter", "2026-12-25", "2027-01-05", "holiday");
    const kinds = dayKinds([winter], "2026-12-01", "2026-12-31");
    expect(kinds.get("2026-12-31")?.holiday).toBe(true);
    expect(kinds.has("2027-01-01")).toBe(false);
  });

  it("addDays still moves a day", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("the bars of a week", () => {
  const week = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]; // Sunday to Saturday

  it("puts one event on every day it covers in its own row, the name on the day it starts", () => {
    const { lanes } = weekLanes([ev("diwali", "2026-11-09", "2026-11-11", "holiday", "Diwali")], week);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].map((slot) => slot?.event.id ?? null)).toEqual([null, "diwali", "diwali", "diwali", null, null, null]);
    expect(lanes[0][1]).toMatchObject({ startsHere: true, endsHere: false, label: true });
    expect(lanes[0][2]).toMatchObject({ startsHere: false, endsHere: false, label: false });
    expect(lanes[0][3]).toMatchObject({ startsHere: false, endsHere: true, label: false });
  });

  it("names a bar again at the start of the week it carries on in, and does not round its open end", () => {
    const { lanes } = weekLanes([ev("break", "2026-11-05", "2026-11-17", "holiday")], week);
    expect(lanes[0][0]).toMatchObject({ startsHere: false, label: true });
    expect(lanes[0][6]).toMatchObject({ endsHere: false });
    const next = weekLanes([ev("break", "2026-11-05", "2026-11-17", "holiday")], ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(next.lanes[0][2]).toMatchObject({ endsHere: true });
    expect(next.lanes[0][3]).toBeNull();
  });

  it("keeps events that share a day in rows of their own, and lets a later event use a free row", () => {
    const a = ev("a", "2026-11-08", "2026-11-10");
    const b = ev("b", "2026-11-09", "2026-11-09");
    const c = ev("c", "2026-11-11", "2026-11-12");
    const { lanes } = weekLanes([c, b, a], week);
    expect(lanes).toHaveLength(2);
    expect(lanes[0].map((s) => s?.event.id ?? null)).toEqual(["a", "a", "a", "c", "c", null, null]);
    expect(lanes[1].map((s) => s?.event.id ?? null)).toEqual([null, "b", null, null, null, null, null]);
  });

  it("has no rows for a week with nothing in it", () => {
    expect(weekLanes([ev("far", "2026-12-20", "2026-12-20")], week).lanes).toEqual([]);
  });

  it("shows only as many rows as fit and counts what is left under each day", () => {
    const four = ["a", "b", "c", "d"].map((id) => ev(id, "2026-11-10", "2026-11-10"));
    const { lanes } = weekLanes(four, week);
    expect(lanes).toHaveLength(4);
    const { shown, more } = visibleLanes(lanes, 3);
    expect(shown).toHaveLength(3);
    expect(more).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(visibleLanes(lanes, 4).more).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
