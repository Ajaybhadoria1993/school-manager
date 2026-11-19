import { describe, expect, it } from "vitest";
import { GRID } from "../../test/timetableFixtures";
import type { GridView } from "../../types";
import { describeChosen, describeSlots, slotKey, slotTable } from "../teacherSlots";

/**
 * The days and periods of a class as a teacher is given a subject in it (Assign class, 2026-11-13): each period says whether the subject can be
 * put there, and if not, why (the class has another subject there, the teacher is in another class, the teacher does not come that day).
 */
const lesson = (subjectId: string) => ({ subjectId, teacherId: null, room: null });
const MEENA = { id: "meena", offDays: [] as number[] };

const withCells = (cells: GridView["cells"], busy: GridView["busy"] = []): GridView => ({ ...GRID, cells, busy });

describe("slotTable", () => {
  it("has a row for each day the class has and a column for each period (the most any day has)", () => {
    const table = slotTable(GRID, "english", MEENA);
    expect(table.rows.map((r) => r.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(table.periods).toBe(8);
    expect(table.rows[0].cells).toHaveLength(8);
    expect(table.rows[0].cells[0]).toMatchObject({ day: 1, period: 1, state: "free" });
    expect(table.rows[4].cells[7]).toMatchObject({ day: 5, period: 8, state: "free" });
  });

  it("a day with fewer periods has no cell where it has no period", () => {
    const short: GridView = { ...GRID, days: GRID.days.map((d) => (d.day === 5 ? { ...d, slots: d.slots.filter((s) => s.kind !== "period" || (s.period ?? 0) <= 5) } : d)) };
    const table = slotTable(short, "english", MEENA);
    expect(table.periods).toBe(8);
    expect(table.rows[4].cells.slice(5)).toEqual([null, null, null]);
    expect(table.rows[4].cells[4]).toMatchObject({ period: 5, state: "free" });
  });

  it("a period that has the subject already is 'here'", () => {
    const table = slotTable(withCells([{ day: 2, period: 3, lessons: [lesson("english")] }]), "english", MEENA);
    expect(table.rows[1].cells[2]).toMatchObject({ day: 2, period: 3, state: "here" });
  });

  it("a period with another subject is 'taken', and names it", () => {
    const table = slotTable(withCells([{ day: 1, period: 3, lessons: [lesson("maths")] }]), "english", MEENA);
    expect(table.rows[0].cells[2]).toMatchObject({ state: "taken", note: "Mathematics", subject: "Mathematics" });
  });

  it("a free period has no subject; the subject of a busy one is the one the teacher teaches in the other class", () => {
    const busy = [{ day: 3, period: 2, teacherId: "meena", room: null, where: "Class 6 - B", subjectName: "Science" }];
    const table = slotTable(withCells([], busy), "english", MEENA);
    expect(table.rows[2].cells[1]).toMatchObject({ state: "busy", subject: "Science" });
    expect(table.rows[0].cells[0]).toMatchObject({ state: "free", subject: "" });
  });

  it("a period where the teacher is in another class is 'busy', and says where", () => {
    const busy = [{ day: 3, period: 2, teacherId: "meena", room: null, where: "Class 6 - B", subjectName: "Science" }];
    const table = slotTable(withCells([], busy), "english", MEENA);
    expect(table.rows[2].cells[1]).toMatchObject({ state: "busy", note: "Class 6 - B (Science)" });
    // Somebody else's busy period is nothing to this teacher; a room that is busy is not the teacher's.
    const other = slotTable(withCells([], [{ day: 3, period: 2, teacherId: "dev", room: null, where: "Class 6 - B", subjectName: "Science" }, { day: 4, period: 2, teacherId: null, room: "Lab", where: "Class 6 - B", subjectName: "Science" }]), "english", MEENA);
    expect(other.rows[2].cells[1]?.state).toBe("free");
    expect(other.rows[3].cells[1]?.state).toBe("free");
  });

  it("every period of a day the teacher does not come is 'off'", () => {
    const table = slotTable(GRID, "english", { id: "meena", offDays: [2] });
    expect(table.rows[1].cells.every((c) => c?.state === "off")).toBe(true);
    expect(table.rows[1].cells[0]?.note).toBe("Does not come on Tuesday");
    expect(table.rows[0].cells[0]?.state).toBe("free");
  });

  it("the class's own claim comes first: a taken period is taken even on a day the teacher is off or busy", () => {
    const busy = [{ day: 1, period: 3, teacherId: "meena", room: null, where: "Class 6 - B", subjectName: "Science" }];
    const table = slotTable(withCells([{ day: 1, period: 3, lessons: [lesson("maths")] }], busy), "english", { id: "meena", offDays: [1] });
    expect(table.rows[0].cells[2]?.state).toBe("taken");
  });
});

describe("the time of each period", () => {
  it("every cell has the clock time of its period, and a row says its hours when every day has the same", () => {
    const table = slotTable(GRID, "english", MEENA);
    expect(table.rows[0].cells[0]).toMatchObject({ period: 1, start: "08:30", end: "09:10" });
    expect(table.rows[0].cells[3]).toMatchObject({ period: 4, start: "11:00", end: "11:40" });
    expect(table.times).toEqual(["08:30 – 09:10", "09:10 – 09:50", "09:50 – 10:30", "11:00 – 11:40", "11:40 – 12:20", "12:20 – 13:00", "13:00 – 13:40", "13:40 – 14:20"]);
  });

  it("a period whose days run at different times has no hours of its own (each cell says its own)", () => {
    const shifted: GridView = { ...GRID, days: GRID.days.map((d) => (d.day === 2 ? { ...d, slots: d.slots.map((s) => (s.period === 1 ? { ...s, start: "09:00", end: "09:40" } : s)) } : d)) };
    const table = slotTable(shifted, "english", MEENA);
    expect(table.times[0]).toBeNull();
    expect(table.times[1]).toBe("09:10 – 09:50");
    expect(table.rows[1].cells[0]).toMatchObject({ start: "09:00", end: "09:40" });
  });
});

describe("describeChosen", () => {
  it("says each chosen period with its number, its hours, its days and that it repeats every week", () => {
    const table = slotTable(GRID, "english", MEENA);
    expect(describeChosen(["3:3", "1:3", "2:3", "5:5"], table)).toEqual(["Period 3 · 09:50 – 10:30 · Mon, Tue, Wed (every week)", "Period 5 · 11:40 – 12:20 · Fri (every week)"]);
    expect(describeChosen([], table)).toEqual([]);
  });

  it("with the dates of the seven days offered the days carry them, in the order of the dates, and it says it then repeats every week", () => {
    const table = slotTable(GRID, "english", MEENA);
    // Offered from Friday 13 November: Friday comes before the Monday after it.
    const dates = new Map([[5, new Date(2026, 10, 13)], [1, new Date(2026, 10, 16)], [2, new Date(2026, 10, 17)]]);
    expect(describeChosen(["1:3", "2:3"], table, dates)).toEqual(["Period 3 · 09:50 – 10:30 · Mon 16 Nov, Tue 17 Nov, then every week"]);
    expect(describeChosen(["1:3", "5:3"], table, dates)).toEqual(["Period 3 · 09:50 – 10:30 · Fri 13 Nov, Mon 16 Nov, then every week"]);
  });

  it("leaves the time out when the days of that period are at different times", () => {
    const shifted: GridView = { ...GRID, days: GRID.days.map((d) => (d.day === 2 ? { ...d, slots: d.slots.map((s) => (s.period === 1 ? { ...s, start: "09:00", end: "09:40" } : s)) } : d)) };
    expect(describeChosen(["1:1", "2:1"], slotTable(shifted, "english", MEENA))).toEqual(["Period 1 · Mon, Tue (every week)"]);
  });
});

describe("slotKey and describeSlots", () => {
  it("a key is the day and the period", () => {
    expect(slotKey(2, 5)).toBe("2:5");
  });

  it("says the chosen periods by period, with the days, in order", () => {
    const table = slotTable(GRID, "english", MEENA);
    expect(describeSlots(["3:3", "1:3", "2:3", "5:5"].map((k) => k), table)).toBe("period 3: Mon, Tue, Wed; period 5: Fri");
    expect(describeSlots(["1:2"], table)).toBe("period 2: Mon");
    expect(describeSlots([], table)).toBe("");
  });
});
