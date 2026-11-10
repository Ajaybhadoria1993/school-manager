import { describe, it, expect } from "vitest";
import { clockToMinutes } from "../time";
import { analyse, type AllotmentInfo, type Busy, type CellIn, type TeacherInfo } from "../services/checker";
import { autofill, type AutofillInput } from "../services/autofill";

const t = (clock: string) => clockToMinutes(clock)!;

/** The school's usual day: periods 1-3, lunch 10:30-11:00, periods 4-8. */
const SPANS = [
  ["08:30", "09:10"],
  ["09:10", "09:50"],
  ["09:50", "10:30"],
  ["11:00", "11:40"],
  ["11:40", "12:20"],
  ["12:20", "13:00"],
  ["13:00", "13:40"],
  ["13:40", "14:20"],
].map(([s, e], i) => ({ period: i + 1, label: `Period ${i + 1}`, start: t(s), end: t(e) }));
const WEEK = [1, 2, 3, 4, 5].map((day) => ({ day, periods: SPANS }));

const allot = (id: string, name: string, over: Partial<AllotmentInfo> = {}): AllotmentInfo => ({ subjectId: id, subjectName: name, periodsPerWeek: 5, blockSize: 1, teacherId: null, group: null, ...over });
const teacher = (id: string, over: Partial<TeacherInfo> = {}): TeacherInfo => ({ id, name: id, isActive: true, offDays: [], maxPerDay: null, maxPerWeek: null, ...over });

function input(subjects: AllotmentInfo[], over: Partial<AutofillInput> = {}): AutofillInput {
  return {
    days: WEEK,
    cells: [],
    allotments: new Map(subjects.map((s) => [s.subjectId, s])),
    teachers: new Map([teacher("meena"), teacher("dev"), teacher("asha")].map((x) => [x.id, x])),
    busy: [],
    seed: 1,
    ...over,
  };
}
const check = (i: AutofillInput, cells: CellIn[]) => analyse({ days: i.days, cells, allotments: i.allotments, teachers: i.teachers, busy: i.busy });
const errorsOf = (i: AutofillInput, cells: CellIn[]) => check(i, cells).issues.filter((x) => x.level === "error");
const periodsOf = (cells: CellIn[], subject: string) => cells.filter((c) => c.lessons.some((l) => l.subjectId === subject)).map((c) => `${c.day}.${c.period}`);

describe("filling a timetable by itself", () => {
  const FIVE = () => [
    allot("maths", "Mathematics", { periodsPerWeek: 6, teacherId: "meena" }),
    allot("english", "English", { periodsPerWeek: 5, teacherId: "dev" }),
    allot("hindi", "Hindi", { periodsPerWeek: 5, teacherId: "asha" }),
    allot("science", "Science", { periodsPerWeek: 5, teacherId: "meena" }),
    allot("art", "Art", { periodsPerWeek: 2 }),
  ];

  it("places every period of every subject, with no clash, and says nothing is left over", () => {
    const i = input(FIVE());
    const result = autofill(i);
    expect(result.unplaced).toEqual([]);
    expect(result.cells).toHaveLength(23);
    expect(errorsOf(i, result.cells)).toEqual([]);
    for (const a of FIVE()) expect(periodsOf(result.cells, a.subjectId), a.subjectName).toHaveLength(a.periodsPerWeek);
    expect(check(i, result.cells).issues.filter((x) => x.code === "TOO_FEW" || x.code === "TOO_MANY")).toEqual([]);
  });

  it("is the same every time for the same seed, and can be another arrangement for another seed", () => {
    const a = autofill(input(FIVE(), { seed: 7 })).cells;
    expect(autofill(input(FIVE(), { seed: 7 })).cells).toEqual(a);
    const others = [1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(autofill(input(FIVE(), { seed })).cells));
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it("spreads a subject over the week: five periods are five different days, and a six-period subject is never more than twice a day", () => {
    const result = autofill(input(FIVE()));
    const days = (subject: string) => periodsOf(result.cells, subject).map((p) => p.split(".")[0]);
    expect(new Set(days("english")).size).toBe(5);
    expect(new Set(days("hindi")).size).toBe(5);
    const maths = days("maths");
    expect(new Set(maths).size).toBe(5);
    expect(Math.max(...[1, 2, 3, 4, 5].map((d) => maths.filter((x) => x === String(d)).length))).toBeLessThanOrEqual(2);
  });

  it("packs each day from the first period: no gap, so a class's day ends right after its last lesson (every seed)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { cells } = autofill(input(FIVE(), { seed }));
      for (const day of [1, 2, 3, 4, 5]) {
        const periods = cells.filter((c) => c.day === day).map((c) => c.period).sort((a, b) => a - b);
        expect(periods, `seed ${seed}, day ${day}`).toEqual(periods.map((_, k) => k + 1));
      }
    }
  });

  it("does not put one subject in two periods in a row when it can avoid it", () => {
    const result = autofill(input(FIVE()));
    expect(check(input(FIVE()), result.cells).issues.filter((x) => x.code === "BACK_TO_BACK")).toEqual([]);
  });

  it("keeps the lessons already placed and counts them, adding only what is missing", () => {
    const fixed: CellIn[] = [
      { day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: null }] },
      { day: 2, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: null }] },
    ];
    const i = input(FIVE(), { cells: fixed });
    const result = autofill(i);
    expect(result.cells).toEqual(expect.arrayContaining(fixed));
    expect(periodsOf(result.cells, "maths")).toHaveLength(6);
    expect(errorsOf(i, result.cells)).toEqual([]);
  });

  it("a timetable that is already full is left as it is", () => {
    const i = input(FIVE());
    const full = autofill(i).cells;
    const again = autofill({ ...i, cells: full, seed: 99 });
    expect(again.cells).toEqual(full);
    expect(again.unplaced).toEqual([]);
  });
});

describe("a teacher", () => {
  it("is never given a period when they are teaching another class then, by the clock", () => {
    // Meena is busy in the whole of the first three periods on every day, in another class.
    const busy: Busy[] = [1, 2, 3, 4, 5].map((day) => ({ teacherId: "meena", room: null, day, start: t("08:30"), end: t("10:30"), where: "Class 6 - A", subjectName: "Maths" }));
    const i = input([allot("maths", "Mathematics", { periodsPerWeek: 10, teacherId: "meena" })], { busy });
    const result = autofill(i);
    expect(result.unplaced).toEqual([]);
    expect(result.cells.every((c) => c.period >= 4)).toBe(true);
    expect(errorsOf(i, result.cells)).toEqual([]);
  });

  it("is not given the days they do not come", () => {
    const teachers = new Map([teacher("meena", { offDays: [1, 2, 3] })].map((x) => [x.id, x]));
    const i = input([allot("maths", "Mathematics", { periodsPerWeek: 4, teacherId: "meena" })], { teachers });
    const result = autofill(i);
    expect(result.cells.every((c) => c.day >= 4)).toBe(true);
    expect(result.unplaced).toEqual([]);
  });

  it("two subjects of one teacher are never in the same period", () => {
    const i = input([allot("maths", "Mathematics", { periodsPerWeek: 20, teacherId: "meena" }), allot("science", "Science", { periodsPerWeek: 20, teacherId: "meena" })]);
    const result = autofill(i);
    expect(errorsOf(i, result.cells)).toEqual([]);
    expect(result.cells).toHaveLength(40);
  });

  it("goes into what cannot be placed, by subject: how many periods are still missing", () => {
    const busy: Busy[] = [1, 2, 3, 4, 5].map((day) => ({ teacherId: "meena", room: null, day, start: t("08:00"), end: t("15:00"), where: "Class 6 - A", subjectName: "Maths" }));
    const i = input([allot("maths", "Mathematics", { periodsPerWeek: 5, teacherId: "meena" }), allot("hindi", "Hindi", { periodsPerWeek: 3, teacherId: "asha" })], { busy });
    const result = autofill(i);
    expect(result.unplaced).toEqual([{ subjectId: "maths", subjectName: "Mathematics", missing: 5 }]);
    expect(periodsOf(result.cells, "hindi")).toHaveLength(3);
  });

  it("stays inside a daily limit when it can", () => {
    const teachers = new Map([teacher("meena", { maxPerDay: 2 })].map((x) => [x.id, x]));
    const i = input([allot("maths", "Mathematics", { periodsPerWeek: 10, teacherId: "meena" })], { teachers });
    const result = autofill(i);
    expect(check(i, result.cells).issues.filter((x) => x.code === "TEACHER_DAY_FULL")).toEqual([]);
  });
});

describe("double periods and choices", () => {
  it("a subject in blocks of two is placed two periods in a row, never across the lunch", () => {
    const i = input([allot("lab", "Computer Lab", { periodsPerWeek: 4, blockSize: 2, teacherId: "dev" })]);
    const result = autofill(i);
    expect(result.unplaced).toEqual([]);
    expect(check(i, result.cells).issues.filter((x) => x.code === "BLOCK_BROKEN")).toEqual([]);
    for (const day of [1, 2, 3, 4, 5]) {
      const here = result.cells.filter((c) => c.day === day).map((c) => c.period);
      // Periods 3 and 4 have the lunch between them: a block never starts at 3.
      expect(here.includes(3) && here.includes(4) && !here.includes(2) && !here.includes(5), `day ${day}`).toBe(false);
    }
  });

  it("the subjects of a choice share each of their periods", () => {
    const i = input([
      allot("sanskrit", "Sanskrit", { periodsPerWeek: 4, group: "third language", teacherId: "meena" }),
      allot("french", "French", { periodsPerWeek: 4, group: "third language", teacherId: "dev" }),
      allot("maths", "Mathematics", { periodsPerWeek: 5, teacherId: "asha" }),
    ]);
    const result = autofill(i);
    expect(result.unplaced).toEqual([]);
    expect(periodsOf(result.cells, "sanskrit")).toEqual(periodsOf(result.cells, "french"));
    expect(periodsOf(result.cells, "sanskrit")).toHaveLength(4);
    expect(check(i, result.cells).issues.filter((x) => x.code === "CHOICE_INCOMPLETE" || x.level === "error")).toEqual([]);
  });
});

describe("what it will not do", () => {
  it("never puts a lesson in a break or where the class has no period, and never invents a subject", () => {
    const i = input([allot("maths", "Mathematics", { periodsPerWeek: 3 })], { days: [{ day: 1, periods: SPANS.slice(0, 2) }] });
    const result = autofill(i);
    expect(result.cells).toHaveLength(2);
    expect(result.unplaced).toEqual([{ subjectId: "maths", subjectName: "Mathematics", missing: 1 }]);
  });

  it("does nothing for a class that studies nothing", () => {
    expect(autofill(input([])).cells).toEqual([]);
  });
});
