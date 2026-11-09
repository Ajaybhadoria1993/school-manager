import { describe, it, expect } from "vitest";
import { clockToMinutes } from "../time";
import { analyse, type AllotmentInfo, type Busy, type CellIn, type CheckInput, type Issue, type TeacherInfo } from "../services/checker";

const t = (clock: string) => clockToMinutes(clock)!;

/** Monday and Tuesday, five periods each: 08:30-09:10, 09:10-09:50, 09:50-10:30, (lunch) 11:00-11:40, 11:40-12:20. */
const SPANS = [
  { period: 1, label: "Period 1", start: t("08:30"), end: t("09:10") },
  { period: 2, label: "Period 2", start: t("09:10"), end: t("09:50") },
  { period: 3, label: "Period 3", start: t("09:50"), end: t("10:30") },
  { period: 4, label: "Period 4", start: t("11:00"), end: t("11:40") },
  { period: 5, label: "Period 5", start: t("11:40"), end: t("12:20") },
];
const DAYS = [
  { day: 1, periods: SPANS },
  { day: 2, periods: SPANS },
];

const allot = (id: string, name: string, over: Partial<AllotmentInfo> = {}): AllotmentInfo => ({
  subjectId: id,
  subjectName: name,
  periodsPerWeek: 2,
  blockSize: 1,
  teacherId: null,
  group: null,
  ...over,
});
const teacher = (id: string, name: string, over: Partial<TeacherInfo> = {}): TeacherInfo => ({ id, name, isActive: true, offDays: [], maxPerDay: null, maxPerWeek: null, ...over });
const cell = (day: number, period: number, ...subjects: (string | { subjectId: string; teacherId?: string | null; room?: string | null })[]): CellIn => ({
  day,
  period,
  lessons: subjects.map((s) => (typeof s === "string" ? { subjectId: s, teacherId: null, room: null } : { subjectId: s.subjectId, teacherId: s.teacherId ?? null, room: s.room ?? null })),
});

/** Maths (Meena) and English (Dev), 2 periods a week each; the school has Meena, Dev and Anil (who has left). */
function input(cells: CellIn[], over: Partial<CheckInput> = {}): CheckInput {
  return {
    days: DAYS,
    cells,
    allotments: new Map([
      ["maths", allot("maths", "Mathematics", { teacherId: "meena" })],
      ["english", allot("english", "English", { teacherId: "dev" })],
    ]),
    teachers: new Map([
      ["meena", teacher("meena", "Meena Singh")],
      ["dev", teacher("dev", "Dev Patel")],
      ["anil", teacher("anil", "Anil Rao", { isActive: false })],
    ]),
    busy: [],
    ...over,
  };
}
const issues = (result: { issues: Issue[] }, level?: "error" | "warning") => result.issues.filter((i) => !level || i.level === level).map((i) => `${i.code}${i.day ? ` d${i.day}` : ""}${i.period ? `p${i.period}` : ""}`);
const messages = (result: { issues: Issue[] }, code: string) => result.issues.filter((i) => i.code === code).map((i) => i.message);
const elsewhere = (over: Partial<Busy>): Busy => ({ teacherId: null, room: null, day: 1, start: t("08:30"), end: t("09:10"), where: "Class 7 - B", subjectName: "Maths", ...over });

describe("a clean timetable", () => {
  it("has no errors and no warnings when every subject has its periods and a teacher", () => {
    const result = analyse(input([cell(1, 1, "maths"), cell(2, 3, "maths"), cell(1, 2, "english"), cell(2, 4, "english")]));
    expect(result.issues).toEqual([]);
    expect(result.placed.get("maths")).toBe(2);
    expect(result.total).toBe(10);
    expect(result.free).toBe(6);
  });

  it("is fine empty (nothing placed yet says only what is missing)", () => {
    const result = analyse(input([]));
    expect(issues(result, "error")).toEqual([]);
    expect(issues(result, "warning")).toEqual(["TOO_FEW", "TOO_FEW"]);
    expect(messages(result, "TOO_FEW")).toEqual(["Mathematics has none of its 2 periods", "English has none of its 2 periods"]);
  });
});

describe("a lesson must be where the class has a period and studies the subject", () => {
  it("refuses a period that is not in the class's timing, a day that is not a school day, and a period used twice", () => {
    const result = analyse(input([cell(1, 6, "maths"), cell(3, 1, "maths"), cell(1, 1, "maths"), cell(1, 1, "english")]));
    // By day and period, whatever order they were found in.
    expect(issues(result, "error")).toEqual(["CELL_TWICE d1p1", "CELL_OUTSIDE d1p6", "CELL_OUTSIDE d3p1"]);
    expect(messages(result, "CELL_OUTSIDE")).toEqual(["Monday has no period 6 in this class's timing", "This class has no school on Wednesday"]);
  });

  it("refuses a subject the class does not study, and a subject twice in one period", () => {
    const result = analyse(input([cell(1, 1, "art"), cell(1, 2, "maths", "maths")]));
    expect(issues(result, "error")).toEqual(["SUBJECT_NOT_STUDIED d1p1", "LESSON_TWICE d1p2"]);
    expect(messages(result, "SUBJECT_NOT_STUDIED")).toEqual(["This class does not study this subject"]);
  });
});

describe("teachers", () => {
  it("a lesson is taught by the teacher of the class's subject, or by the one it names", () => {
    const result = analyse(input([cell(1, 1, { subjectId: "maths", teacherId: "dev" })], { busy: [elsewhere({ teacherId: "dev" })] }));
    // Dev (named) is busy in Class 7 - B at that time; Meena would not have been.
    expect(issues(result, "error")).toEqual(["TEACHER_BUSY d1p1"]);
    expect(messages(result, "TEACHER_BUSY")).toEqual(["Dev Patel is teaching Class 7 - B (Maths) at the same time"]);
    const free = analyse(input([cell(1, 1, "maths")], { busy: [elsewhere({ teacherId: "dev" })] }));
    expect(issues(free, "error")).toEqual([]);
  });

  it("is busy by the clock, not by the period number: a lesson that only partly overlaps clashes, one that ends as the other starts does not", () => {
    // Period 2 here is 09:10-09:50.
    const overlap = analyse(input([cell(1, 2, "maths")], { busy: [elsewhere({ teacherId: "meena", start: t("09:30"), end: t("10:10") })] }));
    expect(issues(overlap, "error")).toEqual(["TEACHER_BUSY d1p2"]);
    const touching = analyse(input([cell(1, 2, "maths")], { busy: [elsewhere({ teacherId: "meena", start: t("09:50"), end: t("10:30") })] }));
    expect(issues(touching, "error")).toEqual([]);
    const otherDay = analyse(input([cell(1, 2, "maths")], { busy: [elsewhere({ teacherId: "meena", day: 2, start: t("09:10"), end: t("09:50") })] }));
    expect(issues(otherDay, "error")).toEqual([]);
  });

  it("cannot be in two lessons of one period (two subjects of a choice with one teacher)", () => {
    const base = input([cell(1, 1, { subjectId: "maths", teacherId: "dev" }, { subjectId: "english" })]);
    base.allotments.set("maths", allot("maths", "Mathematics", { teacherId: "meena", group: "choice" }));
    base.allotments.set("english", allot("english", "English", { teacherId: "dev", group: "choice" }));
    expect(issues(analyse(base), "error")).toEqual(["TEACHER_TWICE d1p1"]);
  });

  it("must still be teaching here, and must come on that day", () => {
    const gone = analyse(input([cell(1, 1, { subjectId: "maths", teacherId: "anil" })]));
    expect(issues(gone, "error")).toEqual(["TEACHER_GONE d1p1"]);
    expect(messages(gone, "TEACHER_GONE")).toEqual(["Anil Rao is no longer teaching here"]);
    const unknown = analyse(input([cell(1, 1, { subjectId: "maths", teacherId: "ghost" })]));
    expect(issues(unknown, "error")).toEqual(["TEACHER_GONE d1p1"]);

    const base = input([cell(1, 1, "maths"), cell(2, 1, "maths")]);
    base.teachers.set("meena", teacher("meena", "Meena Singh", { offDays: [1] }));
    const off = analyse(base);
    expect(issues(off, "error")).toEqual(["TEACHER_OFF d1p1"]);
    expect(messages(off, "TEACHER_OFF")).toEqual(["Meena Singh does not come on Monday"]);
  });

  it("a lesson with no teacher is a warning for the subject, once, with how many periods", () => {
    const base = input([cell(1, 1, "maths"), cell(1, 2, "maths"), cell(2, 1, "english")]);
    base.allotments.set("maths", allot("maths", "Mathematics"));
    const result = analyse(base);
    expect(issues(result, "error")).toEqual([]);
    expect(messages(result, "NO_TEACHER")).toEqual(["Mathematics has no teacher in 2 periods"]);
  });

  it("is warned about, not refused, when over the most periods a day or a week, counting the periods taught elsewhere", () => {
    const base = input([cell(1, 1, "maths"), cell(1, 3, "maths")]);
    base.teachers.set("meena", teacher("meena", "Meena Singh", { maxPerDay: 3, maxPerWeek: 4 }));
    const busy = [
      elsewhere({ teacherId: "meena", day: 1, start: t("11:00"), end: t("11:40") }),
      elsewhere({ teacherId: "meena", day: 2, start: t("08:30"), end: t("09:10") }),
    ];
    // 2 here + 1 elsewhere = 3 on Monday and 4 in the week: at the limits, not over them.
    const atLimit = analyse({ ...base, busy });
    expect(issues(atLimit, "error")).toEqual([]);
    expect(messages(atLimit, "TEACHER_DAY_FULL")).toEqual([]);
    expect(messages(atLimit, "TEACHER_WEEK_FULL")).toEqual([]);
    const over = analyse({ ...base, busy: [...busy, elsewhere({ teacherId: "meena", day: 1, start: t("12:00"), end: t("12:40") }), elsewhere({ teacherId: "meena", day: 2, start: t("09:10"), end: t("09:50") })] });
    expect(issues(over, "error")).toEqual([]);
    expect(messages(over, "TEACHER_DAY_FULL")).toEqual(["Meena Singh has 4 periods on Monday: the most is 3"]);
    expect(messages(over, "TEACHER_WEEK_FULL")).toEqual(["Meena Singh has 6 periods this week: the most is 4"]);
  });
});

describe("rooms", () => {
  it("one room is for one class at a time, however it is spelled; the same room in another period is fine", () => {
    const result = analyse(input([cell(1, 1, { subjectId: "maths", room: "Computer  Lab" })], { busy: [elsewhere({ room: "computer lab", subjectName: "Computer" })] }));
    expect(issues(result, "error")).toEqual(["ROOM_BUSY d1p1"]);
    expect(messages(result, "ROOM_BUSY")).toEqual(["Computer  Lab is being used by Class 7 - B (Computer) at the same time"]);
    const later = analyse(input([cell(1, 2, { subjectId: "maths", room: "Computer Lab" })], { busy: [elsewhere({ room: "computer lab" })] }));
    expect(issues(later, "error")).toEqual([]);
  });

  it("is not for two lessons of one period either", () => {
    const base = input([cell(1, 1, { subjectId: "maths", room: "Lab" }, { subjectId: "english", room: "lab" })]);
    base.allotments.set("maths", allot("maths", "Mathematics", { teacherId: "meena", group: "choice" }));
    base.allotments.set("english", allot("english", "English", { teacherId: "dev", group: "choice" }));
    expect(issues(analyse(base), "error")).toEqual(["ROOM_TWICE d1p1"]);
  });
});

describe("a choice (subjects taught side by side)", () => {
  const choice = () => {
    const base = input([]);
    base.allotments.set("sanskrit", allot("sanskrit", "Sanskrit", { teacherId: "meena", group: "third language" }));
    base.allotments.set("french", allot("french", "French", { teacherId: "dev", group: "third language" }));
    return base;
  };

  it("shares a period: the lessons of the choice together are fine, and count one period each", () => {
    const base = { ...choice(), cells: [cell(1, 1, "sanskrit", "french"), cell(2, 1, "sanskrit", "french")] };
    const result = analyse(base);
    expect(issues(result, "error")).toEqual([]);
    expect(result.placed.get("sanskrit")).toBe(2);
    expect(result.placed.get("french")).toBe(2);
  });

  it("only the subjects of one choice may share a period", () => {
    const base = { ...choice(), cells: [cell(1, 1, "sanskrit", { subjectId: "maths", teacherId: "dev" }), cell(1, 2, "sanskrit", "french")] };
    expect(issues(analyse(base), "error")).toEqual(["NOT_A_CHOICE d1p1"]);
    expect(messages(analyse(base), "NOT_A_CHOICE")).toEqual(["Only the subjects of one choice can share a period"]);
  });

  it("warns when a period has some of a choice's subjects but not all (its other students would have no lesson)", () => {
    const base = { ...choice(), cells: [cell(1, 1, "sanskrit")] };
    expect(messages(analyse(base), "CHOICE_INCOMPLETE")).toEqual(["In this period the choice 'third language' has no lesson for French"]);
  });
});

describe("how the periods are spread (warnings)", () => {
  it("says what is missing and what is too much, by subject", () => {
    const result = analyse(input([cell(1, 1, "maths"), cell(2, 1, "maths"), cell(2, 2, "maths"), cell(1, 3, "english")]));
    expect(messages(result, "TOO_MANY")).toEqual(["Mathematics has 3 periods but 2 are allotted"]);
    expect(messages(result, "TOO_FEW")).toEqual(["English has 1 of its 2 periods"]);
  });

  it("warns when a subject comes back to back, and more often than twice a day", () => {
    const base = input([cell(1, 1, "maths"), cell(1, 2, "maths")]);
    expect(issues(analyse(base), "warning")).toContain("BACK_TO_BACK d1p1");
    expect(messages(analyse(base), "BACK_TO_BACK")).toEqual(["Mathematics is in two periods in a row on Monday"]);

    const often = input([cell(1, 1, "maths"), cell(1, 3, "maths"), cell(1, 5, "maths")]);
    expect(messages(analyse(often), "TOO_OFTEN")).toEqual(["Mathematics is 3 times on Monday"]);
  });

  it("does not count two periods as in a row when the lunch (or any break) is between them", () => {
    // Periods 3 and 4 are 10:30 and 11:00 apart: lunch.
    const result = analyse(input([cell(1, 3, "maths"), cell(1, 4, "maths")]));
    expect(issues(result, "warning")).not.toContain("BACK_TO_BACK d1p3");
  });

  it("a subject given in blocks is fine in whole blocks, and warned about when a block is broken", () => {
    const base = input([cell(1, 1, "maths"), cell(1, 2, "maths"), cell(2, 1, "maths")]);
    base.allotments.set("maths", allot("maths", "Computer Lab", { teacherId: "meena", periodsPerWeek: 4, blockSize: 2 }));
    const result = analyse(base);
    expect(issues(result, "warning")).not.toContain("BACK_TO_BACK d1p1");
    expect(messages(result, "BLOCK_BROKEN")).toEqual(["Computer Lab is meant for 2 periods in a row: there is 1 on Tuesday"]);
  });
});

describe("the order of what is said", () => {
  it("errors first, then warnings, each by day and period", () => {
    const result = analyse(input([cell(2, 1, "art"), cell(1, 1, "art")]));
    expect(result.issues.map((i) => i.level)).toEqual([...result.issues.map((i) => i.level)].sort((a, b) => (a === b ? 0 : a === "error" ? -1 : 1)));
    expect(issues(result, "error")).toEqual(["SUBJECT_NOT_STUDIED d1p1", "SUBJECT_NOT_STUDIED d2p1"]);
  });
});
