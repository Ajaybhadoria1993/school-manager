import { describe, expect, it } from "vitest";
import { attendanceUnits, pickedUnit } from "../attendance";
import { sectionedName } from "../academics";

/** What a class or section is called where children are looked at (2026-11-17): the section is said only when the class has two or more. */

const section = (id: string, name: string) => ({ id, classId: "x", name, capacity: 30, room: null });

describe("sectionedName", () => {
  it("a class with no section or one section is just the class", () => {
    expect(sectionedName("Class 1", null, 0)).toBe("Class 1");
    expect(sectionedName("Class 5", "A", 1)).toBe("Class 5");
    expect(sectionedName("Nursery", "A", 1)).toBe("Nursery");
  });

  it("two sections or more: the letter is joined to a class that ends in a number (Class 5A)", () => {
    expect(sectionedName("Class 5", "A", 2)).toBe("Class 5A");
    expect(sectionedName("Class 10", "C", 3)).toBe("Class 10C");
  });

  it("any other name keeps the dash so it still reads well", () => {
    expect(sectionedName("Nursery", "A", 2)).toBe("Nursery - A");
    expect(sectionedName("Class 11 Science", "A", 2)).toBe("Class 11 Science - A");
    expect(sectionedName("Class 5", "1", 2)).toBe("Class 5 - 1");
    expect(sectionedName("Class 5", "Rose", 2)).toBe("Class 5 - Rose");
  });
});

describe("the chips of the attendance page", () => {
  const classes = [
    { id: "c1", name: "Class 1", sections: [] },
    { id: "c5", name: "Class 5", sections: [section("c5-B", "B"), section("c5-A", "A")] },
    { id: "c6", name: "Class 6", sections: [section("c6-A", "A")] },
    { id: "nur", name: "Nursery", sections: [section("n-A", "A"), section("n-B", "B")] },
  ];

  it("a class with no section or one is one chip named as the class; a class with more is one chip a section, in order", () => {
    expect(attendanceUnits(classes).map((u) => u.label)).toEqual(["Class 1", "Class 5A", "Class 5B", "Class 6", "Nursery - A", "Nursery - B"]);
  });

  it("each chip knows its class and section (none for a class without sections; the only section for a class with one)", () => {
    const units = attendanceUnits(classes);
    expect(units.find((u) => u.label === "Class 1")).toMatchObject({ classId: "c1", sectionId: null });
    expect(units.find((u) => u.label === "Class 6")).toMatchObject({ classId: "c6", sectionId: "c6-A" });
    expect(units.find((u) => u.label === "Class 5B")).toMatchObject({ classId: "c5", sectionId: "c5-B" });
  });

  it("the address picks a chip: its class and section; a class alone opens its first chip; an unknown class the first of all", () => {
    const units = attendanceUnits(classes);
    expect(pickedUnit(units, "c5", "c5-B")?.label).toBe("Class 5B");
    expect(pickedUnit(units, "c5", null)?.label).toBe("Class 5A");
    expect(pickedUnit(units, "c6", "")?.label).toBe("Class 6");
    expect(pickedUnit(units, "gone", null)?.label).toBe("Class 1");
    expect(pickedUnit([], "c5", null)).toBeUndefined();
  });
});
