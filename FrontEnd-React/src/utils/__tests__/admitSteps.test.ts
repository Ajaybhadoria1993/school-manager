import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_RULES, effectivePlacements, type CustomFieldDef, type StepDef } from "../../constants/studentFields";
import { firstStepWithProblems, problemPathsOf, stepKeyOfPath, stepsFor } from "../admitSteps";
import { placeIn } from "../placement";

const own = (mode: CustomFieldDef["mode"]): CustomFieldDef => ({ key: "c_house1", label: "House", type: "text", options: [], mode });
const MORE: StepDef = { key: "more", name: "More details" };
const HEALTH: StepDef = { key: "s_health1", name: "Health" };

describe("the steps of Add student", () => {
  it("are Personal info, Academic and Parents; More details only when the school asks for anything there", () => {
    expect(stepsFor(DEFAULT_FIELD_RULES, []).map((s) => s.label)).toEqual(["Personal info", "Academic", "Parents"]);
    // Health, fees, the bus, the religion, a nationality: any one of them brings the step.
    for (const key of ["religion", "samagraId", "apaarId", "nationality", "disability", "medicalNotes", "feeConcession", "transportRoute", "transportStop"] as const) {
      expect(stepsFor({ ...DEFAULT_FIELD_RULES, [key]: "optional" }, []).map((s) => s.label), key).toEqual(["Personal info", "Academic", "Parents", "More details"]);
    }
    // The emergency number, the RTE seat and the BPL are with the parents, the PEN and SR number with the class: no step of their own.
    for (const key of ["emergencyMobile", "rteSeat", "bpl", "pen", "srNumber"] as const) {
      expect(stepsFor({ ...DEFAULT_FIELD_RULES, [key]: "optional" }, []), key).toHaveLength(3);
    }
    // The school's own fields too (but not one it does not ask).
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("optional")])).toHaveLength(4);
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("required")])).toHaveLength(4);
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("hidden")])).toHaveLength(3);
    // The blood group (Personal info) and the Aadhaar number (Academic) are what a new school asks: they do not make a step of their own.
    expect(stepsFor({ ...DEFAULT_FIELD_RULES, bloodGroup: "required", aadhaarNumber: "required" }, [])).toHaveLength(3);
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

  it("the child, the address and the blood group: Personal info", () => {
    for (const path of ["firstName", "lastName", "gender", "dateOfBirth", "category", "bloodGroup", "address.line1", "address.line2", "address.city", "address.state", "address.pincode"]) {
      expect(stepKeyOfPath(path), path).toBe("personal");
    }
  });

  it("the SR number, the PEN and the Aadhaar number sit with the class by default: Academic", () => {
    for (const path of ["srNumber", "pen", "aadhaarNumber"]) expect(stepKeyOfPath(path), path).toBe("academic");
  });

  it("the parents, what is said about them as a whole, and the family's emergency number, RTE seat and BPL: Parents", () => {
    for (const path of ["guardians", "guardians.0.name", "guardians.1.mobile", "guardians.2.relation", "guardians.0.occupation", "emergencyMobile", "rteSeat", "bpl"]) {
      expect(stepKeyOfPath(path), path).toBe("parents");
    }
  });

  it("the religion, the Samagra and APAAR IDs, health, fees, the bus and the school's own fields: More details", () => {
    for (const path of ["religion", "samagraId", "apaarId", "nationality", "disability", "medicalNotes", "feeConcession", "transportRoute", "transportStop", "custom.c_house1"]) {
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
    // Personal info comes first, so its box wins over the class of Academic.
    expect(firstStepWithProblems(problems, steps)).toBe(0);
    expect(firstStepWithProblems({ classId: "x", nationality: "y" }, steps)).toBe(1);
    expect(firstStepWithProblems({ firstName: "x", nationality: "y" }, steps)).toBe(0);
    expect(firstStepWithProblems({ nationality: "y" }, steps)).toBe(3);
    expect(firstStepWithProblems({}, steps)).toBe(-1);
    // A box of a step the school does not have (nothing asked there) is not a step to go to.
    expect(firstStepWithProblems({ nationality: "y" }, stepsFor(DEFAULT_FIELD_RULES, []))).toBe(-1);
  });
});

describe("the steps follow the places the school chose", () => {
  const usual = effectivePlacements(null, [own("optional")]);
  const moved = (key: string, step: string) => placeIn(usual, key, step);

  it("More details is a step only while something asked is placed in it", () => {
    const rules = { ...DEFAULT_FIELD_RULES, nationality: "optional" as const };
    expect(stepsFor(rules, [], effectivePlacements(null, [])).map((s) => s.label)).toEqual(["Personal info", "Academic", "Parents", "More details"]);
    // Moved to Academic, it is asked there and nothing is left for More details.
    expect(stepsFor(rules, [], placeIn(effectivePlacements(null, []), "nationality", "academic")).map((s) => s.label)).toEqual(["Personal info", "Academic", "Parents"]);
    // The school's own field moved out of More details takes the step with it; moved back, it brings it again.
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("optional")], usual)).toHaveLength(4);
    expect(stepsFor(DEFAULT_FIELD_RULES, [own("optional")], moved("c_house1", "parents"))).toHaveLength(3);
    // A detail placed in More details that the school does not ask brings nothing.
    expect(stepsFor(DEFAULT_FIELD_RULES, [], placeIn(effectivePlacements(null, []), "pen", "more"))).toHaveLength(3);
    // And an asked one placed there brings the step.
    expect(stepsFor({ ...DEFAULT_FIELD_RULES, pen: "optional" }, [], placeIn(effectivePlacements(null, []), "pen", "more"))).toHaveLength(4);
  });

  it("a step of the school's own is a step of its name, after Parents, in the order the school arranged, once something asked is in it", () => {
    const steps = [MORE, HEALTH];
    const rules = { ...DEFAULT_FIELD_RULES, medicalNotes: "optional" as const };
    // Nothing asked placed in it: not a step (the medical notes are asked in More details by default).
    expect(stepsFor(rules, [], effectivePlacements(null, [], steps), steps).map((s) => s.label)).toEqual(["Personal info", "Academic", "Parents", "More details"]);
    const placed = placeIn(effectivePlacements(null, [], steps), "medicalNotes", "s_health1");
    const list = stepsFor(rules, [], placed, steps);
    expect(list.map((s) => s.label)).toEqual(["Personal info", "Academic", "Parents", "Health"]);
    expect(list[3]).toMatchObject({ key: "s_health1", label: "Health" });
    expect(list[3].hint.length).toBeGreaterThan(10);
    // Arranged before More details, with both asked.
    const both = stepsFor({ ...rules, nationality: "optional" }, [], placed, [HEALTH, MORE]);
    expect(both.map((s) => s.label)).toEqual(["Personal info", "Academic", "Parents", "Health", "More details"]);
  });

  it("a moved detail's message belongs to the step it was moved to; the details no school can move stay where they are", () => {
    const placements = placeIn(usual, "aadhaarNumber", "personal");
    expect(stepKeyOfPath("aadhaarNumber", placements)).toBe("personal");
    expect(stepKeyOfPath("aadhaarNumber")).toBe("academic");
    expect(stepKeyOfPath("custom.c_house1", moved("c_house1", "personal"))).toBe("personal");
    expect(stepKeyOfPath("custom.c_house1", usual)).toBe("more");
    expect(stepKeyOfPath("bloodGroup", moved("bloodGroup", "parents"))).toBe("parents");
    expect(stepKeyOfPath("medicalNotes", moved("medicalNotes", "s_health1"))).toBe("s_health1");
    for (const [path, step] of [["firstName", "personal"], ["category", "personal"], ["address.city", "personal"], ["classId", "academic"], ["previousSchool.name", "academic"], ["guardians.0.name", "parents"]] as const) {
      expect(stepKeyOfPath(path, moved("pen", "parents")), path).toBe(step);
    }
  });

  it("the boxes of a step with a problem follow the places too", () => {
    const placements = moved("nationality", "academic");
    const problems = { nationality: "Enter the nationality", classId: "Choose the class" };
    expect(problemPathsOf(problems, "academic", placements)).toEqual(["nationality", "classId"]);
    expect(problemPathsOf(problems, "more", placements)).toEqual([]);
    const placed = placeIn(effectivePlacements(null, []), "nationality", "academic");
    const steps = stepsFor({ ...DEFAULT_FIELD_RULES, nationality: "optional" }, [], placed);
    expect(firstStepWithProblems({ nationality: "x" }, steps, placed)).toBe(1);
  });
});
