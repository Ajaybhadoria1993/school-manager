import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_LAYOUT, DEFAULT_FIELD_RULES, EXPORT_COLUMNS, type CustomFieldDef } from "../../constants/studentFields";
import type { StudentSettings } from "../../types";
import {
  OWN_GROUP,
  addCustom,
  addStudentLabel,
  columnLetters,
  defaultDraft,
  defaultLayout,
  dragRow,
  draftOf,
  editCustom,
  infoOf,
  isDefaultLayout,
  layoutOf,
  layoutProblems,
  missingForUpload,
  moveColumn,
  removeCustom,
  renameRow,
  sameDraft,
  setMandatory,
  stepRow,
  switchRow,
} from "../exportLayout";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };
const FEE: CustomFieldDef = { key: "c_fee001", label: "Fee paid", type: "yesNo", options: [], mode: "optional" };

/** The settings of a new school (nothing saved yet), with the school's own fields given. */
const fresh = (customFields: CustomFieldDef[] = []): StudentSettings => ({
  fields: DEFAULT_FIELD_RULES,
  customFields,
  exportColumns: defaultLayout(),
  exportIsDefault: true,
  updatedAt: null,
});
const keysOn = (draft: ReturnType<typeof draftOf>) => layoutOf(draft).map((c) => c.key);
const place = (draft: ReturnType<typeof draftOf>, key: string) => draft.rows.findIndex((r) => r.key === key);

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

describe("one list for the form and the Excel", () => {
  it("shows the layout's columns first (on), then every other field of the list and the school's own (off)", () => {
    const draft = draftOf(fresh([HOUSE]));
    expect(keysOn(draft)).toEqual(DEFAULT_EXPORT_LAYOUT);
    expect(draft.rows).toHaveLength(EXPORT_COLUMNS.length + 1);
    expect(draft.rows.at(-1)).toEqual({ key: "c_house1", on: false, heading: "House" });
    // An own field that is off is not asked.
    expect(draft.custom[0].mode).toBe("hidden");
  });

  it("a field switched off stays where it is, is no column and is not asked; switched on, it is asked (optional)", () => {
    let draft = draftOf(fresh());
    const at = place(draft, "aadhaarNumber");
    draft = switchRow(draft, "aadhaarNumber", false);
    expect(place(draft, "aadhaarNumber")).toBe(at);
    expect(keysOn(draft)).not.toContain("aadhaarNumber");
    expect(draft.rules.aadhaarNumber).toBe("hidden");
    draft = switchRow(draft, "religion", true);
    expect(keysOn(draft)).toContain("religion");
    expect(draft.rules.religion).toBe("optional");
  });

  it("a field switched on with an emptied heading gets its usual heading back", () => {
    let draft = renameRow(draftOf(fresh()), "religion", "  ");
    draft = switchRow(draft, "religion", true);
    expect(layoutOf(draft).find((c) => c.key === "religion")?.heading).toBe("Religion");
  });

  it("both parents are never 'not asked': the mother's name off makes the second parent optional", () => {
    const draft = switchRow(draftOf(fresh()), "motherName", false);
    expect(draft.rules.secondParent).toBe("optional");
  });

  it("the two occupation columns are one setting: off only when both are off", () => {
    let draft = switchRow(draftOf(fresh()), "fatherOccupation", false);
    expect(draft.rules.guardianOccupation).not.toBe("hidden");
    draft = switchRow(draft, "motherOccupation", false);
    expect(draft.rules.guardianOccupation).toBe("hidden");
  });

  it("Mandatory follows the school for its details and its own fields; the software's own needs do not change", () => {
    let draft = switchRow(draftOf(fresh()), "religion", true);
    draft = setMandatory(draft, "religion", true);
    expect(draft.rules.religion).toBe("required");
    expect(setMandatory(draft, "gender", false)).toBe(draft);
    draft = addCustom(draft, HOUSE);
    draft = setMandatory(draft, "c_house1", true);
    expect(draft.custom.find((f) => f.key === "c_house1")?.mode).toBe("required");
  });

  it("a tick (RTE, an own Yes / No) is never mandatory", () => {
    let draft = switchRow(draftOf(fresh()), "rteSeat", true);
    draft = switchRow(setMandatory(draft, "rteSeat", true), "rteSeat", true);
    expect(draft.rules.rteSeat).toBe("optional");
    draft = addCustom(draft, { ...FEE, mode: "required" });
    expect(draft.custom.find((f) => f.key === "c_fee001")?.mode).toBe("optional");
  });

  it("↑ ↓ pass the next field that is on (the ones off in between do not count); the ends stay put", () => {
    let draft = switchRow(draftOf(fresh()), "fatherOccupation", false);
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

  it("a new own field is on, at the end of the file; renamed, a heading that was its name follows it", () => {
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

  it("a deleted own field leaves the list, the file and the school's fields", () => {
    const draft = removeCustom(addCustom(draftOf(fresh()), HOUSE), "c_house1");
    expect(draft.rows.some((r) => r.key === "c_house1")).toBe(false);
    expect(draft.custom).toEqual([]);
  });

  it("two drafts are the same when they would be saved the same (headings tidied)", () => {
    const a = draftOf(fresh());
    expect(sameDraft(a, renameRow(a, "gender", " Gender "))).toBe(true);
    expect(sameDraft(a, renameRow(a, "gender", "Sex"))).toBe(false);
    expect(sameDraft(a, switchRow(a, "religion", true))).toBe(false);
    expect(sameDraft(defaultDraft([]), a)).toBe(true);
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

  it("says what Add student calls a field, and 'not asked' for one that is off and that the school decides about", () => {
    expect(addStudentLabel("studentName", true, [])).toBe("First name + Last name");
    expect(addStudentLabel("studentName", false, [])).toBe("First name + Last name");
    expect(addStudentLabel("firstName", false, [])).toBe("First name");
    expect(addStudentLabel("dateOfBirth", true, [])).toBe("Date of birth");
    expect(addStudentLabel("fatherOccupation", true, [])).toBe("Father · Occupation");
    expect(addStudentLabel("address", true, [])).toBe("House and street");
    expect(addStudentLabel("previousSchool", true, [])).toBe("Previous school · School name");
    expect(addStudentLabel("age", true, [])).toBe("shown from the date of birth");
    expect(addStudentLabel("admissionNumber", true, [])).toBe("made when you press Admit");
    expect(addStudentLabel("religion", true, [])).toBe("Religion");
    expect(addStudentLabel("religion", false, [])).toBe("not asked");
    // Roll number and the guardian's boxes are on the form whatever the Excel has.
    expect(addStudentLabel("rollNumber", false, [])).toBe("Roll number");
    expect(addStudentLabel("guardianName", false, [])).toBe("Guardian · Full name");
    // The school's own field has the name the school gave it.
    expect(addStudentLabel("c_house1", true, [HOUSE])).toBe("House");
    expect(addStudentLabel("c_house1", false, [HOUSE])).toBe("not asked");
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
