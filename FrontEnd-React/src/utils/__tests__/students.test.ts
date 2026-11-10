import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_RULES } from "../../constants/studentFields";
import type { Relation } from "../../types";
import { checkStudentForm, emptyGuardian, emptyStudentForm, admitLink, manageStudentsLink, formatMoment, istDay, freeRelation, namesPreview, takenRelations, type StudentFormValues } from "../students";

/** An admission with every detail a new school needs by default, and these parents. */
function admission(parents: { relation: Relation | ""; mobile?: string; name?: string; isPrimary?: boolean }[]): StudentFormValues {
  const v = emptyStudentForm(DEFAULT_FIELD_RULES);
  return {
    ...v,
    firstName: "Asha",
    lastName: "Verma",
    gender: "Female",
    dateOfBirth: "2016-05-14",
    classId: "c1",
    guardians: parents.map((p, i) => ({
      ...emptyGuardian(p.isPrimary ?? i === 0, p.relation),
      mobile: p.mobile ?? `98765432${10 + i}`,
      name: p.name ?? `Parent ${i + 1}`,
      occupation: "Farmer",
    })),
  };
}
const check = (v: StudentFormValues, saved?: StudentFormValues) =>
  checkStudentForm(v, { classHasSections: false, admissionDateRequired: false, today: "2026-10-24", rules: { ...DEFAULT_FIELD_RULES, secondParent: "optional" }, saved });
const relationProblems = (errors: Record<string, string>) => Object.fromEntries(Object.entries(errors).filter(([path]) => path.endsWith(".relation")));

describe("a child's parents on the admission form", () => {
  it("one father and one mother at most: a second Father or a second Mother says so in its Relation box, wherever it stands", () => {
    expect(relationProblems(check(admission([{ relation: "Father" }, { relation: "Father" }])))).toEqual({
      "guardians.1.relation": "A child has only one father: choose Guardian or Other for this one",
    });
    expect(relationProblems(check(admission([{ relation: "Mother" }, { relation: "Father" }, { relation: "Mother" }])))).toEqual({
      "guardians.2.relation": "A child has only one mother: choose Guardian or Other for this one",
    });
    expect(Object.keys(relationProblems(check(admission([{ relation: "Father" }, { relation: "Father" }, { relation: "Mother" }, { relation: "Mother" }]))))).toEqual([
      "guardians.1.relation",
      "guardians.3.relation",
    ]);
  });

  it("a real family is fine: the father, the mother, and as many guardians and others as the limit allows", () => {
    expect(relationProblems(check(admission([{ relation: "Father" }, { relation: "Mother" }, { relation: "Guardian" }, { relation: "Other" }])))).toEqual({});
    expect(relationProblems(check(admission([{ relation: "Guardian" }, { relation: "Guardian" }, { relation: "Other" }, { relation: "Other" }])))).toEqual({});
  });

  it("a guardian whose relation is not chosen yet is asked for it, not called a second father", () => {
    expect(relationProblems(check(admission([{ relation: "Father" }, { relation: "" }])))).toEqual({ "guardians.1.relation": "Choose the relation" });
  });

  it("a saved student's page is not blocked by what an older record has (two fathers saved before this rule): only an admission is checked", () => {
    const saved = admission([{ relation: "Father" }, { relation: "Father" }]);
    expect(relationProblems(check(saved, saved))).toEqual({});
  });

  it("which relations are taken by the other guardians, and the first that is free for a new one (the father, the mother, then a guardian)", () => {
    const parents = admission([{ relation: "Father" }, { relation: "Guardian" }]).guardians;
    expect([...takenRelations(parents, 1)]).toEqual(["Father"]);
    expect([...takenRelations(parents, 0)]).toEqual([]);
    expect(freeRelation([])).toBe("Father");
    expect(freeRelation(parents)).toBe("Mother");
    expect(freeRelation(admission([{ relation: "Mother" }]).guardians)).toBe("Father");
    expect(freeRelation(admission([{ relation: "Father" }, { relation: "Mother" }]).guardians)).toBe("Guardian");
    expect(freeRelation(admission([{ relation: "Mother" }, { relation: "Father" }, { relation: "Guardian" }]).guardians)).toBe("Guardian");
  });

  it("a new school's form starts with the father as the primary contact; a school that needs both parents starts with the father and the mother", () => {
    const one = emptyStudentForm({ ...DEFAULT_FIELD_RULES, secondParent: "optional" });
    expect(one.guardians.map((g) => [g.relation, g.isPrimary])).toEqual([["Father", true]]);
    const both = emptyStudentForm({ ...DEFAULT_FIELD_RULES, secondParent: "required" });
    expect(both.guardians.map((g) => [g.relation, g.isPrimary])).toEqual([["Father", true], ["Mother", false]]);
  });
});

describe("a moment in Indian time", () => {
  it("is the day and the time in India, whatever the computer's own zone", () => {
    expect(formatMoment("2026-10-25T10:30:00.000Z")).toMatch(/^25 Oct 2026, 4:00 pm$/i);
    // Late evening in London is already the next day in India.
    expect(formatMoment("2026-10-25T20:00:00.000Z")).toMatch(/^26 Oct 2026, 1:30 am$/i);
  });
});

describe("naming the students a dialog is about", () => {
  it("lists a few by name and counts the rest", () => {
    expect(namesPreview(["Asha Verma"])).toBe("Asha Verma");
    expect(namesPreview(["Asha Verma", "Kabir Rao"])).toBe("Asha Verma and Kabir Rao");
    expect(namesPreview(["A", "B", "C", "D", "E"])).toBe("A, B, C, D and E");
    expect(namesPreview(["A", "B", "C", "D", "E", "F", "G"])).toBe("A, B, C, D, E and 2 more");
    expect(namesPreview([])).toBe("");
  });
});

describe("the admission form opened for a class", () => {
  it("carries the class, and the section only with a class", () => {
    expect(admitLink()).toBe("/school/students/new");
    expect(admitLink({ classId: "c5" })).toBe("/school/students/new?class=c5");
    expect(admitLink({ classId: "c5", sectionId: "c5-A" })).toBe("/school/students/new?class=c5&section=c5-A");
    expect(admitLink({ sectionId: "c5-A" })).toBe("/school/students/new");
    expect(admitLink({ classId: "", sectionId: "" })).toBe("/school/students/new");
  });
});

describe("the Manage Students page opened for a class", () => {
  it("carries the class, and the section only with a class", () => {
    expect(manageStudentsLink()).toBe("/school/students");
    expect(manageStudentsLink({ classId: "c5" })).toBe("/school/students?class=c5");
    expect(manageStudentsLink({ classId: "c5", sectionId: "c5-A" })).toBe("/school/students?class=c5&section=c5-A");
    expect(manageStudentsLink({ sectionId: "c5-A" })).toBe("/school/students");
    expect(manageStudentsLink({ classId: "", sectionId: "" })).toBe("/school/students");
  });
});

describe("the day in India of a moment", () => {
  it("is the calendar day there, not in the computer's own zone", () => {
    expect(istDay("2026-09-02T04:00:00.000Z")).toBe("2026-09-02");
    expect(istDay("2026-10-25T20:00:00.000Z")).toBe("2026-10-26");
  });
});

describe("what is wrong with an Aadhaar number is said by what is wrong", () => {
  const CHECK_DIGIT = "This Aadhaar number is not valid: its last digit (the check digit) does not match the other digits";
  const aadhaarOf = (value: string) => check({ ...admission([{ relation: "Father" }]), admissionDate: "2026-06-01", aadhaarNumber: value }).aadhaarNumber;

  it("a good number (spaces and dashes between the digits do not matter) has nothing said", () => {
    expect(aadhaarOf("234567890124")).toBeUndefined();
    expect(aadhaarOf("2345 6789 0124")).toBeUndefined();
    expect(aadhaarOf("2345-6789-0124")).toBeUndefined();
  });

  it("the number of digits, the first digit and the check digit each have their own message", () => {
    for (const short of ["12345", "23456789012", "2345678901234", "abcdefghijkl"]) expect(aadhaarOf(short), short).toBe("The Aadhaar number has 12 digits");
    for (const start of ["123456789012", "023456789012"]) expect(aadhaarOf(start), start).toBe("An Aadhaar number does not start with 0 or 1");
    // 12 digits that look right (a number from a dummy file): the last digit does not fit the others.
    for (const wrong of ["234567890120", "596001338908"]) expect(aadhaarOf(wrong), wrong).toBe(CHECK_DIGIT);
  });
});

describe("the age message says how old the student was on which day", () => {
  const RULE = "a student must be 2 to 25 years old then. Fix the date of birth or the admission date";
  const dobProblem = (dateOfBirth: string, admissionDate: string) => check({ ...admission([{ relation: "Father" }]), dateOfBirth, admissionDate }).dateOfBirth;

  it("names the age and the admission date, so the person knows which of the two dates to fix", () => {
    expect(dobProblem("2020-06-18", "2022-04-03")).toBe(`The student was 1 year old on the admission date (03-04-2022); ${RULE}`);
    expect(dobProblem("2022-10-18", "2023-04-10")).toBe(`The student was less than a year old on the admission date (10-04-2023); ${RULE}`);
    expect(dobProblem("1990-01-01", "2026-06-01")).toBe(`The student was 36 years old on the admission date (01-06-2026); ${RULE}`);
  });

  it("an empty admission date is today (the server takes today), and the message names that day", () => {
    expect(dobProblem("2025-06-01", "")).toBe(`The student was 1 year old on the admission date (24-10-2026); ${RULE}`);
  });

  it("a student of a right age has nothing said", () => {
    expect(dobProblem("2016-05-14", "2026-06-01")).toBeUndefined();
    expect(dobProblem("2020-06-18", "2022-06-18")).toBeUndefined();
  });
});
