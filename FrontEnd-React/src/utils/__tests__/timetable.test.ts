import { describe, expect, it } from "vitest";
import type { GridCell, GridView } from "../../types";
import { applyMotherTeacher, buildModel, changeLesson, choiceOf, clearCell, dayEnds, isPrePrimaryName, halfOf, placeAcrossWeek, placeHalfDay, placeWholeDay, teacherChoices, teacherOnRange, localProblems, matchChoices, missingPeriods, periodsInARow, placeSubject, placedCounts, sameGrid, subjectChoices, teacherOf, teacherTrouble } from "../timetable";

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

describe("when a class's day ends", () => {
  it("is the end of the last period that has a lesson, day by day, as the grid is now", () => {
    const ends = dayEnds(VIEW, [cell(1, 1, "maths"), cell(1, 4, "maths"), cell(2, 2, "sanskrit")]);
    expect(ends.get(1)).toBe("11:40");
    expect(ends.get(2)).toBe("09:50");
  });

  it("is nothing for a day with no lesson, and a lesson in a period the day does not have is not counted", () => {
    const ends = dayEnds(VIEW, [cell(1, 9, "maths")]);
    expect(ends.get(1)).toBeNull();
    expect(ends.get(2)).toBeNull();
  });

  it("follows a change that is not saved yet (the lessons given, not the stored ones)", () => {
    expect(dayEnds(VIEW, [cell(1, 5, "maths")]).get(1)).toBe("12:20");
    expect(dayEnds(VIEW, []).get(1)).toBeNull();
  });
});

describe("a subject put in an empty period goes on every day", () => {
  const free = (id: string, name: string, over: object = {}) => ({ subjectId: id, subjectName: name, subjectCode: null, category: "academic", periodsPerWeek: 0, blockSize: 1, teacherId: null, group: null, ...over });
  const WEEK_VIEW = {
    ...VIEW,
    days: [day(1, "Monday"), day(2, "Tuesday"), day(3, "Wednesday")],
    allotments: [...VIEW.allotments, free("art", "Art"), free("hindi", "Hindi"), free("games", "Games", { teacherId: "dev" }), free("block", "Lab", { blockSize: 2 })],
  } as unknown as GridView;
  const WEEK = buildModel(WEEK_VIEW);
  const place = (cells: GridCell[], subject: string, d: number, p: number, m = WEEK) => placeAcrossWeek(m, cells, subject, d, p);

  it("fills that period of every day, whichever day it was picked on", () => {
    const { cells, placed, note } = place([], "art", 2, 1);
    expect(where(cells)).toEqual(["1.1:art", "2.1:art", "3.1:art"]);
    expect({ placed, note }).toEqual({ placed: 3, note: null });
  });

  it("a day that already has a lesson in that period keeps it", () => {
    expect(where(place([cell(2, 1, "hindi")], "art", 1, 1).cells)).toEqual(["1.1:art", "2.1:hindi", "3.1:art"]);
  });

  it("changing a period that has a lesson changes only that period", () => {
    const week = [cell(1, 1, "art"), cell(2, 1, "art"), cell(3, 1, "art")];
    expect(where(place(week, "hindi", 2, 1).cells)).toEqual(["1.1:art", "2.1:hindi", "3.1:art"]);
  });

  it("a day its usual teacher does not come stays empty, and says so", () => {
    const { cells, note } = place([], "maths", 1, 1);
    expect(where(cells)).toEqual(["1.1:maths", "3.1:maths"]);
    expect(note).toBe("Mathematics is not on Tuesday: its teacher cannot take that period.");
  });

  it("the day it was picked on always gets it (that period turns red if the teacher cannot, as before)", () => {
    const { cells, note } = place([], "maths", 2, 1);
    expect(where(cells)).toEqual(["1.1:maths", "2.1:maths", "3.1:maths"]);
    expect(note).toBeNull();
  });

  it("a day its teacher is busy in another class then stays empty; several such days are named", () => {
    expect(where(place([], "games", 2, 2).cells)).toEqual(["2.2:games", "3.2:games"]);
    const busy = buildModel({ ...WEEK_VIEW, busy: [1, 3].map((d) => ({ day: d, period: 2, teacherId: "dev", room: null, where: "Class 6 - A", subjectName: "Computer" })) } as unknown as GridView);
    expect(place([], "games", 2, 2, busy).note).toBe("Games is not on Monday, Wednesday: its teacher cannot take that period.");
  });

  it("a day that does not have that period is passed over without a word", () => {
    const short = { ...day(2, "Tuesday"), slots: day(2, "Tuesday").slots.slice(0, 3) };
    const m = buildModel({ ...WEEK_VIEW, days: [day(1, "Monday"), short, day(3, "Wednesday")] } as unknown as GridView);
    const { cells, note } = place([], "art", 1, 5, m);
    expect(where(cells)).toEqual(["1.5:art", "3.5:art"]);
    expect(note).toBeNull();
  });

  it("double periods take their two periods on every day, and a day with only one of them free is left alone", () => {
    expect(where(place([], "block", 1, 1).cells)).toEqual(["1.1:block", "1.2:block", "2.1:block", "2.2:block", "3.1:block", "3.2:block"]);
    expect(where(place([cell(2, 2, "hindi")], "block", 1, 1).cells)).toEqual(["1.1:block", "1.2:block", "2.2:hindi", "3.1:block", "3.2:block"]);
  });

  it("the subjects of a choice go together on every day; a day one of their teachers cannot is left out", () => {
    const { cells, note } = place([], "sanskrit", 1, 1);
    expect(where(cells)).toEqual(["1.1:sanskrit+french", "3.1:sanskrit+french"]);
    expect(note).toBe("Sanskrit is not on Tuesday: its teacher cannot take that period.");
  });

  it("a subject the class does not have changes nothing", () => {
    expect(place([], "nothing", 1, 1)).toEqual({ cells: [], placed: 0, note: null });
  });
});

describe("the teachers a period can be given", () => {
  const free = { subjectId: "art", subjectName: "Art", subjectCode: null, category: "activity", periodsPerWeek: 0, blockSize: 1, teacherId: null, group: null };
  const VIEW2 = { ...VIEW, allotments: [...VIEW.allotments, free] } as unknown as GridView;
  const m = buildModel(VIEW2);
  const rows = (subject: string, d: number, p: number, current: string | null = null, mm = m) => teacherChoices(mm, subject, d, p, current);
  const brief = (list: ReturnType<typeof teacherChoices>) => list.map((c) => [c.value, c.label, c.disabled]);

  it("a subject with no usual teacher: No teacher first (picked), then the teachers still teaching here", () => {
    const list = rows("art", 1, 1);
    expect(brief(list)).toEqual([[null, "No teacher", false], ["meena", "Meena Singh", false], ["dev", "Dev Patel", false]]);
    expect(list[0].selected).toBe(true);
  });

  it("a subject with a usual teacher: they come first and are not repeated", () => {
    const list = rows("maths", 1, 1);
    expect(brief(list)).toEqual([[null, "Meena Singh", false], ["dev", "Dev Patel", false]]);
    expect(list[0].note).toBe("Usual teacher");
  });

  it("the teachers of the subject come before the others", () => {
    const mm = buildModel({ ...VIEW2, teachers: VIEW2.teachers.map((t) => (t.id === "dev" ? { ...t, subjectIds: ["art"] } : t)) } as unknown as GridView);
    expect(rows("art", 1, 1, null, mm).map((c) => c.value)).toEqual([null, "dev", "meena"]);
  });

  it("each teacher says whether they teach the subject: the usual teacher, the mother teacher, the one the period has and those who teach it do; the rest do not", () => {
    const mm = buildModel({ ...VIEW2, teachers: VIEW2.teachers.map((t) => (t.id === "dev" ? { ...t, subjectIds: ["art"] } : t)) } as unknown as GridView);
    const art = rows("art", 1, 1, null, mm);
    expect(art.map((c) => [c.value, c.teaches])).toEqual([[null, true], ["dev", true], ["meena", false]]);
    // Whoever the period has now is always among those shown, and so is the mother teacher.
    expect(rows("art", 1, 1, "meena", mm).find((c) => c.value === "meena")!.teaches).toBe(true);
    // The subject's usual teacher heads the list whether or not they have it among their subjects.
    expect(rows("maths", 1, 1)[0]).toMatchObject({ value: null, teaches: true });
  });

  it("one who cannot take the period is shown with why and cannot be picked", () => {
    const off = rows("art", 2, 1).find((c) => c.value === "meena")!;
    expect(off).toMatchObject({ disabled: true, bad: true, note: "Meena Singh does not come on Tuesday" });
    expect(rows("art", 1, 2).find((c) => c.value === "dev")).toMatchObject({ disabled: true, bad: true, note: "Dev Patel is teaching Class 6 - A (Computer) then" });
  });

  it("the usual teacher, and the one the period has now, stay selectable even when they cannot (the red edge says so)", () => {
    expect(rows("maths", 2, 1)[0]).toMatchObject({ value: null, disabled: false, bad: true, note: "Meena Singh does not come on Tuesday" });
    expect(rows("art", 1, 2, "dev").find((c) => c.value === "dev")).toMatchObject({ selected: true, disabled: false, bad: true });
  });

  it("naming the usual teacher on the lesson is the same as following them", () => {
    expect(rows("maths", 1, 1, "meena")[0].selected).toBe(true);
  });

  it("nothing when the school has no teacher", () => {
    expect(rows("art", 1, 1, null, buildModel({ ...VIEW2, teachers: [] } as unknown as GridView))).toEqual([]);
  });
});

describe("Pre-Primary (2026-11-10): the mother teacher and a whole day of one subject", () => {
  const free = (id: string, name: string, over: object = {}) => ({ subjectId: id, subjectName: name, subjectCode: null, category: "academic", periodsPerWeek: 0, blockSize: 1, teacherId: null, group: null, ...over });
  const PP_VIEW = {
    ...VIEW,
    days: [day(1, "Monday"), day(2, "Tuesday"), day(3, "Wednesday")],
    allotments: [...VIEW.allotments, free("art", "Art"), free("rhymes", "Rhymes")],
  } as unknown as GridView;
  const PP = buildModel(PP_VIEW);
  const who = (cells: GridCell[]) => cells.map((c) => `${c.day}.${c.period}:${c.lessons.map((l) => `${l.subjectId}/${l.teacherId ?? "-"}`).join("+")}`);

  it("knows a Pre-Primary department by its name, however it is written", () => {
    for (const name of ["Pre-Primary", "pre primary", "PrePrimary", "  Pre-primary ", "PRE PRIMARY"]) expect(isPrePrimaryName(name), name).toBe(true);
    for (const name of ["Primary", "Middle", "Pre-Nursery", ""]) expect(isPrePrimaryName(name), name).toBe(false);
  });

  it("a subject put in with a mother teacher has her on every day it goes on; a day she does not come stays empty", () => {
    const { cells, note } = placeAcrossWeek(PP, [], "art", 1, 1, "meena");
    expect(who(cells)).toEqual(["1.1:art/meena", "3.1:art/meena"]);
    expect(note).toBe("Art is not on Tuesday: its teacher cannot take that period.");
  });

  it("a subject with its own usual teacher keeps them, mother teacher or not", () => {
    expect(who(placeAcrossWeek(PP, [], "maths", 1, 1, "dev").cells)).toEqual(["1.1:maths/-", "3.1:maths/-"]);
  });

  it("a whole day: the subject goes in every period of that day, in place of what was there; the other days are left as they are", () => {
    const before = [cell(1, 2, "maths"), cell(2, 1, "maths")];
    const { cells, placed } = placeWholeDay(PP, before, "rhymes", 1, "meena");
    expect(who(cells)).toEqual(["1.1:rhymes/meena", "1.2:rhymes/meena", "1.3:rhymes/meena", "1.4:rhymes/meena", "1.5:rhymes/meena", "2.1:maths/-"]);
    expect(placed).toBe(5);
  });

  it("a whole day without a mother teacher leaves the teacher to the subject; a choice puts all its subjects; an unknown subject changes nothing", () => {
    expect(who(placeWholeDay(PP, [], "art", 3, null).cells)[0]).toBe("3.1:art/-");
    expect(who(placeWholeDay(PP, [], "sanskrit", 3, null).cells)[0]).toBe("3.1:sanskrit/-+french/-");
    expect(placeWholeDay(PP, [cell(1, 1, "maths")], "nothing", 1, "meena")).toEqual({ cells: [cell(1, 1, "maths")], placed: 0, note: null });
  });

  it("choosing a mother teacher puts her on the periods with no teacher, and in place of the one chosen before; another teacher on a period stays", () => {
    const cells: GridCell[] = [
      cell(1, 1, "art"),
      { day: 1, period: 2, lessons: [{ subjectId: "art", teacherId: "dev", room: null }] },
      { day: 1, period: 3, lessons: [{ subjectId: "rhymes", teacherId: "anil", room: "Hall" }] },
      cell(1, 4, "maths"),
    ];
    expect(who(applyMotherTeacher(PP, cells, "meena", "dev"))).toEqual(["1.1:art/meena", "1.2:art/meena", "1.3:rhymes/anil", "1.4:maths/-"]);
    // No mother teacher any more: the periods that had her have no teacher.
    expect(who(applyMotherTeacher(PP, cells, null, "dev"))).toEqual(["1.1:art/-", "1.2:art/-", "1.3:rhymes/anil", "1.4:maths/-"]);
    // The room stays with its lesson.
    expect(applyMotherTeacher(PP, cells, "meena", null)[2].lessons[0].room).toBe("Hall");
  });

  it("the mother teacher is named in the box of a period, right after the first row", () => {
    const list = teacherChoices(PP, "art", 1, 1, null, "dev");
    expect(list.map((c) => c.value)).toEqual([null, "dev", "meena"]);
    expect(list[1].note).toBe("Mother teacher");
    // She is shown with the teachers of the subject whether or not it is one of her subjects (it is her class); the others are not.
    expect(list.map((c) => c.teaches)).toEqual([true, true, false]);
  });
});

describe("a Pre-Primary day in halves (before the lunch, after it)", () => {
  const free = (id: string, name: string, over: object = {}) => ({ subjectId: id, subjectName: name, subjectCode: null, category: "academic", periodsPerWeek: 0, blockSize: 1, teacherId: null, group: null, ...over });
  const HALF_VIEW = {
    ...VIEW,
    // Monday and Tuesday: periods 1-3, the lunch, periods 4-5. Wednesday: four periods and no lunch. Thursday: five periods and no lunch.
    days: [
      day(1, "Monday"),
      day(2, "Tuesday"),
      { day: 3, name: "Wednesday", slots: [1, 2, 3, 4].map((p) => ({ kind: "period" as const, label: `Period ${p}`, start: "08:00", end: "08:40", period: p })) },
      { day: 4, name: "Thursday", slots: [1, 2, 3, 4, 5].map((p) => ({ kind: "period" as const, label: `Period ${p}`, start: "08:00", end: "08:40", period: p })) },
    ],
    allotments: [...VIEW.allotments, free("art", "Art"), free("rhymes", "Rhymes")],
  } as unknown as GridView;
  const HALF = buildModel(HALF_VIEW);
  const who = (cells: GridCell[]) => cells.map((c) => `${c.day}.${c.period}:${c.lessons.map((l) => `${l.subjectId}/${l.teacherId ?? "-"}`).join("+")}`);

  it("knows the half a period is in: the periods on its side of the lunch", () => {
    expect(halfOf(HALF, 1, 2)).toEqual([1, 2, 3]);
    expect(halfOf(HALF, 1, 4)).toEqual([4, 5]);
    expect(halfOf(HALF, 1, 9)).toEqual([]);
    expect(halfOf(HALF, 7, 1)).toEqual([]);
  });

  it("a day without a lunch is cut in the middle: the bigger half first", () => {
    expect(halfOf(HALF, 3, 1)).toEqual([1, 2]);
    expect(halfOf(HALF, 3, 4)).toEqual([3, 4]);
    expect(halfOf(HALF, 4, 3)).toEqual([1, 2, 3]);
    expect(halfOf(HALF, 4, 4)).toEqual([4, 5]);
  });

  it("puts the subject in every period of that half, in place of what was there; the other half and the other days stay", () => {
    const before = [cell(1, 2, "maths"), cell(1, 4, "maths"), cell(2, 1, "maths")];
    const { cells, placed } = placeHalfDay(HALF, before, "rhymes", 1, 2, "meena");
    expect(who(cells)).toEqual(["1.1:rhymes/meena", "1.2:rhymes/meena", "1.3:rhymes/meena", "1.4:maths/-", "2.1:maths/-"]);
    expect(placed).toBe(3);
  });

  it("two subjects in a day: one for each half", () => {
    const first = placeHalfDay(HALF, [], "rhymes", 1, 1, null).cells;
    const both = placeHalfDay(HALF, first, "art", 1, 5, null).cells;
    expect(who(both)).toEqual(["1.1:rhymes/-", "1.2:rhymes/-", "1.3:rhymes/-", "1.4:art/-", "1.5:art/-"]);
  });

  it("the mother teacher goes on a subject with no usual teacher; a choice puts all its subjects; an unknown subject changes nothing", () => {
    expect(who(placeHalfDay(HALF, [], "art", 1, 1, "meena").cells)[0]).toBe("1.1:art/meena");
    expect(who(placeHalfDay(HALF, [], "maths", 1, 1, "dev").cells)[0]).toBe("1.1:maths/-");
    expect(who(placeHalfDay(HALF, [], "sanskrit", 1, 1, null).cells)[0]).toBe("1.1:sanskrit/-+french/-");
    expect(placeHalfDay(HALF, [cell(1, 1, "maths")], "nothing", 1, 1, "meena")).toEqual({ cells: [cell(1, 1, "maths")], placed: 0, note: null });
    expect(placeHalfDay(HALF, [], "art", 9, 1, null)).toEqual({ cells: [], placed: 0, note: null });
  });
});

describe("a teacher chosen for a subject in a period, a half or a day", () => {
  const lessonOf = (d: number, p: number, subjectId: string, teacherId: string | null = null): GridCell => ({ day: d, period: p, lessons: [{ subjectId, teacherId, room: null }] });
  const free = (id: string, name: string) => ({ subjectId: id, subjectName: name, subjectCode: null, category: "academic", periodsPerWeek: 0, blockSize: 1, teacherId: null, group: null });
  const M = buildModel({ ...VIEW, allotments: [...VIEW.allotments, free("art", "Art"), free("rhymes", "Rhymes")] } as unknown as GridView);
  const grid = [lessonOf(1, 1, "art"), lessonOf(1, 2, "art"), lessonOf(1, 3, "rhymes"), lessonOf(1, 4, "art"), lessonOf(1, 5, "art"), lessonOf(2, 1, "art")];
  const teachers = (cells: GridCell[]) => cells.map((c) => `${c.day}.${c.period}:${c.lessons[0].teacherId ?? "-"}`);

  it("for one period: only that period gets the teacher", () => {
    expect(teachers(teacherOnRange(M, grid, 1, 1, "art", "dev", "period"))).toEqual(["1.1:dev", "1.2:-", "1.3:-", "1.4:-", "1.5:-", "2.1:-"]);
  });

  it("for a half: that subject's periods on that side of the lunch, that day only", () => {
    expect(teachers(teacherOnRange(M, grid, 1, 1, "art", "dev", "half"))).toEqual(["1.1:dev", "1.2:dev", "1.3:-", "1.4:-", "1.5:-", "2.1:-"]);
    expect(teachers(teacherOnRange(M, grid, 1, 5, "art", "dev", "half"))).toEqual(["1.1:-", "1.2:-", "1.3:-", "1.4:dev", "1.5:dev", "2.1:-"]);
  });

  it("for a whole day: every period of that subject on that day, no other day", () => {
    expect(teachers(teacherOnRange(M, grid, 1, 1, "art", "dev", "day"))).toEqual(["1.1:dev", "1.2:dev", "1.3:-", "1.4:dev", "1.5:dev", "2.1:-"]);
  });

  it("takes the teacher off again with null", () => {
    const given = teacherOnRange(M, grid, 1, 1, "art", "dev", "day");
    expect(teachers(teacherOnRange(M, given, 1, 1, "art", null, "day"))).toEqual(teachers(grid));
  });
});
