import { describe, expect, it } from "vitest";
import type { ProgressRow } from "../../types";
import { byTeacher, copyChapters, reminderTimes } from "../teachingProgress";

const chapter = (id: string, over: Partial<ProgressRow["chapters"][number]> = {}) => ({ id, number: 1, name: id, done: false, completedOn: null, days: 0, startedOn: null, plannedOn: null, late: false, ...over });
const row = (subjectId: string, over: Partial<ProgressRow> = {}): ProgressRow => ({
  classId: "c5",
  sectionId: null,
  classLabel: "Class 5",
  subjectId,
  subjectName: subjectId,
  teacherId: "meena",
  teacherName: "Meena Singh",
  chapters: [],
  late: 0,
  current: null,
  updates: 0,
  homework: 0,
  last: null,
  ...over,
});

describe("byTeacher", () => {
  it("adds a teacher's class subjects together, the late chapters too; a subject with no teacher is nobody's", () => {
    const rows = [
      row("maths", { updates: 2, homework: 1, late: 2, chapters: [chapter("a", { done: true }), chapter("b", { late: true }), chapter("c", { late: true })] }),
      row("science", { late: 1, chapters: [chapter("d", { late: true })] }),
      row("music", { teacherId: null, teacherName: null, updates: 5 }),
    ];
    expect(byTeacher(rows)).toEqual([{ teacherId: "meena", name: "Meena Singh", subjects: 2, updates: 2, homework: 1, chaptersDone: 1, chaptersTotal: 4, late: 3, withoutUpdate: 1 }]);
  });
});

describe("copyChapters", () => {
  const empty = { key: 0, name: "", done: false, plannedOn: "" };

  it("adds the copied chapters after the ones there, with their planned days; empty rows go", () => {
    const rows = [{ key: 0, id: "ch1", name: "Numbers", done: true, plannedOn: "" }, { ...empty, key: 1 }];
    const copied = copyChapters(rows, [
      { name: "Fractions", plannedOn: "2027-01-10" },
      { name: "Shapes", plannedOn: null },
    ]);
    expect(copied).toEqual([
      rows[0],
      { key: 2, name: "Fractions", done: false, plannedOn: "2027-01-10" },
      { key: 3, name: "Shapes", done: false, plannedOn: "" },
    ]);
  });

  it("a chapter already there by name is not added again, whatever the capitals or spaces", () => {
    const rows = [{ key: 4, name: " numbers ", done: false, plannedOn: "" }];
    expect(copyChapters(rows, [{ name: "Numbers", plannedOn: null }, { name: "Angles", plannedOn: null }, { name: "angles", plannedOn: null }]).map((r) => r.name)).toEqual([" numbers ", "Angles"]);
  });

  it("keeps a row with no name that has a day or a tick, and stops at 60", () => {
    const rows = [{ ...empty, plannedOn: "2027-01-10" }, { ...empty, key: 1, done: true }];
    const source = Array.from({ length: 80 }, (_, i) => ({ name: `C${i}`, plannedOn: null }));
    const copied = copyChapters(rows, source);
    expect(copied).toHaveLength(60);
    expect(copied.slice(0, 2)).toEqual(rows);
  });
});

describe("reminderTimes", () => {
  it("offers every half hour from noon to 9 PM, as a school writes them", () => {
    const times = reminderTimes("16:00");
    expect(times).toHaveLength(19);
    expect(times[0]).toEqual({ value: "12:00", label: "12:00 PM" });
    expect(times.at(-1)).toEqual({ value: "21:00", label: "9:00 PM" });
  });

  it("a time saved between the half hours stays in the list, in its place", () => {
    const times = reminderTimes("13:15");
    expect(times).toHaveLength(20);
    expect(times[3]).toEqual({ value: "13:15", label: "1:15 PM" });
  });
});
