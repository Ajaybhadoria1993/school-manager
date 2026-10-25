import { describe, expect, it } from "vitest";
import { classNumber } from "../classNumber";

// The same table as the server's (backend/src/main/students/__tests__/classNumber.test.ts): the screen and the server must agree on which
// classes are Class 1 to 12.
describe("which classes are Class 1 to 12 (the previous school is needed from there)", () => {
  it("reads the number of a class in any of the ways a school writes it", () => {
    const cases: [string, number][] = [
      ["Class 1", 1],
      ["Class 5", 5],
      ["class-10", 10],
      ["Class 12", 12],
      ["5", 5],
      ["V", 5],
      ["V A", 5],
      ["Class VIII", 8],
      ["X", 10],
      ["XI Science", 11],
      ["XII Commerce", 12],
      ["12th Arts", 12],
      ["1st", 1],
      ["2nd Std", 2],
      ["Std 7", 7],
      ["Standard 9", 9],
      ["Grade 3", 3],
      ["Class 5 - A", 5],
      ["  class   6  ", 6],
    ];
    for (const [name, number] of cases) expect(classNumber(name), name).toBe(number);
  });

  it("is nothing for the pre-school classes and for anything that is not a class from 1 to 12", () => {
    for (const name of ["Nursery", "Pre-Nursery", "Pre Nursery", "LKG", "UKG", "L.K.G.", "KG 1", "KG-2", "Play Group", "Playgroup", "Kindergarten", "Pre-Primary", "Class 0", "Class 13", "13", "XIII", "", "   ", "Hostel"]) {
      expect(classNumber(name), name).toBeNull();
    }
  });
});
