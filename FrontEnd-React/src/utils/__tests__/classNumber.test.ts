import { describe, expect, it } from "vitest";
import { classNumber, needsStream, streamOf } from "../classNumber";

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

// The same rules as the server's (backend/src/main/students/__tests__/streams.test.ts).
describe("which classes are taught in streams", () => {
  it("Class 11 and 12 without a stream need one; with one they are a stream's class; no other class does", () => {
    for (const name of ["Class 11", "Class 12", "XI", "XII", "11th", "Std 12", "Grade 11 "]) expect(needsStream(name), name).toBe(true);
    for (const name of ["Class 11 Science", "Class 12 Commerce", "XI Arts", "12th Maths", "Class 11 - Science", "Class 11 Science A"]) expect(needsStream(name), name).toBe(false);
    for (const name of ["Class 10", "Class 9", "Class 1", "Nursery", "LKG", "Hobby Club"]) expect(needsStream(name), name).toBe(false);
  });

  it("the stream is what follows the number, as the school wrote it; a single letter is a section", () => {
    expect(streamOf("Class 11 Science")).toBe("Science");
    expect(streamOf("XII Commerce")).toBe("Commerce");
    expect(streamOf("Class 12 - Arts & Humanities")).toBe("Arts & Humanities");
    expect(streamOf("Class 11")).toBeNull();
    expect(streamOf("Class 11 A")).toBeNull();
    expect(streamOf("Class 5 A")).toBeNull();
  });
});
