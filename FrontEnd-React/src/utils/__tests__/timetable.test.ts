import { describe, expect, it } from "vitest";
import type { GridCell, GridView } from "../../types";
import { buildModel, changeLesson, choiceOf, clearCell, localProblems, matchChoices, missingPeriods, periodsInARow, placeSubject, placedCounts, sameGrid, subjectChoices, teacherOf, teacherTrouble } from "../timetable";

const day = (n: number, name: string) => ({
  day: n,
  name,
  slots: [
    { kind: "period" as const, label: "Period 1", start: "08:30", end: "09:10", period: 1 },
    { kind: "period" as const, label: "Period 2", start: "09:10", end: "09:50", period: 2 },
    { kind: "period" as const, label: "Period 3", start: "09:50", end: "10:30", period: 3 },
    { kind: "lunch" as const, label: "Lunch", start: "10:30", end: "11:00", period: null },
    { kind: "period" as const, label: "Period 4", start: "11:00", end: "11:40", period: 4 },
    { kind: "period" as const, label: "Period 5", start: "11:40", end: "12:20", period: 5 },
  ],
});

const VIEW = {
  days: [day(1, "Monday"), day(2, "Tuesday")],
  allotments: [
    { subjectId: "maths", subjectName: "Mathematics", subjectCode: null, category: "academic", periodsPerWeek: 4, blockSize: 1, teacherId: "meena", group: null },
    { subjectId: "lab", subjectName: "Computer Lab", subjectCode: null, category: "activity", periodsPerWeek: 2, blockSize: 2, teacherId: "dev", group: null },
    { subjectId: "sanskrit", subjectName: "Sanskrit", subjectCode: null, category: "academic", periodsPerWeek: 3, blockSize: 1, teacherId: "meena", group: "Third language" },
    { subjectId: "french", subjectName: "French", subjectCode: null, category: "academic", periodsPerWeek: 3, blockSize: 1, teacherId: "dev", group: "third language" },
  ],
  teachers: [
    { id: "meena", name: "Meena Singh", isActive: true, offDays: [2], maxPerDay: null, maxPerWeek: null, subjectIds: [] },
    { id: "dev", name: "Dev Patel", isActive: true, offDays: [], maxPerDay: null, maxPerWeek: null, subjectIds: [] },
    { id: "anil", name: "Anil Rao", isActive: false, offDays: [], maxPerDay: null, maxPerWeek: null, subjectIds: [] },
  ],
  busy: [
    { day: 1, period: 2, teacherId: "dev", room: "Computer Lab", where: "Class 6 - A", subjectName: "Computer" },
  ],
  load: [],
} as unknown as GridView;
const model = buildModel(VIEW);
const cell = (d: number, p: number, ...subjects: string[]): GridCell => ({ day: d, period: p, lessons: subjects.map((subjectId) => ({ subjectId, teacherId: null, room: null })) });
const where = (cells: GridCell[]) => cells.map((c) => `${c.day}.${c.period}:${c.lessons.map((l) => l.subjectId).join("+")}`);

describe("periods in a row", () => {
  it("are the periods that follow each other with nothing between them", () => {
    expect(periodsInARow(model, 1, 1, 2)).toEqual([1, 2]);
    expect(periodsInARow(model, 1, 4, 2)).toEqual([4, 5]);
    expect(periodsInARow(model, 1, 1, 1)).toEqual([1]);
  });

  it("stop at the lunch, and at the end of the day, and are none for a period the day does not have", () => {
    expect(periodsInARow(model, 1, 3, 2)).toEqual([3]);
    expect(periodsInARow(model, 1, 5, 2)).toEqual([5]);
    expect(periodsInARow(model, 1, 9, 2)).toEqual([]);
    expect(periodsInARow(model, 4, 1, 2)).toEqual([]);
  });
});

describe("putting a subject in a period", () => {
  it("fills the period, and keeps the grid in order", () => {
    const { cells, placed, note } = placeSubject(model, [cell(2, 1, "maths")], "maths", 1, 2);
    expect(where(cells)).toEqual(["1.2:maths", "2.1:maths"]);
    expect({ placed, note }).toEqual({ placed: 1, note: null });
  });

  it("replaces what was in the period", () => {
    const { cells } = placeSubject(model, [cell(1, 1, "maths")], "lab", 1, 1);
    expect(where(cells)).toEqual(["1.1:lab", "1.2:lab"]);
  });

  it("a subject in double periods takes the two periods in a row, replacing what they held", () => {
    const { cells, placed } = placeSubject(model, [cell(1, 2, "maths")], "lab", 1, 1);
    expect(where(cells)).toEqual(["1.1:lab", "1.2:lab"]);
    expect(placed).toBe(2);
  });

  it("tells when a double period does not fit (the lunch, the end of the day)", () => {
    const atLunch = placeSubject(model, [], "lab", 1, 3);
    expect(where(atLunch.cells)).toEqual(["1.3:lab"]);
    expect(atLunch.note).toBe("Computer Lab is meant for 2 periods in a row, but only 1 fit here.");
    expect(placeSubject(model, [], "lab", 1, 5).placed).toBe(1);
  });

  it("a choice puts all its subjects side by side, whichever of them was picked", () => {
    const { cells } = placeSubject(model, [], "french", 1, 1);
    expect(where(cells)).toEqual(["1.1:sanskrit+french"]);
    expect(choiceOf(model, "sanskrit").map((a) => a.subjectId)).toEqual(["sanskrit", "french"]);
    expect(choiceOf(model, "maths").map((a) => a.subjectId)).toEqual(["maths"]);
  });

  it("a second click on a period that has exactly that subject takes it off", () => {
    const first = placeSubject(model, [], "maths", 1, 1).cells;
    expect(placeSubject(model, first, "maths", 1, 1).cells).toEqual([]);
    // A period with a choice is not "exactly that subject": it is replaced by the same choice.
    const choice = placeSubject(model, [], "sanskrit", 1, 1).cells;
    expect(where(placeSubject(model, choice, "sanskrit", 1, 1).cells)).toEqual(["1.1:sanskrit+french"]);
  });

  it("does nothing for a subject the class does not study or a period the day does not have", () => {
    expect(placeSubject(model, [], "art", 1, 1).cells).toEqual([]);
    expect(placeSubject(model, [], "maths", 1, 9).cells).toEqual([]);
  });
});

describe("clearing and changing a period", () => {
  it("takes a period's lesson out, and changes a lesson's teacher or room without touching the others", () => {
    const cells = [cell(1, 1, "maths"), cell(1, 2, "sanskrit", "french")];
    expect(where(clearCell(cells, 1, 1))).toEqual(["1.2:sanskrit+french"]);
    const changed = changeLesson(cells, 1, 2, "french", { room: "Room 4", teacherId: "meena" });
    expect(changed[1].lessons).toEqual([
      { subjectId: "sanskrit", teacherId: null, room: null },
      { subjectId: "french", teacherId: "meena", room: "Room 4" },
    ]);
    expect(changed[0]).toBe(cells[0]);
  });
});

describe("counting", () => {
  it("counts a period for each subject in it, and says how many are still to place", () => {
    const cells = [cell(1, 1, "maths"), cell(1, 2, "maths"), cell(2, 1, "sanskrit", "french")];
    expect([...placedCounts(cells)]).toEqual([["maths", 2], ["sanskrit", 1], ["french", 1]]);
    expect(missingPeriods(model, cells, "maths")).toBe(2);
    expect(missingPeriods(model, cells, "french")).toBe(2);
    expect(missingPeriods(model, [...cells, cell(2, 2, "maths"), cell(2, 3, "maths"), cell(1, 4, "maths")], "maths")).toBe(-1);
  });
});

describe("what can be said at once about a period", () => {
  it("a teacher who does not come that day, or who is no longer teaching here", () => {
    const off = localProblems(model, [cell(2, 1, "maths")]);
    expect(off.get("2:1")).toEqual(["Meena Singh does not come on Tuesday"]);
    const gone = localProblems(model, [{ day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: "anil", room: null }] }]);
    expect(gone.get("1:1")).toEqual(["Anil Rao is no longer teaching here"]);
    expect(teacherOf(model, { subjectId: "maths", teacherId: "anil", room: null })).toBe("anil");
    expect(teacherOf(model, { subjectId: "maths", teacherId: null, room: null })).toBe("meena");
  });

  it("a teacher or a room another class has at that period", () => {
    const problems = localProblems(model, [{ day: 1, period: 2, lessons: [{ subjectId: "lab", teacherId: null, room: "computer lab" }] }]);
    expect(problems.get("1:2")).toEqual(["Dev Patel is teaching Class 6 - A (Computer) at the same time", "computer lab is being used by Class 6 - A (Computer) at the same time"]);
    expect(localProblems(model, [cell(1, 1, "lab")]).size).toBe(0);
  });

  it("two subjects in one period that are not one choice, and a teacher in two lessons of one period", () => {
    expect(localProblems(model, [cell(1, 1, "maths", "lab")]).get("1:1")).toEqual(["Only the subjects of one choice can share a period"]);
    const twice = localProblems(model, [{ day: 1, period: 1, lessons: [{ subjectId: "sanskrit", teacherId: "dev", room: null }, { subjectId: "french", teacherId: null, room: null }] }]);
    expect(twice.get("1:1")).toEqual(["Dev Patel cannot teach two subjects in one period"]);
  });

  it("nothing for a clean grid", () => {
    expect(localProblems(model, [cell(1, 1, "maths"), cell(1, 4, "lab"), cell(1, 5, "lab")]).size).toBe(0);
  });
});

describe("whether the grid is what was saved", () => {
  it("is the same lessons in the same periods, in any order", () => {
    expect(sameGrid([cell(1, 1, "maths"), cell(2, 1, "lab")], [cell(2, 1, "lab"), cell(1, 1, "maths")])).toBe(true);
    expect(sameGrid([cell(1, 1, "maths")], [cell(1, 2, "maths")])).toBe(false);
    expect(sameGrid([cell(1, 1, "maths")], [])).toBe(false);
    expect(sameGrid([{ day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: null }] }], [{ day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: "dev", room: null }] }])).toBe(false);
  });
});

describe("the subjects offered for a period", () => {
  const school = [
    { id: "maths", name: "Mathematics", isActive: true },
    { id: "bio", name: "Biology", isActive: true },
    { id: "micro", name: "Microbiology", isActive: true },
    { id: "old", name: "Latin", isActive: false },
  ];
  const choices = subjectChoices({ allotments: VIEW.allotments, school, presets: ["Mathematics", "Hindi", "Science"], placed: new Map([["maths", 3]]) });

  it("are the class's subjects first (as the class lists them), then the school's others, then the usual ones the school does not have", () => {
    expect(choices.map((c) => `${c.kind}:${c.label}`)).toEqual([
      "class:Mathematics",
      "class:Computer Lab",
      "class:Sanskrit",
      "class:French",
      "school:Biology",
      "school:Microbiology",
      "preset:Hindi",
      "preset:Science",
    ]);
  });

  it("carry what the class wants of each: periods placed of periods a week, and the usual teacher", () => {
    expect(choices[0]).toMatchObject({ value: "maths", placed: 3, periodsPerWeek: 4, teacherId: "meena" });
    expect(choices[1]).toMatchObject({ placed: 0, periodsPerWeek: 2 });
    expect(choices.find((c) => c.label === "Biology")).toMatchObject({ value: "bio", periodsPerWeek: 0, teacherId: null });
  });

  it("do not offer an archived subject, nor a usual subject the school has already (whatever its capitals)", () => {
    expect(choices.some((c) => c.label === "Latin")).toBe(false);
    expect(choices.filter((c) => c.label === "Mathematics")).toHaveLength(1);
    const again = subjectChoices({ allotments: [], school: [{ id: "h", name: "hindi", isActive: true }], presets: ["Hindi"], placed: new Map() });
    expect(again.map((c) => c.label)).toEqual(["hindi"]);
  });

  it("a usual subject has the value preset:Name, so picking it can add it to the school first", () => {
    expect(choices.find((c) => c.label === "Hindi")?.value).toBe("preset:Hindi");
  });

  it("matching what is typed: all of them when nothing is typed, those with the letters otherwise, the ones that start with them first", () => {
    expect(matchChoices(choices, "").length).toBe(choices.length);
    expect(matchChoices(choices, "   ").length).toBe(choices.length);
    expect(matchChoices(choices, "bio").map((c) => c.label)).toEqual(["Biology", "Microbiology"]);
    expect(matchChoices(choices, "MATH").map((c) => c.label)).toEqual(["Mathematics"]);
    expect(matchChoices(choices, "zzz")).toEqual([]);
    // A name that starts with the letters comes first, then one with a word that starts with them, then one that only has them inside;
    // inside each group the order is the list's.
    expect(matchChoices(choices, "s").map((c) => c.label)).toEqual(["Sanskrit", "Science", "Mathematics"]);
    expect(matchChoices(choices, "lab").map((c) => c.label)).toEqual(["Computer Lab"]);
    expect(matchChoices(choices, "ology").map((c) => c.label)).toEqual(["Biology", "Microbiology"]);
    // "ab": "Computer Lab" has a word that starts with it only by "lab", so it has "ab" inside; nothing starts with it.
    expect(matchChoices(choices, "ab").map((c) => c.label)).toEqual(["Computer Lab"]);
  });
});

describe("what is wrong with a teacher at a period", () => {
  it("says a teacher does not come that day, or is busy in another class then", () => {
    expect(teacherTrouble(model, "meena", 2, 1)).toBe("Meena Singh does not come on Tuesday");
    expect(teacherTrouble(model, "dev", 1, 2)).toBe("Dev Patel is teaching Class 6 - A (Computer) then");
  });

  it("is nothing for a free teacher, no teacher, or one the grid does not know", () => {
    expect(teacherTrouble(model, "meena", 1, 1)).toBeNull();
    expect(teacherTrouble(model, null, 1, 2)).toBeNull();
    expect(teacherTrouble(model, "nobody", 1, 2)).toBeNull();
  });
});
