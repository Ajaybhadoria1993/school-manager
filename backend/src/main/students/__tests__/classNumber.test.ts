import { describe, expect, it } from "vitest";
import { classAfter, classNumber } from "../classNumber";

describe("which classes are Class 1 to 12 (a school's own names: the previous school is needed from there)", () => {
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

describe("classAfter: where a student moves up to", () => {
  const list = (...names: string[]) => names.map((className) => ({ className }));
  const after = (names: string[], name: string) => classAfter(list(...names), names.indexOf(name))?.className;

  it("is the next class in teaching order", () => {
    const names = ["Nursery", "LKG", "UKG", "Class 1", "Class 2"];
    expect(after(names, "Nursery")).toBe("LKG");
    expect(after(names, "UKG")).toBe("Class 1");
    expect(after(names, "Class 1")).toBe("Class 2");
    expect(after(names, "Class 2")).toBeUndefined();
  });

  it("a stream stays in its stream, and the last year has nowhere to go", () => {
    const names = ["Class 10", "Class 11 Science", "Class 11 Commerce", "Class 12 Science", "Class 12 Commerce"];
    expect(after(names, "Class 11 Science")).toBe("Class 12 Science");
    expect(after(names, "Class 11 Commerce")).toBe("Class 12 Commerce");
    expect(after(names, "Class 12 Science")).toBeUndefined();
    expect(after(names, "Class 12 Commerce")).toBeUndefined();
  });

  it("Class 10 goes to the first stream of Class 11, which the school can change on the list", () => {
    expect(after(["Class 10", "Class 11 Science", "Class 11 Arts", "Class 12 Science", "Class 12 Arts"], "Class 10")).toBe("Class 11 Science");
  });

  it("a stream with no class the next year goes to the first class of that year", () => {
    expect(after(["Class 11 Science", "Class 11 Arts", "Class 12 Science"], "Class 11 Arts")).toBe("Class 12 Science");
  });

  it("is nothing for a class that is not on the list", () => {
    expect(classAfter(list("Class 1"), -1)).toBeUndefined();
  });
});
