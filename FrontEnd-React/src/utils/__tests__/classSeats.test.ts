import { describe, expect, it } from "vitest";
import { MAX_CLASS_CAPACITY } from "../../constants/academics";
import type { ClassItem } from "../../types";
import { classSeatsProblem, seatsLabel, sectionSeats, sectionsOverClass } from "../academics";

const klass = (capacity: number | null, sections: (number | null)[] = []): ClassItem => ({
  id: "c1",
  name: "Class 5",
  order: 1,
  departmentId: null,
  capacity,
  sections: sections.map((seats, i) => ({ id: `s${i}`, classId: "c1", name: String.fromCharCode(65 + i), capacity: seats, room: null })),
});

describe("the seats of a class", () => {
  it("must be a whole number from 1 up to the most the server allows, and must be given", () => {
    expect(classSeatsProblem("")).toBe("Enter the seats of the class.");
    expect(classSeatsProblem("   ")).toBe("Enter the seats of the class.");
    for (const text of ["abc", "12.5", "0", "-3", "1e2", String(MAX_CLASS_CAPACITY + 1)]) {
      expect(classSeatsProblem(text)).toBe(`Seats must be a whole number from 1 to ${MAX_CLASS_CAPACITY}.`);
    }
    expect(classSeatsProblem("1")).toBeNull();
    expect(classSeatsProblem(" 120 ")).toBeNull();
    expect(classSeatsProblem(String(MAX_CLASS_CAPACITY))).toBeNull();
  });

  it("is said as '120 seats', '1 seat', or nothing when it is not set", () => {
    expect(seatsLabel(klass(120))).toBe("120 seats");
    expect(seatsLabel(klass(1))).toBe("1 seat");
    expect(seatsLabel(klass(null))).toBeNull();
  });

  it("is split by the sections, which hold what they hold between them (a section with no seats holds none)", () => {
    expect(sectionSeats(klass(100))).toBe(0);
    expect(sectionSeats(klass(100, [40, 35, null]))).toBe(75);
  });

  it("is overrun when the sections would hold more than the class has; not when it has no seats set or they fit", () => {
    expect(sectionsOverClass(100, 120)).toBe(true);
    expect(sectionsOverClass(100, 100)).toBe(false);
    expect(sectionsOverClass(null, 500)).toBe(false);
    expect(sectionsOverClass(100, 0)).toBe(false);
  });
});
