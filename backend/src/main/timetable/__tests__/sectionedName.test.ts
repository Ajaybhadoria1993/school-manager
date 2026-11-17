import { describe, expect, it } from "vitest";
import { sectionedName } from "../services/unit";

/** What a class or section is called where children are looked at (2026-11-17). */
describe("sectionedName", () => {
  it("a class with no section or one section is just the class", () => {
    expect(sectionedName("Class 1", null, 0)).toBe("Class 1");
    expect(sectionedName("Class 5", "A", 1)).toBe("Class 5");
    expect(sectionedName("Nursery", "A", 1)).toBe("Nursery");
  });

  it("two sections or more: the letter is joined to a class that ends in a number", () => {
    expect(sectionedName("Class 5", "A", 2)).toBe("Class 5A");
    expect(sectionedName("Class 5", "B", 3)).toBe("Class 5B");
    expect(sectionedName("Class 10", "C", 3)).toBe("Class 10C");
  });

  it("any other name keeps the dash so it still reads well", () => {
    expect(sectionedName("Nursery", "A", 2)).toBe("Nursery - A");
    expect(sectionedName("LKG", "B", 2)).toBe("LKG - B");
    expect(sectionedName("Class 11 Science", "A", 2)).toBe("Class 11 Science - A");
    expect(sectionedName("Class 5", "1", 2)).toBe("Class 5 - 1");
    expect(sectionedName("Class 5", "Rose", 2)).toBe("Class 5 - Rose");
  });
});
