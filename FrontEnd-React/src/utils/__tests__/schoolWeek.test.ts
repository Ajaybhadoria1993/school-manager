import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, generateDay } from "../timings";
import { dayProblem, daySummary, departmentDayBody, departmentRows, departmentRowsBody, readWeek, rowsSummary, usualDays, weekBody, weekProblems, type WeekPlan } from "../schoolWeek";
import type { Schedule } from "../../types";

const usualSlots = generateDay(DEFAULT_SETUP).slots;
const saturday = generateDay({ ...DEFAULT_SETUP, periods: 4, lunchStart: null, lunchEnd: null }).slots;
const timing = (over: Partial<Schedule>): Schedule => ({ id: "t1", name: "Regular", days: [1, 2, 3, 4, 5], scope: "all", classIds: [], departmentId: null, slots: usualSlots, periods: 8, ...over });

describe("readWeek: the school's timings as one usual day and what each day does", () => {
  it("starts a school with no timing at the usual numbers, Monday to Saturday, Sunday off", () => {
    const { plan, isNew, handMade } = readWeek([]);
    expect(isNew).toBe(true);
    expect(handMade).toEqual([]);
    expect(plan.usual).toEqual(DEFAULT_SETUP);
    expect([1, 2, 3, 4, 5, 6].map((d) => plan.days[d].mode)).toEqual(["usual", "usual", "usual", "usual", "usual", "usual"]);
    expect(plan.days[7].mode).toBe("off");
  });

  it("takes the timing with the most days as the usual day, another one's day as different, and a day nobody covers as a holiday", () => {
    const { plan, isNew } = readWeek([timing({}), timing({ id: "t2", name: "Saturday", days: [6], slots: saturday, periods: 4 })]);
    expect(isNew).toBe(false);
    expect(plan.usual.periods).toBe(8);
    expect(plan.days[1].mode).toBe("usual");
    expect(plan.days[6]).toMatchObject({ mode: "own", setup: { periods: 4, lunchStart: null } });
    expect(plan.days[7].mode).toBe("off");
  });

  it("leaves out a timing made for some classes, and names a timing whose rows were changed by hand", () => {
    const handRows = usualSlots.map((s, i) => (i === 0 ? { ...s, end: "09:05" } : s));
    const { plan, handMade } = readWeek([timing({ slots: handRows }), timing({ id: "t3", name: "Little ones", scope: "only", classIds: ["c1"], days: [1, 2, 3, 4, 5, 6], slots: saturday })]);
    expect(plan.days[6].mode).toBe("off");
    expect(handMade).toEqual(["Regular"]);
  });
});

describe("readWeek and weekBody for a department", () => {
  const pre = (over: Partial<Schedule>): Schedule => timing({ scope: "only", departmentId: "d1", classIds: ["c1"], ...over });

  it("starts a department with no timing of its own from the school's week", () => {
    const school = readWeek([timing({ days: [1, 2, 3, 4, 5, 6] })]).plan;
    const { plan, isNew } = readWeek([timing({ days: [1, 2, 3, 4, 5, 6] })], "d1", school);
    expect(isNew).toBe(true);
    expect(plan).toEqual(school);
    expect(plan).not.toBe(school);
  });

  it("reads the department's own timings only, its holiday timing as holidays, and ignores the school's", () => {
    const { plan, isNew } = readWeek(
      [timing({ days: [1, 2, 3, 4, 5, 6] }), pre({ id: "p1", name: "Pre-Primary", days: [1, 2, 3, 4, 5], slots: saturday, periods: 4 }), pre({ id: "p2", name: "Pre-Primary - holiday", days: [6, 7], slots: [], periods: 0 })],
      "d1"
    );
    expect(isNew).toBe(false);
    expect(plan.usual.periods).toBe(4);
    expect(plan.days[1].mode).toBe("usual");
    expect(plan.days[6].mode).toBe("off");
  });

  it("sends every day of a department's week, a holiday with no rows", () => {
    const { plan } = readWeek([]);
    const body = weekBody(plan, "d1");
    expect(body.departmentId).toBe("d1");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(body.days[6].slots).toEqual([]);
  });

  it("leaves the whole school's timings out of the school's week when a department has its own", () => {
    const { plan } = readWeek([timing({ days: [1, 2, 3, 4, 5] }), pre({ id: "p1", days: [6], slots: saturday })]);
    expect(plan.days[6].mode).toBe("off");
  });
});

describe("weekBody: what is sent", () => {
  it("sends the rows of every day that has school, made from its numbers; a holiday is not sent", () => {
    const { plan } = readWeek([]);
    const next: WeekPlan = { ...plan, days: { ...plan.days, 6: { mode: "own", setup: { ...DEFAULT_SETUP, periods: 4, lunchStart: null, lunchEnd: null } } } };
    const body = weekBody(next);
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots).toEqual(usualSlots);
    expect(body.days[5].slots).toEqual(saturday);
  });
});

describe("daySummary: a day in a few words", () => {
  it("says the times, the periods and the lunch (or that there is none), and the short break when there is one", () => {
    expect(daySummary(DEFAULT_SETUP)).toBe("08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00");
    expect(daySummary({ ...DEFAULT_SETUP, periods: 4, lunchStart: null, lunchEnd: null })).toBe("08:30 to 11:10 · 4 periods · no lunch");
    expect(daySummary({ ...DEFAULT_SETUP, breakStart: "09:50", breakEnd: "10:05" })).toBe("08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00 · short break 09:50 to 10:05");
  });
});

describe("weekProblems: said before anything is sent", () => {
  it("says what is wrong with a lunch or a short break of the usual day or of a day of its own", () => {
    const { plan } = readWeek([]);
    const overlap = { ...DEFAULT_SETUP, breakStart: "10:20", breakEnd: "10:40" };
    expect(weekProblems({ ...plan, usual: overlap })).toEqual([{ where: "usual", message: "The short break and the lunch overlap" }]);
    const own: WeekPlan = { ...plan, days: { ...plan.days, 6: { mode: "own", setup: { ...DEFAULT_SETUP, breakStart: "10:00", breakEnd: "" } } } };
    expect(weekProblems(own)).toEqual([{ where: 6, message: "Enter the short break times" }]);
  });

  it("needs a day with school, and says which day's numbers make a day the server would refuse", () => {
    const { plan } = readWeek([]);
    const allOff: WeekPlan = { ...plan, days: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { mode: "off" as const, setup: DEFAULT_SETUP }])) };
    expect(weekProblems(allOff)).toEqual([{ where: "week", message: "Keep at least one day with school" }]);

    const badSaturday: WeekPlan = { ...plan, days: { ...plan.days, 6: { mode: "own", setup: { ...DEFAULT_SETUP, periods: 0 } } } };
    expect(weekProblems(badSaturday)).toEqual([{ where: 6, message: "Add at least one period" }]);

    const badUsual: WeekPlan = { ...plan, usual: { ...plan.usual, periodMinutes: 5 } };
    expect(weekProblems(badUsual)[0]).toEqual({ where: "usual", message: "A period lasts 10 to 120 minutes" });
  });
});

describe("Pre-Primary's own day (2026-11-10)", () => {
  it("is sent for the school's usual days only: a day the school keeps different, and a holiday, follow the school", () => {
    const { plan } = readWeek([timing({ days: [1, 2, 3, 4, 5] }), timing({ id: "t2", name: "Saturday", days: [6], slots: saturday, periods: 4 })]);
    const early = { ...DEFAULT_SETUP, start: "07:30", periods: 5 };
    const body = departmentDayBody(plan, early, "d1");
    expect(body.departmentId).toBe("d1");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(body.days[0].slots).toEqual(generateDay(early).slots);
    expect(body.days[0].slots[0].start).toBe("07:30");
  });

  it("says what is wrong with a day's numbers, or nothing", () => {
    expect(dayProblem(DEFAULT_SETUP)).toBeUndefined();
    expect(dayProblem({ ...DEFAULT_SETUP, periods: 0 })).toBe("Add at least one period");
    expect(dayProblem({ ...DEFAULT_SETUP, lunchStart: "11:00", lunchEnd: "10:30" })).toBe("The lunch must end after it starts");
  });
});

describe("a timing in a few words, and which days a department follows", () => {
  it("says the first and last time, the periods, the lunch and the short break of rows", () => {
    expect(rowsSummary(usualSlots)).toBe("08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00");
    expect(rowsSummary(saturday)).toBe("08:30 to 11:10 · 4 periods · no lunch");
    const withBreak = generateDay({ ...DEFAULT_SETUP, breakStart: "09:50", breakEnd: "10:05" }).slots;
    expect(rowsSummary(withBreak)).toContain("short break 09:50 to 10:05");
    expect(rowsSummary([])).toBe("No periods");
    expect(rowsSummary(generateDay({ ...DEFAULT_SETUP, periods: 1 }).slots)).toContain("1 period ·");
  });

  it("a department's days are the school's usual days: a different day and a holiday are left to the school", () => {
    const { plan } = readWeek([timing({ days: [1, 2, 3, 4, 5] }), timing({ id: "t2", name: "Saturday", days: [6], slots: saturday, periods: 4 })]);
    expect(usualDays(plan)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("a department's own rows", () => {
  const dept = (over: Partial<Schedule>) => timing({ id: "d", name: "Primary", scope: "only", classIds: ["c1"], departmentId: "d1", ...over });

  it("takes the usual day of a department from the timing that covers most of its days", () => {
    const monday = dept({ id: "a", days: [1], slots: saturday, periods: 4 });
    const rest = dept({ id: "b", days: [2, 3, 4, 5] });
    expect(departmentRows([timing({}), monday, rest], "d1")).toEqual(usualSlots);
    expect(departmentRows([timing({})], "d1")).toEqual([]);
    expect(departmentRows([timing({}), dept({ id: "off", days: [6], slots: [], periods: 0 })], "d1")).toEqual([]);
  });

  it("sends the given rows on the school's usual days only", () => {
    const { plan } = readWeek([timing({ days: [1, 2, 3, 4, 5] }), timing({ id: "t2", name: "Saturday", days: [6], slots: saturday, periods: 4 })]);
    const body = departmentRowsBody(plan, saturday, "d1");
    expect(body.departmentId).toBe("d1");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(body.days[0].slots).toEqual(saturday);
  });
});
