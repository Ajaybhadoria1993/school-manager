import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_RULES } from "../../constants/studentFields";
import type { Relation } from "../../types";
import { checkStudentForm, emptyGuardian, emptyStudentForm, freeRelation, takenRelations, type StudentFormValues } from "../students";

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
      manual: true,
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
