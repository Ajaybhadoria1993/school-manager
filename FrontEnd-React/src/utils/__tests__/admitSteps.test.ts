import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_RULES, type CustomFieldDef } from "../../constants/studentFields";
import { firstStepWithProblems, problemPathsOf, stepKeyOfPath, stepsFor } from "../admitSteps";

const own = (mode: CustomFieldDef["mode"]): CustomFieldDef => ({ key: "c_house1", label: "House", type: "text", options: [], mode });

describe("the steps of Add student", () => {
  it("are Academic, Personal info and Parents; More details only when the school asks for anything there", () => {
    expect(stepsFor(DEFAULT_FIELD_RULES, []).map((s) => s.label)).toEqual(["Academic", "Personal info", "Parents"]);
    // Health, an emergency number, fees, the bus: any one of them brings the step.
    for (const key of ["nationality", "emergencyMobile", "disability", "medicalNotes", "rteSeat", "bpl", "feeConcession", "transportRoute", "transportStop"] as const) {
      expect(stepsFor({ ...DEFAULT_FIELD_RULES, [key]: "optional" }, []).map((s) => s.label), key).toEqual(["Academic", "Personal info", "Parents", "More details"]);
    }
    // The school's own fields too (but not one it does not ask).
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("optional")])).toHaveLength(4);
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("required")])).toHaveLength(4);
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("hidden")])).toHaveLength(3);
    // The religion and the blood group sit with the student (Personal info), so they do not make a step of their own.
    expect(stepsFor({ ...DEFAULT_FIELD_RULES, religion: "optional", bloodGroup: "required" }, [])).toHaveLength(3);
  });

  it("each has a line saying what it holds", () => {
    for (const step of stepsFor({ ...DEFAULT_FIELD_RULES, nationality: "optional" }, [])) expect(step.hint.length, step.key).toBeGreaterThan(10);
  });
});

describe("which step a box belongs to", () => {
  it("class, section, roll number, admission date and the previous school: Academic", () => {
    for (const path of ["classId", "sectionId", "rollNumber", "admissionDate", "previousSchool.name", "previousSchool.lastClass", "previousSchool.tcNumber", "previousSchool.tcDate"]) {
      expect(stepKeyOfPath(path), path).toBe("academic");
    }
  });

  it("the child, the address and the IDs: Personal info", () => {
    for (const path of ["firstName", "lastName", "gender", "dateOfBirth", "category", "bloodGroup", "religion", "address.line1", "address.line2", "address.city", "address.state", "address.pincode", "aadhaarNumber", "samagraId", "apaarId", "pen", "srNumber"]) {
      expect(stepKeyOfPath(path), path).toBe("personal");
    }
  });

  it("the parents, and what is said about them as a whole: Parents", () => {
    for (const path of ["guardians", "guardians.0.name", "guardians.1.mobile", "guardians.2.relation", "guardians.0.occupation"]) expect(stepKeyOfPath(path), path).toBe("parents");
  });

  it("health, an emergency number, fees, the bus and the school's own fields: More details", () => {
    for (const path of ["nationality", "emergencyMobile", "disability", "medicalNotes", "rteSeat", "bpl", "feeConcession", "transportRoute", "transportStop", "custom.c_house1"]) {
      expect(stepKeyOfPath(path), path).toBe("more");
    }
  });

  it("a path nobody knows belongs to no step", () => {
    expect(stepKeyOfPath("")).toBeNull();
    expect(stepKeyOfPath("somethingElse")).toBeNull();
  });
});

describe("what is wrong, step by step", () => {
  const problems = { firstName: "Enter the first name", "guardians.0.mobile": "Enter the mobile number", classId: "Choose the class", nationality: "Enter the nationality" };

  it("lists the boxes of one step", () => {
    expect(problemPathsOf(problems, "academic")).toEqual(["classId"]);
    expect(problemPathsOf(problems, "personal")).toEqual(["firstName"]);
    expect(problemPathsOf(problems, "parents")).toEqual(["guardians.0.mobile"]);
    expect(problemPathsOf(problems, "more")).toEqual(["nationality"]);
    expect(problemPathsOf({}, "academic")).toEqual([]);
  });

  it("finds the first step, in the steps' order, that has a problem (or none)", () => {
    const steps = stepsFor({ ...DEFAULT_FIELD_RULES, nationality: "optional" }, []);
    expect(firstStepWithProblems(problems, steps)).toBe(0);
    expect(firstStepWithProblems({ firstName: "x", nationality: "y" }, steps)).toBe(1);
    expect(firstStepWithProblems({ nationality: "y" }, steps)).toBe(3);
    expect(firstStepWithProblems({}, steps)).toBe(-1);
    // A box of a step the school does not have (nothing asked there) is not a step to go to.
    expect(firstStepWithProblems({ nationality: "y" }, stepsFor(DEFAULT_FIELD_RULES, []))).toBe(-1);
  });
});
