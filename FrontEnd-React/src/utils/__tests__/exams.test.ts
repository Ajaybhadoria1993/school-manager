import { describe, expect, it } from "vitest";
import type { Exam, ExamPaper } from "../../types";
import { clock12, defaultExamName, durationText, endClock, examDays, groupByDate, groupByTimetable, isHalfMark, nextRowDefaults, resultText, weekdayDay } from "../exams";

const klass = (n: number) => ({ id: `c${n}`, name: `Class ${n}`, order: n });
const MATHS = { id: "s1", name: "Mathematics" };
const ENGLISH = { id: "s2", name: "English" };
let counter = 0;
const paper = (classes: number[], subject = MATHS, date = "2026-09-15", startTime = "09:00", durationMinutes = 180, over: Partial<ExamPaper> = {}): ExamPaper => ({
  id: `p${++counter}`,
  examId: "e1",
  classIds: classes.map((n) => `c${n}`),
  classes: classes.map(klass),
  subject,
  date,
  startTime,
  endTime: endClock(startTime, durationMinutes),
  durationMinutes,
  maxMarks: null,
  topic: null,
  marked: 0,
  holiday: null,
  ...over,
});

describe("times and days the way a school writes them", () => {
  it("writes a time of day with AM and PM", () => {
    expect(clock12("09:00")).toBe("9:00 AM");
    expect(clock12("12:30")).toBe("12:30 PM");
    expect(clock12("00:05")).toBe("12:05 AM");
    expect(clock12("15:45")).toBe("3:45 PM");
    expect(clock12("24:00")).toBe("12:00 AM");
  });

  it("works out when a paper ends, and says how long it is", () => {
    expect(endClock("09:00", 180)).toBe("12:00");
    expect(endClock("10:15", 45)).toBe("11:00");
    expect(durationText(40)).toBe("40 min");
    expect(durationText(180)).toBe("3 h");
    expect(durationText(90)).toBe("1 h 30 min");
  });

  it("writes a day with its weekday, and the days an exam runs", () => {
    expect(weekdayDay("2026-09-15")).toBe("Tue, 15 Sep");
    expect(weekdayDay("2026-09-15", true)).toBe("Tue, 15 Sep 2026");
    expect(examDays("2026-09-15", "2026-09-26")).toBe("15 Sep to 26 Sep 2026");
    expect(examDays("2026-10-30", "2026-10-30")).toBe("30 Oct 2026");
    expect(examDays("2026-12-28", "2027-01-05")).toBe("28 Dec 2026 to 5 Jan 2027");
  });

  it("suggests a name for the kind of exam", () => {
    expect(defaultExamName("half_yearly")).toBe("Half-Yearly Exam");
    expect(defaultExamName("annual")).toBe("Annual Exam");
    expect(defaultExamName("monthly_test")).toBe("Monthly Test");
    expect(defaultExamName("other")).toBe("");
  });
});

describe("which classes have the same timetable", () => {
  it("puts the classes whose dates and times are all the same together, in the school's class order", () => {
    const papers = [paper([1, 2, 3], MATHS, "2026-09-15"), paper([1, 2, 3], ENGLISH, "2026-09-17"), paper([6], MATHS, "2026-09-16"), paper([6], ENGLISH, "2026-09-18")];
    const groups = groupByTimetable(papers);
    expect(groups.map((g) => g.classes.map((c) => c.name))).toEqual([["Class 1", "Class 2", "Class 3"], ["Class 6"]]);
    expect(groups[0].papers.map((p) => p.subject.name)).toEqual(["Mathematics", "English"]);
    expect(groups[1].papers.map((p) => p.date)).toEqual(["2026-09-16", "2026-09-18"]);
  });

  it("splits a class off when only one of its papers is on another day or time, and lists a shared paper in each group it belongs to", () => {
    const papers = [paper([1, 2, 3], MATHS, "2026-09-15"), paper([1, 2], ENGLISH, "2026-09-17"), paper([3], ENGLISH, "2026-09-18")];
    const groups = groupByTimetable(papers);
    expect(groups.map((g) => g.classes.map((c) => c.name))).toEqual([["Class 1", "Class 2"], ["Class 3"]]);
    expect(groups[0].papers.map((p) => p.subject.name)).toEqual(["Mathematics", "English"]);
    expect(groups[1].papers.map((p) => `${p.subject.name} ${p.date}`)).toEqual(["Mathematics 2026-09-15", "English 2026-09-18"]);
  });

  it("keeps two papers of one slot when their topics differ, so neither class's topic is lost", () => {
    const papers = [paper([1], MATHS, "2026-09-15", "09:00", 180, { topic: "Fractions" }), paper([2], MATHS, "2026-09-15", "09:00", 180, { topic: "Shapes" })];
    const groups = groupByTimetable(papers);
    expect(groups).toHaveLength(1);
    expect(groups[0].classes.map((c) => c.name)).toEqual(["Class 1", "Class 2"]);
    expect(groups[0].papers.map((p) => p.topic)).toEqual(["Fractions", "Shapes"]);
  });

  it("is empty with no papers", () => {
    expect(groupByTimetable([])).toEqual([]);
  });
});

describe("a day at a time", () => {
  it("lists the days that have papers, each in time order", () => {
    const papers = [paper([1], ENGLISH, "2026-09-16", "09:00"), paper([2], MATHS, "2026-09-15", "10:30"), paper([1], MATHS, "2026-09-15", "09:00")];
    const days = groupByDate(papers);
    expect(days.map((d) => d.date)).toEqual(["2026-09-15", "2026-09-16"]);
    expect(days[0].papers.map((p) => p.startTime)).toEqual(["09:00", "10:30"]);
  });
});

describe("the next row of a timetable", () => {
  const exam = { startDate: "2026-09-15", endDate: "2026-09-26", full: true, schoolHours: { start: "08:00", end: "12:30" } } as Pick<Exam, "startDate" | "endDate" | "full" | "schoolHours">;

  it("starts at the exam's first day and school start, 3 hours for an exam and 40 minutes for a test", () => {
    expect(nextRowDefaults(null, exam)).toEqual({ date: "2026-09-15", startTime: "08:00", durationMinutes: 180 });
    expect(nextRowDefaults(null, { ...exam, full: false, schoolHours: null })).toEqual({ date: "2026-09-15", startTime: "09:00", durationMinutes: 40 });
  });

  it("goes on the next day with the same time and length, leaves Sunday out, and stops at the exam's last day", () => {
    expect(nextRowDefaults({ date: "2026-09-15", startTime: "09:30", durationMinutes: 120 }, exam)).toEqual({ date: "2026-09-16", startTime: "09:30", durationMinutes: 120 });
    expect(nextRowDefaults({ date: "2026-09-19", startTime: "09:00", durationMinutes: 120 }, exam).date).toBe("2026-09-21");
    expect(nextRowDefaults({ date: "2026-09-26", startTime: "09:00", durationMinutes: 120 }, exam).date).toBe("2026-09-26");
  });
});

describe("marks of an exam paper (2026-11-06)", () => {
  it("a mark is whole or half: 42 and 42.5 yes, 33.3 and 0.25 no, and text that is not a number no", () => {
    expect(isHalfMark(42)).toBe(true);
    expect(isHalfMark(42.5)).toBe(true);
    expect(isHalfMark(0)).toBe(true);
    expect(isHalfMark(33.3)).toBe(false);
    expect(isHalfMark(0.25)).toBe(false);
    expect(isHalfMark(Number.NaN)).toBe(false);
    expect(isHalfMark(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("a child's result in words: marks out of the paper's with the percentage, Absent, or that the marks are not in yet for a paper that was held", () => {
    const base = { date: "2026-09-15", maxMarks: 50 };
    expect(resultText({ ...base, result: { marks: 45, absent: false, percent: 90 } }, "2026-11-06")).toBe("45 / 50 · 90%");
    expect(resultText({ ...base, result: { marks: 22.5, absent: false, percent: 45 } }, "2026-11-06")).toBe("22.5 / 50 · 45%");
    expect(resultText({ ...base, result: { marks: 0, absent: false, percent: 0 } }, "2026-11-06")).toBe("0 / 50 · 0%");
    expect(resultText({ ...base, result: { marks: null, absent: true, percent: null } }, "2026-11-06")).toBe("Absent");
    expect(resultText({ ...base, result: null }, "2026-11-06")).toBe("Marks not in yet");
    expect(resultText({ ...base, result: null }, "2026-09-15")).toBe("Marks not in yet"); // the day itself counts as held
  });

  it("a paper that has not been held says nothing about marks", () => {
    expect(resultText({ date: "2026-12-01", maxMarks: 50, result: null }, "2026-11-06")).toBeNull();
  });

  it("a result with no percentage (the paper has no out-of) still shows the marks", () => {
    expect(resultText({ date: "2026-09-15", maxMarks: null, result: { marks: 12, absent: false, percent: null } }, "2026-11-06")).toBe("12");
  });
});
