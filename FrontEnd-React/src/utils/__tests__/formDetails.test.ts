import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_RULES, USUAL_STEPS, effectivePlacements, type CustomFieldDef } from "../../constants/studentFields";
import type { StudentSettings } from "../../types";
import { addCustom, addStep, draftOf, moveStep, setAsked, setPlacements, setRequired } from "../exportLayout";
import { formSteps, type FormRow } from "../formDetails";
import { defaultLayout } from "../exportLayout";
import { placeIn } from "../placement";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };
const HOSTEL: CustomFieldDef = { key: "c_hostel1", label: "Hostel", type: "yesNo", options: [], mode: "optional" };

const fresh = (): StudentSettings => ({
  fields: DEFAULT_FIELD_RULES,
  customFields: [],
  exportColumns: defaultLayout(),
  exportIsDefault: true,
  placements: effectivePlacements(null, []),
  placementsAreDefault: true,
  steps: [...USUAL_STEPS],
  stepsAreDefault: true,
  updatedAt: null,
});
const draft = () => draftOf(fresh());
const ids = (rows: FormRow[]) => rows.map((r) => r.id);
const row = (rows: FormRow[], id: string) => rows.find((r) => r.id === id)!;

describe("the Add student form, step by step, as the form shows it", () => {
  it("Personal info: the student, the address, then the details placed in it", () => {
    const personal = formSteps(draft()).personal;
    expect(ids(personal.fixed)).toEqual(["firstName", "lastName", "gender", "dateOfBirth", "category", "addressLine1", "addressArea", "addressCity", "addressState", "addressPincode"]);
    // A new school asks the blood group (here) and the Aadhaar number (in Academic); the others it does not ask are in the other steps.
    expect(ids(personal.asked)).toEqual(["bloodGroup"]);
    expect(ids(personal.notAsked)).toEqual([]);
  });

  it("Academic: the class, the admission date and the previous school; Parents: the boxes of a parent, in the order of the form", () => {
    const steps = formSteps(draft());
    expect(ids(steps.academic.fixed)).toEqual(["classId", "rollNumber", "admissionDate", "previousSchoolName", "previousSchoolLastClass", "previousSchoolTcNumber", "previousSchoolTcDate"]);
    expect(ids(steps.parents.fixed)).toEqual(["guardianName", "guardianRelation", "guardianMobile", "guardianAlternate", "guardianOccupation", "guardianEmail", "secondParent"]);
    expect(steps.more.fixed).toEqual([]);
    expect(ids(steps.more.asked)).toEqual([]);
    // What a school may move and does not ask is shared out over the four steps, so the steps are about as long as each other.
    expect(ids(steps.academic.asked)).toEqual(["aadhaarNumber"]);
    expect(ids(steps.academic.notAsked)).toEqual(["srNumber", "pen"]);
    expect(ids(steps.parents.notAsked)).toEqual(["emergencyMobile", "rteSeat", "bpl"]);
    expect(ids(steps.more.notAsked)).toEqual(["religion", "samagraId", "apaarId", "nationality", "disability", "medicalNotes", "feeConcession", "transportRoute", "transportStop"]);
  });

  it("each row says what the school can do with it: nothing, only mandatory or optional, or ask it or not as well", () => {
    const steps = formSteps(draft());
    expect(row(steps.personal.fixed, "firstName")).toMatchObject({ control: "always", asked: true, mandatory: true, movable: false });
    expect(row(steps.academic.fixed, "rollNumber")).toMatchObject({ control: "always", asked: true, mandatory: false });
    expect(row(steps.personal.fixed, "addressLine1")).toMatchObject({ control: "fixed", asked: true, mandatory: true });
    expect(row(steps.academic.fixed, "previousSchoolName")).toMatchObject({ control: "fixed", note: "Mandatory from Class 1" });
    // The category is always asked: only its Mandatory is the school's.
    expect(row(steps.personal.fixed, "category")).toMatchObject({ control: "mandatory", asked: true, mandatory: true });
    expect(row(steps.parents.fixed, "secondParent")).toMatchObject({ control: "mandatory", mandatory: true });
    // The school decides about these.
    expect(row(steps.personal.fixed, "addressArea")).toMatchObject({ control: "asked", asked: true, mandatory: true });
    expect(row(steps.academic.fixed, "admissionDate")).toMatchObject({ control: "asked", asked: false, mandatory: false });
    expect(row(steps.parents.fixed, "guardianOccupation")).toMatchObject({ control: "asked", asked: true, mandatory: true });
    expect(row(steps.academic.asked, "aadhaarNumber")).toMatchObject({ control: "asked", asked: true, mandatory: true, movable: true, own: false });
  });

  it("a yes / no detail (RTE seat, BPL, an own tick) can be asked but never mandatory", () => {
    const withTick = addCustom(draft(), HOSTEL);
    const more = formSteps(withTick).more;
    expect(row(formSteps(withTick).parents.notAsked, "rteSeat").canRequire).toBe(false);
    expect(row(more.asked, "c_hostel1")).toMatchObject({ canRequire: false, own: true, movable: true });
    expect(row(more.notAsked, "nationality").canRequire).toBe(true);
  });

  it("an own field is in the step it is asked in, as one of the school's own, asked or not as its setting says", () => {
    let d = addCustom(draft(), HOUSE);
    expect(ids(formSteps(d).more.asked)).toEqual(["c_house1"]);
    expect(row(formSteps(d).more.asked, "c_house1")).toMatchObject({ own: true, label: "House", asked: true, mandatory: false });
    d = setAsked(d, { kind: "custom", key: "c_house1" }, false);
    expect(ids(formSteps(d).more.asked)).toEqual([]);
    expect(ids(formSteps(d).more.notAsked)).toContain("c_house1");
    d = setPlacements(setAsked(d, { kind: "custom", key: "c_house1" }, true), placeIn(d.placements, "c_house1", "academic"));
    expect(ids(formSteps(d).academic.asked)).toEqual(["aadhaarNumber", "c_house1"]);
    expect(ids(formSteps(d).more.notAsked)).not.toContain("c_house1");
  });

  it("the order inside a step is the order the school gave; asking a detail moves it up among the asked ones, not in the order", () => {
    let d = setPlacements(draft(), placeIn(draft().placements, "srNumber", "academic", "aadhaarNumber"));
    d = setAsked(d, { kind: "rule", rule: "srNumber" }, true);
    expect(ids(formSteps(d).academic.asked)).toEqual(["srNumber", "aadhaarNumber"]);
  });

  it("what the form shows follows Mandatory and Asked from the draft", () => {
    let d = setRequired(draft(), { kind: "rule", rule: "bloodGroup" }, true);
    expect(row(formSteps(d).personal.asked, "bloodGroup").mandatory).toBe(true);
    d = setAsked(d, { kind: "rule", rule: "bloodGroup" }, false);
    expect(ids(formSteps(d).personal.asked)).toEqual([]);
    expect(row(formSteps(d).personal.notAsked, "bloodGroup").mandatory).toBe(false);
  });
});

describe("the steps a school adds", () => {
  it("each step of the school's own is a step of the form, after More details, with no box it always has", () => {
    const steps = addStep(draft(), "Health");
    const key = steps.steps[1].key;
    const placed = setPlacements(steps, placeIn(steps.placements, "medicalNotes", key));
    const rows = formSteps(setAsked(placed, { kind: "rule", rule: "medicalNotes" }, true));
    expect(Object.keys(rows)).toEqual(["personal", "academic", "parents", "more", key]);
    expect(rows[key].fixed).toEqual([]);
    expect(ids(rows[key].asked)).toEqual(["medicalNotes"]);
    expect(ids(rows.more.notAsked)).not.toContain("medicalNotes");
    expect(ids(formSteps(placed)[key].notAsked)).toEqual(["medicalNotes"]);
  });

  it("the steps follow the order the school arranged", () => {
    let d = addStep(addStep(draft(), "Health"), "Documents");
    d = moveStep(d, d.steps[2].key, -1);
    d = moveStep(d, "more", 1);
    expect(Object.keys(formSteps(d)).slice(3)).toEqual([d.steps[0].key, "more", d.steps[2].key]);
  });
});
