import { describe, expect, it } from "vitest";
import type { AcademicStructure, StudentCapacity } from "../../types";
import { fullPlaceOf } from "../placeSeats";

const section = (id: string, classId: string, name: string, capacity: number | null = 30) => ({ id, classId, name, capacity, room: null });
const STRUCTURE = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: null, capacity: 40, sections: [] },
    { id: "c2", name: "Class 2", order: 2, departmentId: null, capacity: null, sections: [] },
    { id: "c6", name: "Class 6", order: 6, departmentId: null, capacity: 100, sections: [section("c6-A", "c6", "A"), section("c6-B", "c6", "B", null)] },
  ],
  totals: { departments: 0, classes: 3, sections: 2, seats: 130 },
} as AcademicStructure;
const load = (sectionId: string, classId: string, capacity: number | null, enrolled: number) => ({ sectionId, classId, capacity, enrolled, seatsLeft: capacity === null ? null : Math.max(0, capacity - enrolled), nextRollNumber: enrolled + 1 });
const CAPACITY = {
  academicYear: { id: "y1", name: "2026-2027" },
  sections: [load("c6-A", "c6", 30, 30), load("c6-B", "c6", null, 50)],
  classes: [
    { classId: "c1", enrolled: 40, nextRollNumber: 41 },
    { classId: "c2", enrolled: 90, nextRollNumber: 91 },
  ],
  totals: { students: 0, seats: 0, seatsLeft: 0, fullSections: 1 },
} as StudentCapacity;

describe("the place the admission form has picked, when it has no seat left", () => {
  it("a section whose students fill its seats", () => {
    expect(fullPlaceOf({ classId: "c6", sectionId: "c6-A" }, STRUCTURE, CAPACITY)).toEqual({ classId: "c6", sectionId: "c6-A", enrolled: 30, capacity: 30 });
  });

  it("a class with no sections whose students fill the class's own seats", () => {
    expect(fullPlaceOf({ classId: "c1", sectionId: "" }, STRUCTURE, CAPACITY)).toEqual({ classId: "c1", sectionId: null, enrolled: 40, capacity: 40 });
  });

  it("room left is not full, and neither is a place with no limit", () => {
    const roomy = { ...CAPACITY, sections: [load("c6-A", "c6", 30, 29), load("c6-B", "c6", null, 50)], classes: [{ classId: "c1", enrolled: 39, nextRollNumber: 40 }] } as StudentCapacity;
    expect(fullPlaceOf({ classId: "c6", sectionId: "c6-A" }, STRUCTURE, roomy)).toBeNull();
    expect(fullPlaceOf({ classId: "c1", sectionId: "" }, STRUCTURE, roomy)).toBeNull();
    // A section with no limit (50 students, no seats set) and a class with no seats set.
    expect(fullPlaceOf({ classId: "c6", sectionId: "c6-B" }, STRUCTURE, CAPACITY)).toBeNull();
    expect(fullPlaceOf({ classId: "c2", sectionId: "" }, STRUCTURE, CAPACITY)).toBeNull();
  });

  it("a class with sections and none picked, a class or section the school does not have, and no seat counts yet are never full", () => {
    expect(fullPlaceOf({ classId: "c6", sectionId: "" }, STRUCTURE, CAPACITY)).toBeNull();
    expect(fullPlaceOf({ classId: "c6", sectionId: "nope" }, STRUCTURE, CAPACITY)).toBeNull();
    expect(fullPlaceOf({ classId: "gone", sectionId: "" }, STRUCTURE, CAPACITY)).toBeNull();
    expect(fullPlaceOf({ classId: "c6", sectionId: "c6-A" }, STRUCTURE, undefined)).toBeNull();
    // A class with no sections and no count: nobody is in it yet.
    expect(fullPlaceOf({ classId: "c1", sectionId: "" }, STRUCTURE, { ...CAPACITY, classes: [] })).toBeNull();
  });
});
