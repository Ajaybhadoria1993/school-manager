import { describe, expect, it } from "vitest";
import type { Schedule } from "../../types";
import { DEFAULT_SETUP, generateDay } from "../timings";
import { deptProblem, deptRows, deptSummary, endMessage, hoursClash, hoursFromRows, hoursProblem, hoursRows, isHoursDepartment, startingSetup, storedSetup, type Hours } from "../departmentDay";

const school = generateDay(DEFAULT_SETUP).slots;
const hours = (over: Partial<Hours> = {}): Hours => ({ start: "09:00", end: "12:00", lunchStart: null, lunchEnd: null, ...over });
const periods = (rows: { kind: string }[]) => rows.filter((r) => r.kind === "period").length;

describe("Pre-Primary's day as hours: from when to when, the periods follow from the school's length of a period", () => {
  it("only Pre-Primary, however it is written, is given hours", () => {
    expect(isHoursDepartment("Pre-Primary")).toBe(true);
    expect(isHoursDepartment("Pre Primary")).toBe(true);
    expect(isHoursDepartment("PRE-PRIMARY")).toBe(true);
    expect(isHoursDepartment("Primary")).toBe(false);
    expect(isHoursDepartment("Middle")).toBe(false);
  });

  it("makes periods of the school's length from the start, the last one cut to end where the day ends", () => {
    const rows = hoursRows(hours(), 40)!;
    expect(rows.map((r) => `${r.start}-${r.end}`)).toEqual(["09:00-09:40", "09:40-10:20", "10:20-11:00", "11:00-11:40", "11:40-12:00"]);
    expect(rows.every((r) => r.kind === "period")).toBe(true);
  });

  it("puts the lunch at its own time and goes on after it, still ending where the day ends", () => {
    const rows = hoursRows(hours({ lunchStart: "10:30", lunchEnd: "11:00" }), 40)!;
    expect(rows.find((r) => r.kind === "lunch")).toMatchObject({ start: "10:30", end: "11:00" });
    expect(rows[0].start).toBe("09:00");
    expect(rows.at(-1)).toMatchObject({ kind: "period", end: "12:00" });
  });

  it("a bit left over that is too short for a period is not a period: the day ends with the last whole one", () => {
    const rows = hoursRows(hours({ end: "09:45" }), 40)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].end).toBe("09:40");
  });

  it("has no day when the start or the end is missing, the end is not after the start, or there is no room for a period", () => {
    expect(hoursRows(hours({ start: "" }), 40)).toBeNull();
    expect(hoursRows(hours({ end: "" }), 40)).toBeNull();
    expect(hoursRows(hours({ end: "09:00" }), 40)).toBeNull();
    expect(hoursRows(hours({ start: "12:00", end: "09:00" }), 40)).toBeNull();
    expect(hoursRows(hours({ end: "09:05" }), 40)).toBeNull();
  });

  it("reads the hours back from the rows of a day: first start, last end, the lunch", () => {
    // With how long most of its periods are (2026-11-22: a department set by hours can have its own length).
    expect(hoursFromRows(school)).toEqual({ start: "08:30", end: "14:20", lunchStart: "10:30", lunchEnd: "11:00", periodMinutes: 40 });
    expect(hoursFromRows(generateDay({ ...DEFAULT_SETUP, lunchStart: null, lunchEnd: null }).slots)).toMatchObject({ lunchStart: null, lunchEnd: null });
    // The hours of a day come back as the same day.
    const back = hoursRows(hoursFromRows(school), 40)!;
    expect(back.map((r) => `${r.kind} ${r.start}-${r.end}`)).toEqual(school.map((r) => `${r.kind} ${r.start}-${r.end}`));
  });

  it("says what is wrong with the hours, in words", () => {
    // 09:00 to 12:00 is four and a half periods of 40: the end is said (every period is the same length, 2026-11-22); 09:00 to 12:20 is five.
    expect(hoursProblem(hours(), 40)).toBe("School ends at 12:00, in the middle of Period 5 (11:40 to 12:20). End it 20 min earlier (at 11:40) or 20 min later (at 12:20) so that every period is 40 min.");
    expect(hoursProblem(hours({ end: "12:20" }), 40)).toBeUndefined();
    expect(hoursProblem(hours({ end: "12:00", periodMinutes: 45 }), 40)).toBeUndefined();
    expect(hoursProblem(hours({ start: "" }), 40)).toBe("Enter when school starts and ends");
    expect(hoursProblem(hours({ end: "08:00" }), 40)).toBe("School must end after it starts");
    // Shorter than one period: where the first period would end.
    expect(hoursProblem(hours({ end: "09:05" }), 40)).toBe("School ends at 09:05, in the middle of Period 1 (09:00 to 09:40). End it 35 min later (at 09:40) so that every period is 40 min.");
    expect(hoursProblem(hours({ lunchStart: "10:30", lunchEnd: "" }), 40)).toBe("Enter the lunch times");
    expect(hoursProblem(hours({ lunchStart: "11:00", lunchEnd: "10:30" }), 40)).toBe("The lunch must end after it starts");
    expect(hoursProblem(hours({ lunchStart: "08:00", lunchEnd: "08:30" }), 40)).toBe("The lunch must be inside the school hours");
    expect(hoursProblem(hours({ lunchStart: "11:30", lunchEnd: "12:30" }), 40)).toBe("The lunch must be inside the school hours");
  });
});

describe("a day of hours lines up with whole periods (2026-11-22)", () => {
  it("a lunch inside a period: how many minutes earlier or later it goes", () => {
    const clash = hoursClash(hours({ end: "12:30", lunchStart: "10:30", lunchEnd: "11:20" }), 40);
    expect(clash.end).toBeNull();
    expect(clash.lunch).toMatchObject({ period: 3, periodStart: "10:20", periodEnd: "11:00", earlier: { start: "10:20", end: "11:10" }, moveTo: { start: "11:00", end: "11:50" } });
  });

  it("an end inside a period: where the day could end instead (not before the first period)", () => {
    const clash = hoursClash(hours({ end: "12:00" }), 40);
    expect(clash.end).toEqual({ end: "12:00", period: 5, periodStart: "11:40", periodEnd: "12:20", periodMinutes: 40, earlier: "11:40", later: "12:20" });
    expect(endMessage(clash.end!)).toBe("School ends at 12:00, in the middle of Period 5 (11:40 to 12:20). End it 20 min earlier (at 11:40) or 20 min later (at 12:20) so that every period is 40 min.");
    expect(hoursClash(hours({ end: "09:20" }), 40).end).toMatchObject({ period: 1, earlier: null, later: "09:40" });
  });

  it("a department's own length of a period is the one used (else the school's)", () => {
    expect(hoursClash(hours({ end: "12:00", periodMinutes: 30 }), 40)).toEqual({ lunch: null, end: null });
    expect(periods(hoursRows(hours({ end: "12:00", periodMinutes: 30 }), 40)!)).toBe(6);
  });

  it("nothing is said while the hours themselves are wrong", () => {
    expect(hoursClash(hours({ end: "08:00" }), 40)).toEqual({ lunch: null, end: null });
  });
});

describe("a day of hours with school time and class time apart (2026-11-22)", () => {
  it("the time to come in is an Arrival row first, the periods from when classes start", () => {
    const rows = hoursRows(hours({ start: "08:40", arrivalMinutes: 20, end: "12:20" }), 40)!;
    expect(rows[0]).toEqual({ kind: "break", label: "Arrival", start: "08:40", end: "09:00" });
    expect(rows.filter((r) => r.kind === "period").map((r) => r.start)).toEqual(["09:00", "09:40", "10:20", "11:00", "11:40"]);
    expect(hoursProblem(hours({ start: "08:40", arrivalMinutes: 20, end: "12:20" }), 40)).toBeUndefined();
  });

  it("reads it back; the school's arrival and assembly together are a day of hours' time to come in (it has no assembly)", () => {
    const own = hours({ start: "08:40", arrivalMinutes: 20, end: "12:20" });
    expect(hoursFromRows(hoursRows(own, 40)!)).toEqual({ ...own, periodMinutes: 40 });
    const usual = { ...DEFAULT_SETUP, start: "08:00", arrivalMinutes: 5, assemblyMinutes: 15, lunchStart: "10:20", lunchEnd: "10:50" };
    expect(hoursFromRows(generateDay(usual).slots)).toMatchObject({ start: "08:00", arrivalMinutes: 20 });
    // Pre-Primary starts from it with its periods where the school's are.
    const pre = startingSetup("Pre-Primary", usual);
    if (pre.kind !== "hours") throw new Error("hours expected");
    expect(hoursRows(pre.hours, 40)!.find((r) => r.kind === "period")).toMatchObject({ start: "08:20", end: "09:00" });
  });

  it("says when classes start at a time that cannot be", () => {
    expect(hoursProblem(hours({ arrivalMinutes: -10 }), 40)).toBe("Classes can start at 09:00 at the earliest, when school starts");
    expect(hoursProblem(hours({ arrivalMinutes: 180 }), 40)).toBe("Classes must start before school ends");
    expect(hoursProblem(hours({ arrivalMinutes: 60, lunchStart: "09:30", lunchEnd: "10:00" }), 40)).toBe("The lunch must start after classes start");
  });
});

describe("a department's day, as periods or as hours", () => {
  it("Pre-Primary starts from the school's day as hours, any other department as the school's numbers", () => {
    const pre = startingSetup("Pre-Primary", DEFAULT_SETUP);
    expect(pre).toEqual({ kind: "hours", hours: { start: "08:30", end: "14:20", lunchStart: "10:30", lunchEnd: "11:00", periodMinutes: 40 } });
    const primary = startingSetup("Primary", DEFAULT_SETUP);
    expect(primary).toEqual({ kind: "periods", setup: DEFAULT_SETUP });
    // A copy: changing it never changes the school's numbers.
    if (primary.kind === "periods") expect(primary.setup).not.toBe(DEFAULT_SETUP);
  });

  it("gives the rows of the day: from the numbers for periods, from the hours and the school's period length for hours", () => {
    expect(deptRows({ kind: "periods", setup: DEFAULT_SETUP }, 40)).toEqual(school);
    expect(periods(deptRows({ kind: "hours", hours: hours() }, 40))).toBe(5);
    expect(periods(deptRows({ kind: "hours", hours: hours() }, 60))).toBe(3);
    expect(deptRows({ kind: "hours", hours: hours({ end: "08:00" }) }, 40)).toEqual([]);
  });

  it("says a day of hours without counting periods, and a day of periods as the school's is said", () => {
    expect(deptSummary({ kind: "hours", hours: hours({ lunchStart: "10:30", lunchEnd: "11:00" }) }, 40)).toBe("09:00 to 12:00 · lunch 10:30 to 11:00");
    expect(deptSummary({ kind: "hours", hours: hours() }, 40)).toBe("09:00 to 12:00");
    expect(deptSummary({ kind: "hours", hours: hours({ end: "08:00" }) }, 40)).toBe("Set the hours");
    expect(deptSummary({ kind: "periods", setup: DEFAULT_SETUP }, 40)).toBe("08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00");
  });

  it("says what is wrong with either kind", () => {
    expect(deptProblem({ kind: "periods", setup: { ...DEFAULT_SETUP, periods: 0 } }, 40)).toBe("Add at least one period");
    expect(deptProblem({ kind: "hours", hours: hours({ end: "08:00" }) }, 40)).toBe("School must end after it starts");
    expect(deptProblem({ kind: "hours", hours: hours({ end: "12:20" }) }, 40)).toBeUndefined();
  });
});

describe("what a department has now", () => {
  const four = generateDay({ ...DEFAULT_SETUP, periods: 4, lunchStart: null, lunchEnd: null }).slots;
  const own = (departmentId: string, slots = four): Schedule => ({ id: `s-${departmentId}`, name: "Own", days: [1, 2, 3, 4, 5], scope: "only", classIds: ["c1"], departmentId, slots, periods: periods(slots) });

  it("follows the school when it has no timing of its own, and then has the school's day as the kind of numbers it is set with", () => {
    const primary = storedSetup({ id: "d2", name: "Primary" }, [], DEFAULT_SETUP);
    expect(primary).toEqual({ stored: false, setup: { kind: "periods", setup: DEFAULT_SETUP } });
    const pre = storedSetup({ id: "d1", name: "Pre-Primary" }, [own("d2")], DEFAULT_SETUP);
    expect(pre.stored).toBe(false);
    expect(pre.setup.kind).toBe("hours");
  });

  it("reads its own timing back: its numbers for a department set by periods, its hours for Pre-Primary", () => {
    const primary = storedSetup({ id: "d2", name: "Primary" }, [own("d2")], DEFAULT_SETUP);
    expect(primary.stored).toBe(true);
    expect(primary.setup).toMatchObject({ kind: "periods", setup: { start: "08:30", periods: 4, lunchStart: null } });
    const pre = storedSetup({ id: "d1", name: "Pre-Primary" }, [own("d1")], DEFAULT_SETUP);
    expect(pre.stored).toBe(true);
    expect(pre.setup).toEqual({ kind: "hours", hours: { start: "08:30", end: "11:10", lunchStart: null, lunchEnd: null, periodMinutes: 40 } });
  });

  it("a timing with no period (a holiday only) is not a timing of its own", () => {
    expect(storedSetup({ id: "d2", name: "Primary" }, [own("d2", [])], DEFAULT_SETUP).stored).toBe(false);
  });
});
