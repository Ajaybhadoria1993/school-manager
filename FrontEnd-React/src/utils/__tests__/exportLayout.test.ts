import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_LAYOUT, DEFAULT_FIELD_RULES, EXPORT_COLUMNS, USUAL_STEPS, effectivePlacements, type CustomFieldDef } from "../../constants/studentFields";
import type { StudentSettings } from "../../types";
import {
  OWN_GROUP,
  addCustom,
  addStep,
  columnIsMandatory,
  columnLetters,
  columnsOfRule,
  defaultColumnsDraft,
  defaultDraft,
  defaultLayout,
  detailOfColumn,
  dragRow,
  draftOf,
  editCustom,
  infoOf,
  isDefaultLayout,
  layoutOf,
  layoutProblems,
  missingForUpload,
  moveColumn,
  moveStep,
  removeCustom,
  removeStep,
  renameRow,
  renameStep,
  sameDraft,
  setAsked,
  setMandatory,
  setPlacements,
  setRequired,
  stepNameProblem,
  stepRow,
  switchRow,
} from "../exportLayout";
import { placeIn } from "../placement";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };
const FEE: CustomFieldDef = { key: "c_fee001", label: "Fee paid", type: "yesNo", options: [], mode: "optional" };

/** The settings of a new school (nothing saved yet), with the school's own fields given. */
const fresh = (customFields: CustomFieldDef[] = []): StudentSettings => ({
  fields: DEFAULT_FIELD_RULES,
  customFields,
  exportColumns: defaultLayout(),
  exportIsDefault: true,
  placements: effectivePlacements(null, customFields),
  placementsAreDefault: true,
  steps: [...USUAL_STEPS],
  stepsAreDefault: true,
  updatedAt: null,
});
const keysOn = (draft: ReturnType<typeof draftOf>) => layoutOf(draft).map((c) => c.key);
const place = (draft: ReturnType<typeof draftOf>, key: string) => draft.rows.findIndex((r) => r.key === key);
const rule = (r: Parameters<typeof setRequired>[1] & { kind: "rule" }) => r;

describe("the sheet's letters", () => {
  it("are A to Z, then AA, AB ... ZZ, AAA", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetters)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("a layout", () => {
  it("is the default one when its columns and headings are (spaces at the ends do not count)", () => {
    expect(isDefaultLayout(defaultLayout())).toBe(true);
    expect(defaultLayout().map((c) => c.key)).toEqual(DEFAULT_EXPORT_LAYOUT);
    const spaced = defaultLayout().map((c, i) => (i === 2 ? { ...c, heading: `  ${c.heading} ` } : c));
    expect(isDefaultLayout(spaced)).toBe(true);
    expect(isDefaultLayout(defaultLayout().map((c, i) => (i === 2 ? { ...c, heading: "Sex" } : c)))).toBe(false);
    expect(isDefaultLayout(defaultLayout().slice(1))).toBe(false);
  });

  it("says what is wrong with a heading, by its place, in the server's words", () => {
    expect(
      layoutProblems([
        { key: "studentName", heading: "Name" },
        { key: "className", heading: " " },
        { key: "gender", heading: "x".repeat(61) },
        { key: "age", heading: "<b>Age</b>" },
        { key: "category", heading: "NAME" },
        { key: "state", heading: "State" },
      ])
    ).toEqual({
      1: "Enter the heading",
      2: "Keep the heading under 60 characters",
      3: "The heading cannot contain < or >",
      4: "Two columns cannot have the same heading",
    });
  });

  it("says what a file of it lacks to be uploaded back (an age is not a birthday)", () => {
    // The birthday is one of the columns every export has, so a new school's file can always be uploaded back.
    expect(missingForUpload(defaultLayout())).toEqual([]);
    expect(missingForUpload(defaultLayout().filter((c) => c.key !== "dateOfBirth"))).toEqual(["Date of Birth"]);
    expect(missingForUpload([{ key: "studentName", heading: "Name" }, { key: "className", heading: "Class" }])).toEqual(["Date of Birth", "Gender", "Section", "a parent's mobile"]);
    expect(missingForUpload([{ key: "dateOfBirth", heading: "DOB" }, { key: "gender", heading: "G" }, { key: "sectionName", heading: "S" }, { key: "guardianMobile", heading: "M" }])).toEqual([]);
  });

  it("moves one item to another place, the others close up; a place outside the list changes nothing", () => {
    expect(moveColumn(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveColumn(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    const same = ["a", "b"];
    expect(moveColumn(same, 0, 5)).toBe(same);
  });
});

describe("the Excel's columns and the form's details: two lists, one Mandatory", () => {
  it("shows the layout's columns first (in the file), then every other column and the school's own fields (out of it)", () => {
    const draft = draftOf(fresh([HOUSE]));
    expect(keysOn(draft)).toEqual(DEFAULT_EXPORT_LAYOUT);
    expect(draft.rows).toHaveLength(EXPORT_COLUMNS.length + 1);
    expect(draft.rows.at(-1)).toEqual({ key: "c_house1", on: false, heading: "House" });
  });

  it("keeps what the form asks as it is saved, whatever the columns are: asked but not in the Excel, in the Excel but not asked", () => {
    const settings = { ...fresh([{ ...HOUSE, mode: "optional" }]), fields: { ...DEFAULT_FIELD_RULES, religion: "optional" as const, bloodGroup: "hidden" as const } };
    const draft = draftOf(settings);
    expect(draft.rules.religion).toBe("optional");
    expect(keysOn(draft)).not.toContain("religion");
    expect(draft.rules.bloodGroup).toBe("hidden");
    expect(keysOn(draft)).toContain("bloodGroup");
    expect(draft.custom[0].mode).toBe("optional");
    expect(draft.rows.find((r) => r.key === "c_house1")?.on).toBe(false);
  });

  it("a column taken out of the Excel stays where it is and does not change what the form asks; put back, the form is not changed either", () => {
    let draft = setRequired(draftOf(fresh()), { kind: "rule", rule: "bloodGroup" }, false);
    const at = place(draft, "bloodGroup");
    draft = switchRow(draft, "bloodGroup", false);
    expect(place(draft, "bloodGroup")).toBe(at);
    expect(keysOn(draft)).not.toContain("bloodGroup");
    expect(draft.rules.bloodGroup).toBe("optional");
    draft = switchRow(draft, "religion", true);
    expect(keysOn(draft)).toContain("religion");
    expect(draft.rules.religion).toBe("hidden");
  });

  it("a column that is mandatory (or one every school has) cannot be taken out: the list stays as it was", () => {
    const draft = draftOf(fresh());
    expect(columnIsMandatory(draft, "aadhaarNumber")).toBe(true);
    expect(switchRow(draft, "aadhaarNumber", false)).toBe(draft);
    expect(columnIsMandatory(draft, "gender")).toBe(true);
    expect(switchRow(draft, "gender", false)).toBe(draft);
    // Optional, it can go.
    const optional = setMandatory(draft, "aadhaarNumber", false);
    expect(columnIsMandatory(optional, "aadhaarNumber")).toBe(false);
    expect(keysOn(switchRow(optional, "aadhaarNumber", false))).not.toContain("aadhaarNumber");
    expect(switchRow(optional, "aadhaarNumber", false).rules.aadhaarNumber).toBe("optional");
  });

  it("making a detail mandatory, from the Excel or from the form, asks it and puts its columns in the file", () => {
    let draft = setRequired(draftOf(fresh()), { kind: "rule", rule: "guardianOccupation" }, false);
    draft = switchRow(switchRow(draft, "fatherOccupation", false), "motherOccupation", false);
    expect(keysOn(draft)).not.toContain("fatherOccupation");
    // From the form: both occupation columns come back.
    const fromForm = setRequired(draft, { kind: "rule", rule: "guardianOccupation" }, true);
    expect(fromForm.rules.guardianOccupation).toBe("required");
    expect(keysOn(fromForm)).toEqual(expect.arrayContaining(["fatherOccupation", "motherOccupation"]));
    // From the Excel: the same.
    const fromExcel = setMandatory(draft, "motherOccupation", true);
    expect(fromExcel.rules.guardianOccupation).toBe("required");
    expect(keysOn(fromExcel)).toEqual(expect.arrayContaining(["fatherOccupation", "motherOccupation"]));
    expect(columnsOfRule("guardianOccupation")).toEqual(["fatherOccupation", "motherOccupation"]);
    // A detail the form did not ask is asked once it is mandatory.
    const religion = setRequired(draft, { kind: "rule", rule: "religion" }, true);
    expect(religion.rules.religion).toBe("required");
    expect(keysOn(religion)).toContain("religion");
  });

  it("optional is one thing for both: it keeps the column and the form asking", () => {
    const draft = setMandatory(draftOf(fresh()), "aadhaarNumber", false);
    expect(draft.rules.aadhaarNumber).toBe("optional");
    expect(keysOn(draft)).toContain("aadhaarNumber");
    expect(setRequired(draftOf(fresh()), { kind: "rule", rule: "aadhaarNumber" }, false).rules.aadhaarNumber).toBe("optional");
  });

  it("the form asks a detail or not on its own: not asked is not mandatory, and the Excel is not changed", () => {
    let draft = setAsked(draftOf(fresh()), { kind: "rule", rule: "aadhaarNumber" }, false);
    expect(draft.rules.aadhaarNumber).toBe("hidden");
    expect(keysOn(draft)).toContain("aadhaarNumber");
    draft = setAsked(draft, { kind: "rule", rule: "aadhaarNumber" }, true);
    expect(draft.rules.aadhaarNumber).toBe("optional");
    // Asked again, a mandatory one stays mandatory.
    expect(setAsked(draftOf(fresh()), { kind: "rule", rule: "aadhaarNumber" }, true).rules.aadhaarNumber).toBe("required");
  });

  it("what the software always asks cannot be switched off; both parents are never 'not asked'", () => {
    const draft = draftOf(fresh());
    expect(setAsked(draft, { kind: "rule", rule: "addressLine1" }, false)).toBe(draft);
    expect(setAsked(draft, { kind: "rule", rule: "category" }, false)).toBe(draft);
    expect(setRequired(draft, { kind: "rule", rule: "addressLine1" }, false)).toBe(draft);
    expect(setAsked(draft, { kind: "rule", rule: "secondParent" }, false).rules.secondParent).toBe("optional");
  });

  it("a tick (RTE, an own Yes / No) is asked or not, never mandatory", () => {
    let draft = setAsked(draftOf(fresh()), { kind: "rule", rule: "rteSeat" }, true);
    expect(draft.rules.rteSeat).toBe("optional");
    expect(setRequired(draft, { kind: "rule", rule: "rteSeat" }, true)).toBe(draft);
    draft = addCustom(draft, { ...FEE, mode: "required" });
    expect(draft.custom.find((f) => f.key === "c_fee001")?.mode).toBe("optional");
    expect(setRequired(draft, { kind: "custom", key: "c_fee001" }, true)).toBe(draft);
  });

  it("Mandatory follows the school for its details and its own fields; the software's own needs do not change", () => {
    let draft = setMandatory(draftOf(fresh()), "religion", true);
    expect(draft.rules.religion).toBe("required");
    expect(setMandatory(draft, "gender", false)).toBe(draft);
    draft = addCustom(draft, HOUSE);
    draft = setMandatory(draft, "c_house1", true);
    expect(draft.custom.find((f) => f.key === "c_house1")?.mode).toBe("required");
    expect(draft.rows.find((r) => r.key === "c_house1")?.on).toBe(true);
    expect(columnIsMandatory(draft, "c_house1")).toBe(true);
    expect(switchRow(draft, "c_house1", false)).toBe(draft);
  });

  it("an own field is asked on the form or not, and is a column or not, each on its own", () => {
    let draft = addCustom(draftOf(fresh()), HOUSE);
    expect(draft.custom.find((f) => f.key === "c_house1")?.mode).toBe("optional");
    draft = setAsked(draft, { kind: "custom", key: "c_house1" }, false);
    expect(draft.custom.find((f) => f.key === "c_house1")?.mode).toBe("hidden");
    expect(keysOn(draft)).toContain("c_house1");
    draft = switchRow(draft, "c_house1", false);
    expect(keysOn(draft)).not.toContain("c_house1");
    expect(setAsked(draft, { kind: "custom", key: "c_house1" }, true).custom.find((f) => f.key === "c_house1")?.mode).toBe("optional");
  });

  it("a column emptied of its heading gets the usual one back when it is put in the file", () => {
    let draft = renameRow(draftOf(fresh()), "religion", "  ");
    draft = switchRow(draft, "religion", true);
    expect(layoutOf(draft).find((c) => c.key === "religion")?.heading).toBe("Religion");
  });

  it("↑ ↓ pass the next field that is on (the ones off in between do not count); the ends stay put", () => {
    let draft = setMandatory(draftOf(fresh()), "fatherOccupation", false);
    draft = switchRow(draft, "fatherOccupation", false);
    // fatherName, fatherMobile, (fatherOccupation off), motherName...
    draft = stepRow(draft, "motherName", -1);
    expect(keysOn(draft).slice(8, 11)).toEqual(["fatherName", "motherName", "fatherMobile"]);
    const first = stepRow(draft, "admissionNumber", -1);
    expect(first).toBe(draft);
    const lastOn = keysOn(draft).at(-1)!;
    expect(keysOn(stepRow(draft, lastOn, 1))).toEqual(keysOn(draft));
  });

  it("a row dragged onto another's place takes it", () => {
    const draft = dragRow(draftOf(fresh()), 0, 2);
    expect(keysOn(draft).slice(0, 3)).toEqual(["studentName", "gender", "admissionNumber"]);
  });

  it("a new own field is asked, a column at the end of the file; renamed, a heading that was its name follows it", () => {
    let draft = addCustom(draftOf(fresh()), HOUSE);
    expect(keysOn(draft).at(-1)).toBe("c_house1");
    expect(draft.rows[place(draft, "c_house1") + 1]?.on).toBe(false);
    draft = editCustom(draft, { ...HOUSE, label: "School House" });
    expect(layoutOf(draft).at(-1)).toEqual({ key: "c_house1", heading: "School House" });
    // A heading the school chose itself stays.
    draft = renameRow(draft, "c_house1", "Ghar");
    draft = editCustom(draft, { ...HOUSE, label: "Houses" });
    expect(layoutOf(draft).at(-1)).toEqual({ key: "c_house1", heading: "Ghar" });
  });

  it("an own field changed to mandatory comes into the file", () => {
    let draft = switchRow(addCustom(draftOf(fresh()), HOUSE), "c_house1", false);
    expect(keysOn(draft)).not.toContain("c_house1");
    draft = editCustom(draft, { ...HOUSE, mode: "required" });
    expect(keysOn(draft)).toContain("c_house1");
  });

  it("a deleted own field leaves the form, the file and its step", () => {
    const draft = removeCustom(addCustom(draftOf(fresh()), HOUSE), "c_house1");
    expect(draft.rows.some((r) => r.key === "c_house1")).toBe(false);
    expect(draft.custom).toEqual([]);
    expect(draft.placements.some((p) => p.key === "c_house1")).toBe(false);
  });

  it("two drafts are the same when they would be saved the same (headings tidied)", () => {
    const a = draftOf(fresh());
    expect(sameDraft(a, renameRow(a, "gender", " Gender "))).toBe(true);
    expect(sameDraft(a, renameRow(a, "gender", "Sex"))).toBe(false);
    expect(sameDraft(a, switchRow(a, "religion", true))).toBe(false);
    expect(sameDraft(a, setAsked(a, { kind: "rule", rule: "religion" }, true))).toBe(false);
    expect(sameDraft(defaultDraft([]), a)).toBe(true);
  });

  it("back to the default puts the form and the Excel back as a new school has them; the school's own fields stay, not asked and out of the file", () => {
    const own = addCustom(setAsked(draftOf(fresh()), { kind: "rule", rule: "religion" }, true), HOUSE);
    const back = defaultDraft(own.custom);
    expect(back.rules).toEqual(DEFAULT_FIELD_RULES);
    expect(keysOn(back)).toEqual(DEFAULT_EXPORT_LAYOUT);
    expect(back.custom.map((f) => f.mode)).toEqual(["hidden"]);
    expect(back.rows.find((r) => r.key === "c_house1")?.on).toBe(false);
  });

  it("the Excel alone back to the default: the form is not changed, the columns of mandatory details stay, the school's own fields go out of the file", () => {
    let draft = setRequired(setAsked(draftOf(fresh()), { kind: "rule", rule: "religion" }, true), { kind: "rule", rule: "religion" }, true);
    draft = addCustom(draft, HOUSE);
    draft = switchRow(setMandatory(draft, "bloodGroup", false), "bloodGroup", false);
    draft = renameRow(draft, "gender", "Sex");
    const back = defaultColumnsDraft(draft);
    expect(back.rules).toEqual(draft.rules);
    expect(back.custom).toEqual(draft.custom);
    expect(back.placements).toEqual(draft.placements);
    expect(layoutOf(back).find((c) => c.key === "gender")?.heading).toBe("Gender");
    expect(keysOn(back)).toEqual([...DEFAULT_EXPORT_LAYOUT, "religion"]);
    expect(keysOn(back)).not.toContain("c_house1");
    // A school whose form is a new school's gets exactly the default.
    expect(sameDraft(defaultColumnsDraft(draftOf(fresh())), draftOf(fresh()))).toBe(true);
  });

  it("finds the detail a column comes from: a detail of the list, or an own field; nothing for what no school decides", () => {
    expect(detailOfColumn("aadhaarNumber", [])).toEqual({ kind: "rule", rule: "aadhaarNumber" });
    expect(detailOfColumn("motherName", [])).toEqual({ kind: "rule", rule: "secondParent" });
    expect(detailOfColumn("c_house1", [HOUSE])).toEqual({ kind: "custom", key: "c_house1" });
    expect(detailOfColumn("gender", [])).toBeNull();
    expect(rule({ kind: "rule", rule: "pen" })).toEqual({ kind: "rule", rule: "pen" });
  });

  it("the details every school keeps are in a new school's Excel and cannot be switched off", () => {
    const fixed = ["studentName", "gender", "dateOfBirth", "age", "category", "className", "sectionName", "fatherName", "fatherMobile", "motherName", "motherMobile", "address", "city", "state", "pincode", "previousSchool"];
    expect(defaultLayout().slice(0, 5).map((c) => c.key)).toEqual(["admissionNumber", "studentName", "gender", "dateOfBirth", "age"]);
    for (const key of fixed) {
      expect(defaultLayout().some((c) => c.key === key), `${key} is in the default`).toBe(true);
      expect(infoOf(key, []).locked, `${key} is locked`).toBe(true);
    }
    // Everything else can be switched.
    for (const key of ["admissionNumber", "firstName", "lastName", "rollNumber", "fatherOccupation", "aadhaarNumber", "religion", "bloodGroup", "area", "lastClass", "tcNumber"]) {
      expect(infoOf(key, []).locked, `${key} is not locked`).toBe(false);
    }
  });

  it("the address and the previous school are fixed (no switch for the school), the others are the school's to decide", () => {
    for (const key of ["address", "city", "state", "pincode"]) expect(infoOf(key, []).need, key).toMatchObject({ kind: "fixed", label: "Always" });
    expect(infoOf("previousSchool", []).need).toMatchObject({ kind: "fixed", label: "Class 1–12", title: expect.stringContaining("Nursery, LKG, UKG") });
    expect(infoOf("category", []).need).toEqual({ kind: "rule", rule: "category" });
    expect(infoOf("motherName", []).need).toEqual({ kind: "rule", rule: "secondParent" });
    expect(infoOf("lastClass", []).need).toEqual({ kind: "rule", rule: "previousSchoolLastClass" });
    // A fixed detail has no Mandatory to change.
    const draft = draftOf(fresh());
    expect(setMandatory(draft, "address", false)).toBe(draft);
  });

  it("each field says what its Mandatory is", () => {
    expect(infoOf("religion", []).need).toEqual({ kind: "rule", rule: "religion" });
    expect(infoOf("gender", []).need).toEqual({ kind: "always" });
    expect(infoOf("age", []).need).toEqual({ kind: "auto" });
    expect(infoOf("rollNumber", []).need).toEqual({ kind: "optional" });
    expect(infoOf("studentName", []).locked).toBe(true);
    expect(infoOf("c_house1", [HOUSE])).toMatchObject({ heading: "House", group: OWN_GROUP, need: { kind: "custom" }, locked: false });
  });
});

describe("where the fields go on Add student, kept with the list", () => {
  it("the draft of what is saved carries the saved places", () => {
    const moved = effectivePlacements([{ key: "pen", step: "academic" }], [HOUSE]);
    const draft = draftOf({ ...fresh([HOUSE]), placements: moved, placementsAreDefault: false });
    expect(draft.placements).toEqual(moved);
  });

  it("a new own field is asked where it was added (More details unless said), a deleted one leaves its place", () => {
    const draft = draftOf(fresh());
    const more = addCustom(draft, HOUSE);
    expect(more.placements.at(-1)).toEqual({ key: "c_house1", step: "more" });
    const academic = addCustom(draft, HOUSE, "academic");
    expect(academic.placements.at(-1)).toEqual({ key: "c_house1", step: "academic" });
    expect(removeCustom(academic, "c_house1").placements.some((p) => p.key === "c_house1")).toBe(false);
    expect(removeCustom(academic, "c_house1").placements).toEqual(draft.placements);
  });

  it("another place for a field is a change; the same places are not", () => {
    const draft = draftOf(fresh([HOUSE]));
    expect(sameDraft(draft, setPlacements(draft, [...draft.placements]))).toBe(true);
    expect(sameDraft(draft, setPlacements(draft, placeIn(draft.placements, "c_house1", "academic")))).toBe(false);
  });

  it("back to the default puts every detail in its usual step and keeps the school's own fields", () => {
    const draft = draftOf({ ...fresh([HOUSE]), placements: effectivePlacements([{ key: "c_house1", step: "personal" }], [HOUSE]), placementsAreDefault: false });
    expect(defaultDraft([HOUSE]).placements).toEqual(effectivePlacements(null, [HOUSE]));
    expect(sameDraft(draft, defaultDraft([HOUSE]))).toBe(false);
  });
});

describe("the school's own steps, kept with the list", () => {
  it("the draft of what is saved carries the saved steps; a school that has added none has More details alone", () => {
    expect(draftOf(fresh()).steps).toEqual([{ key: "more", name: "More details" }]);
    const own = [{ key: "more", name: "More details" }, { key: "s_health1", name: "Health" }];
    expect(draftOf({ ...fresh(), steps: own, stepsAreDefault: false }).steps).toEqual(own);
  });

  it("a step is added after the others, with the name tidied; a name with a problem adds nothing", () => {
    const draft = draftOf(fresh());
    const next = addStep(draft, "  Health   check ");
    expect(next.steps.map((s) => s.name)).toEqual(["More details", "Health check"]);
    expect(next.steps[1].key).toMatch(/^s_[a-z0-9]{4,16}$/);
    expect(addStep(draft, "x")).toBe(draft);
    expect(addStep(draft, "parents")).toBe(draft);
    expect(addStep(next, "HEALTH CHECK")).toBe(next);
  });

  it("a school can add 4 steps, not more", () => {
    let draft = draftOf(fresh());
    for (const name of ["One step", "Two step", "Three step", "Four step"]) draft = addStep(draft, name);
    expect(draft.steps).toHaveLength(5);
    expect(addStep(draft, "Five step")).toBe(draft);
  });

  it("says what is wrong with a step's name in the server's words; a name is free for the step that has it", () => {
    const steps = [{ key: "more", name: "More details" }, { key: "s_health1", name: "Health" }];
    expect(stepNameProblem("x", steps)).toBe("The name of a step is 2 to 30 characters");
    expect(stepNameProblem("y".repeat(31), steps)).toBe("The name of a step is 2 to 30 characters");
    expect(stepNameProblem("<b>Hi</b>", steps)).toBe("The name cannot contain < or >");
    expect(stepNameProblem("academic", steps)).toBe("There is already a step called Academic");
    expect(stepNameProblem("more details", steps)).toBe("There is already a step called More details");
    expect(stepNameProblem("health", steps)).toBe("There is already a step called Health");
    expect(stepNameProblem("health", steps, "s_health1")).toBeUndefined();
    expect(stepNameProblem("Documents", steps)).toBeUndefined();
  });

  it("a step is renamed (More details keeps its name); a name with a problem changes nothing", () => {
    const draft = addStep(draftOf(fresh()), "Health");
    const key = draft.steps[1].key;
    expect(renameStep(draft, key, "Medical").steps[1].name).toBe("Medical");
    expect(renameStep(draft, key, "x")).toBe(draft);
    expect(renameStep(draft, "more", "Extras")).toBe(draft);
  });

  it("a step taken out sends its details to More details; More details cannot be taken out", () => {
    let draft = addStep(draftOf(fresh()), "Health");
    const key = draft.steps[1].key;
    draft = setPlacements(draft, placeIn(draft.placements, "medicalNotes", key));
    const gone = removeStep(draft, key);
    expect(gone.steps.map((s) => s.key)).toEqual(["more"]);
    expect(gone.placements.find((p) => p.key === "medicalNotes")?.step).toBe("more");
    expect(gone.placements.some((p) => p.step === key)).toBe(false);
    expect(removeStep(draft, "more")).toBe(draft);
  });

  it("a step goes one place earlier or later among those after Parents; the ends stay put", () => {
    let draft = addStep(addStep(draftOf(fresh()), "Health"), "Documents");
    const [, health, docs] = draft.steps.map((s) => s.key);
    draft = moveStep(draft, docs, -1);
    expect(draft.steps.map((s) => s.name)).toEqual(["More details", "Documents", "Health"]);
    draft = moveStep(draft, "more", 1);
    expect(draft.steps.map((s) => s.name)).toEqual(["Documents", "More details", "Health"]);
    expect(moveStep(draft, docs, -1)).toBe(draft);
    expect(moveStep(draft, health, 1)).toBe(draft);
  });

  it("two drafts differ when the steps do; back to the default puts More details alone, the Excel alone keeps the steps", () => {
    const a = draftOf(fresh());
    const b = addStep(a, "Health");
    expect(sameDraft(a, b)).toBe(false);
    expect(defaultDraft([]).steps).toEqual([{ key: "more", name: "More details" }]);
    expect(sameDraft(defaultDraft([]), a)).toBe(true);
    expect(defaultColumnsDraft(b).steps).toEqual(b.steps);
  });
});
