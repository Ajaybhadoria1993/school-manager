import { describe, expect, it } from "vitest";
import type { TeacherWeek } from "../../types";
import { lessonRuns } from "../teacherLessons";

/** Where a teacher already teaches, by day: the lessons that follow each other in one class are one line (Assign class shows it, 2026-11-13). */
type Lesson = TeacherWeek["lessons"][number];
const lesson = (day: number, period: number, start: string, end: string, label = "Nursery - A", subjectName = "Fun activity", classId = "n", sectionId: string | null = "n-A"): Lesson => ({
  day,
  period,
  start,
  end,
  classId,
  sectionId,
  label,
  subjectId: subjectName.toLowerCase(),
  subjectName,
  room: null,
  published: false,
});

describe("lessonRuns", () => {
  it("periods that follow each other in one class and subject are one line, with the time from the first start to the last end", () => {
    const runs = lessonRuns([lesson(1, 2, "10:10", "10:50"), lesson(1, 3, "10:50", "11:30"), lesson(1, 4, "11:45", "12:25")]);
    expect(runs).toEqual([{ day: 1, start: "10:10", end: "12:25", label: "Nursery - A", subjectName: "Fun activity", periods: [2, 4] }]);
  });

  it("a gap in the periods, another class or another subject starts a new line", () => {
    const runs = lessonRuns([lesson(1, 1, "09:30", "10:10"), lesson(1, 3, "10:50", "11:30"), lesson(1, 4, "11:45", "12:25", "Class 1 - A", "Fun activity", "c1", "c1-A"), lesson(1, 5, "12:25", "13:05", "Class 1 - A", "Art", "c1", "c1-A")]);
    expect(runs.map((r) => [r.start, r.end, r.label, r.subjectName, r.periods])).toEqual([
      ["09:30", "10:10", "Nursery - A", "Fun activity", [1, 1]],
      ["10:50", "11:30", "Nursery - A", "Fun activity", [3, 3]],
      ["11:45", "12:25", "Class 1 - A", "Fun activity", [4, 4]],
      ["12:25", "13:05", "Class 1 - A", "Art", [5, 5]],
    ]);
  });

  it("is in the order of the week: by day, then by time", () => {
    const runs = lessonRuns([lesson(2, 1, "09:30", "10:10"), lesson(1, 4, "11:45", "12:25"), lesson(1, 1, "09:30", "10:10")]);
    expect(runs.map((r) => `${r.day} ${r.start}`)).toEqual(["1 09:30", "1 11:45", "2 09:30"]);
  });

  it("has nothing for a teacher with no lesson", () => {
    expect(lessonRuns([])).toEqual([]);
  });
});
