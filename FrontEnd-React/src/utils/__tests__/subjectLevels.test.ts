import { describe, expect, it } from "vitest";
import { classNumberOf, firstClassOf, subjectFitsClass } from "../subjectLevels";

describe("the number of a class from its name", () => {
  it("reads the years before Class 1 as 0, a number in the name as itself, and says nothing for a name it cannot read", () => {
    for (const name of ["Pre-Nursery", "Nursery", "LKG", "UKG", "Play Group", "Pre-Primary", "Junior KG", "Senior KG"]) expect(classNumberOf(name), name).toBe(0);
    expect(classNumberOf("Class 5")).toBe(5);
    expect(classNumberOf("Class 11 Science")).toBe(11);
    expect(classNumberOf("Grade 12")).toBe(12);
    expect(classNumberOf("Foundation")).toBeNull();
  });
});

describe("the first class a subject is usually taught in", () => {
  it("is 0 for the usual subjects, and later for the senior ones", () => {
    for (const name of ["English", "Hindi", "Mathematics", "Art & Craft", "Environmental Studies", "Rhymes"]) expect(firstClassOf(name), name).toBe(0);
    expect(firstClassOf("Science")).toBe(1);
    expect(firstClassOf("Social Science")).toBe(1);
    expect(firstClassOf("Sanskrit")).toBe(3);
    expect(firstClassOf("History")).toBe(6);
    expect(firstClassOf("Physics")).toBe(9);
    expect(firstClassOf("Chemistry")).toBe(9);
    expect(firstClassOf("Accountancy")).toBe(11);
    expect(firstClassOf("Business Studies")).toBe(11);
    // The highest wins: Political Science is a senior subject, not a middle one.
    expect(firstClassOf("Political Science")).toBe(11);
  });
});

describe("whether a subject fits a class", () => {
  it("keeps a pre-school class away from Physics, Chemistry, Science and Accountancy", () => {
    for (const name of ["Physics", "Chemistry", "Science", "Accountancy", "History"]) expect(subjectFitsClass(name, "Nursery"), name).toBe(false);
    for (const name of ["English", "Mathematics", "Rhymes", "Art & Craft"]) expect(subjectFitsClass(name, "Nursery"), name).toBe(true);
  });

  it("offers the senior subjects from their class on", () => {
    expect(subjectFitsClass("Physics", "Class 8")).toBe(false);
    expect(subjectFitsClass("Physics", "Class 9")).toBe(true);
    expect(subjectFitsClass("Accountancy", "Class 10")).toBe(false);
    expect(subjectFitsClass("Accountancy", "Class 11 Commerce")).toBe(true);
  });

  it("offers everything to a class whose number the name does not tell", () => {
    expect(subjectFitsClass("Physics", "Foundation")).toBe(true);
  });
});
