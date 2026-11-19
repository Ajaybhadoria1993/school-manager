import { describe, expect, it } from "vitest";
import { GRID } from "../../test/timetableFixtures";
import type { GridView } from "../../types";
import { teachersOfClass } from "../classTeachers";

/** Who teaches what in a class, read from its week (Assign class shows it beside the form, 2026-11-13). */
const withTeachers = (over: Partial<GridView>): GridView => ({ ...GRID, ...over });

describe("teachersOfClass", () => {
  it("lists each teacher with the subjects the class's list gives them, and the subjects nobody teaches yet", () => {
    // GRID: Mathematics (Meena), English (nobody).
    const who = teachersOfClass(GRID);
    expect(who.teachers).toEqual([{ id: "meena", name: "Meena Singh", subjects: ["Mathematics"], head: false }]);
    expect(who.withoutTeacher).toEqual(["English"]);
  });

  it("one teacher with several subjects is one line, in the order of the list", () => {
    const view = withTeachers({
      allotments: [
        ...GRID.allotments.map((a) => (a.subjectId === "english" ? { ...a, teacherId: "meena" } : a)),
        { subjectId: "hindi", subjectName: "Hindi", subjectCode: null, category: "academic", periodsPerWeek: 4, blockSize: 1, teacherId: "dev", group: null },
      ],
    });
    const who = teachersOfClass(view);
    expect(who.teachers.map((t) => [t.name, t.subjects])).toEqual([
      ["Dev Patel", ["Hindi"]],
      ["Meena Singh", ["Mathematics", "English"]],
    ]);
    expect(who.withoutTeacher).toEqual([]);
  });

  it("the class teacher comes first and is marked, even with no subject of their own", () => {
    const view = withTeachers({ classTeacher: { id: "dev", name: "Dev Patel" } });
    const who = teachersOfClass(view);
    expect(who.teachers[0]).toEqual({ id: "dev", name: "Dev Patel", subjects: [], head: true });
    expect(who.teachers[1]).toMatchObject({ id: "meena", head: false });
  });

  it("a teacher a lesson names on purpose (a cover) is listed with that lesson's subject", () => {
    const view = withTeachers({ cells: [{ day: 1, period: 2, lessons: [{ subjectId: "english", teacherId: "dev", room: null }] }] });
    const who = teachersOfClass(view);
    expect(who.teachers.find((t) => t.id === "dev")).toMatchObject({ subjects: ["English"] });
  });

  it("a class with no subjects and no class teacher has nobody", () => {
    expect(teachersOfClass(withTeachers({ allotments: [] }))).toEqual({ teachers: [], withoutTeacher: [] });
  });
});
