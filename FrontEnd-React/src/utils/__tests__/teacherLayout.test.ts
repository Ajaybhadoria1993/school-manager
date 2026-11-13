import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "../../constants/studentFields";
import { DEFAULT_TEACHER_RULES } from "../../constants/teacherFields";
import type { TeacherSettings } from "../../types";
import {
  addTeacherCustom,
  columnIsMandatory,
  defaultTeacherColumnsDraft,
  defaultTeacherDraft,
  defaultTeacherLayout,
  editTeacherCustom,
  infoOf,
  isDefaultTeacherLayout,
  removeTeacherCustom,
  renameTeacherRow,
  sameTeacherDraft,
  setTeacherAsked,
  setTeacherMandatory,
  setTeacherRequired,
  stepTeacherRow,
  switchTeacherRow,
  teacherDraftOf,
  teacherLayoutOf,
} from "../teacherLayout";

const PAN: CustomFieldDef = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "optional" };
const HOUSE: CustomFieldDef = { key: "c_house001", label: "House Duty", type: "yesNo", options: [], mode: "optional" };

const settings = (patch: Partial<TeacherSettings> = {}): TeacherSettings => ({
  fields: { ...DEFAULT_TEACHER_RULES },
  customFields: [],
  exportColumns: defaultTeacherLayout([]),
  exportIsDefault: true,
  ...patch,
});
const keys = (draft: ReturnType<typeof teacherDraftOf>) => teacherLayoutOf(draft).map((c) => c.key);

describe("a new school's teacher Excel", () => {
  it("is the usual columns, the own fields it asks, then the ones that only say more", () => {
    expect(defaultTeacherLayout([]).map((c) => c.key)).toEqual([
      "name", "mobile", "gender", "dateOfBirth", "email", "address", "city", "state", "pincode", "employeeCode", "designation", "qualification",
      "experienceYears", "joiningDate", "employmentType", "subjects", "username", "status", "classTeacherOf", "given",
    ]);
    const withOwn = defaultTeacherLayout([PAN, { ...HOUSE, mode: "hidden" }]).map((c) => c.key);
    expect(withOwn.slice(-4)).toEqual(["c_pan00001", "status", "classTeacherOf", "given"]);
    expect(withOwn).not.toContain("c_house001");
  });

  it("is recognised as the default layout (so saving it sends no layout of its own)", () => {
    expect(isDefaultTeacherLayout(defaultTeacherLayout([PAN]), [PAN])).toBe(true);
    expect(isDefaultTeacherLayout(defaultTeacherLayout([]).slice(0, 5), [])).toBe(false);
  });
});

describe("the page's draft", () => {
  it("shows the saved columns first (on, in the school's order) and every other column and own field after them, off", () => {
    const draft = teacherDraftOf(
      settings({
        customFields: [PAN],
        exportColumns: [
          { key: "mobile", heading: "Phone" },
          { key: "name", heading: "Name" },
        ],
      })
    );
    expect(draft.rows.slice(0, 2)).toEqual([
      { key: "mobile", on: true, heading: "Phone" },
      { key: "name", on: true, heading: "Name" },
    ]);
    expect(draft.rows.length).toBe(20 + 1);
    expect(draft.rows.slice(2).every((r) => !r.on)).toBe(true);
    expect(draft.rows.at(-1)).toEqual({ key: "c_pan00001", on: false, heading: "PAN Number" });
  });

  it("says what each column's Mandatory is: the school's decision, always, or made by the software", () => {
    expect(infoOf("dateOfBirth", []).need).toEqual({ kind: "rule", rule: "dateOfBirth" });
    expect(infoOf("address", []).need).toEqual({ kind: "rule", rule: "address" });
    for (const key of ["name", "mobile", "gender", "username"]) expect(infoOf(key, []).need.kind, key).toBe("always");
    for (const key of ["status", "classTeacherOf", "given"]) expect(infoOf(key, []).need.kind, key).toBe("auto");
    expect(infoOf("c_pan00001", [PAN])).toMatchObject({ heading: "PAN Number", group: "Your own", need: { kind: "custom" } });
    expect(infoOf("name", []).locked).toBe(true);
    expect(infoOf("gender", []).locked).toBe(false);
  });
});

describe("one Mandatory for the form and the Excel", () => {
  it("makes a detail mandatory and brings its column into the file; optional lets the column go again", () => {
    const out = switchTeacherRow(teacherDraftOf(settings()), "dateOfBirth", false);
    expect(keys(out)).not.toContain("dateOfBirth");
    const needed = setTeacherRequired(out, { kind: "rule", rule: "dateOfBirth" }, true);
    expect(needed.rules.dateOfBirth).toBe("required");
    expect(keys(needed)).toContain("dateOfBirth");
    expect(columnIsMandatory(needed, "dateOfBirth")).toBe(true);
    // The same switch from the Excel's list.
    expect(setTeacherMandatory(out, "dateOfBirth", true).rules.dateOfBirth).toBe("required");

    const optional = setTeacherRequired(needed, { kind: "rule", rule: "dateOfBirth" }, false);
    expect(optional.rules.dateOfBirth).toBe("optional");
    expect(columnIsMandatory(optional, "dateOfBirth")).toBe(false);
  });

  it("does not let a mandatory column, or the name and the mobile number, leave the file", () => {
    const draft = setTeacherRequired(teacherDraftOf(settings()), { kind: "rule", rule: "email" }, true);
    expect(switchTeacherRow(draft, "email", false)).toBe(draft);
    expect(switchTeacherRow(draft, "name", false)).toBe(draft);
    expect(switchTeacherRow(draft, "mobile", false)).toBe(draft);
    expect(keys(switchTeacherRow(draft, "qualification", false))).not.toContain("qualification");
  });

  it("never makes a yes / no tick mandatory, and leaves a column the school does not decide about as it is", () => {
    const draft = addTeacherCustom(teacherDraftOf(settings()), HOUSE);
    expect(setTeacherRequired(draft, { kind: "custom", key: "c_house001" }, true)).toBe(draft);
    expect(setTeacherMandatory(draft, "username", true)).toBe(draft);
    expect(setTeacherMandatory(draft, "status", true)).toBe(draft);
  });

  it("asks a detail or not without touching the Excel; not asked is not mandatory", () => {
    const draft = setTeacherRequired(teacherDraftOf(settings()), { kind: "rule", rule: "qualification" }, true);
    const off = setTeacherAsked(draft, { kind: "rule", rule: "qualification" }, false);
    expect(off.rules.qualification).toBe("hidden");
    expect(keys(off)).toContain("qualification");
    const back = setTeacherAsked(off, { kind: "rule", rule: "qualification" }, true);
    expect(back.rules.qualification).toBe("optional");
    expect(setTeacherAsked(draft, { kind: "rule", rule: "qualification" }, true).rules.qualification).toBe("required");
  });
});

describe("arranging the Excel", () => {
  it("moves a column past the next one that is in the file (the ones out, in between, do not count)", () => {
    let draft = teacherDraftOf(settings());
    draft = switchTeacherRow(draft, "email", false);
    const moved = stepTeacherRow(draft, "dateOfBirth", 1);
    expect(keys(moved).slice(2, 5)).toEqual(["gender", "address", "dateOfBirth"]);
    expect(stepTeacherRow(draft, "name", -1)).toBe(draft);
    expect(stepTeacherRow(draft, "given", 1)).toBe(draft);
  });

  it("renames a heading in the file", () => {
    const draft = renameTeacherRow(teacherDraftOf(settings()), "subjects", "Teaches");
    expect(teacherLayoutOf(draft).find((c) => c.key === "subjects")?.heading).toBe("Teaches");
  });

  it("goes back to a new school's columns, keeping what is mandatory and the form as it is", () => {
    let draft = teacherDraftOf(settings({ customFields: [PAN] }));
    draft = setTeacherRequired(draft, { kind: "rule", rule: "qualification" }, true);
    draft = switchTeacherRow(renameTeacherRow(draft, "email", "Mail"), "city", false);
    const back = defaultTeacherColumnsDraft(draft);
    expect(teacherLayoutOf(back)).toEqual(defaultTeacherLayout([PAN]));
    expect(back.rules.qualification).toBe("required");
  });

  it("goes back to a new school's form and Excel, the own fields kept but not asked", () => {
    const draft = setTeacherRequired(teacherDraftOf(settings({ customFields: [PAN] })), { kind: "rule", rule: "email" }, true);
    const back = defaultTeacherDraft(draft.custom);
    expect(back.rules).toEqual(DEFAULT_TEACHER_RULES);
    expect(back.custom).toEqual([{ ...PAN, mode: "hidden" }]);
    expect(keys(back)).not.toContain("c_pan00001");
    expect(sameTeacherDraft(back, defaultTeacherDraft(back.custom))).toBe(true);
    expect(sameTeacherDraft(draft, back)).toBe(false);
  });
});

describe("the school's own fields in the draft", () => {
  it("adds a field as a column before the ones that only say more, changes it, and deletes it", () => {
    let draft = addTeacherCustom(teacherDraftOf(settings()), PAN);
    expect(keys(draft).slice(-4)).toEqual(["c_pan00001", "status", "classTeacherOf", "given"]);
    expect(draft.custom).toEqual([PAN]);

    draft = editTeacherCustom(draft, { ...PAN, label: "PAN", mode: "required" });
    expect(draft.rows.find((r) => r.key === "c_pan00001")).toEqual({ key: "c_pan00001", on: true, heading: "PAN" });
    expect(columnIsMandatory(draft, "c_pan00001")).toBe(true);
    // A heading the school typed itself does not follow the name.
    const typed = editTeacherCustom(renameTeacherRow(addTeacherCustom(teacherDraftOf(settings()), PAN), "c_pan00001", "Permanent account"), { ...PAN, label: "PAN" });
    expect(typed.rows.find((r) => r.key === "c_pan00001")?.heading).toBe("Permanent account");

    const gone = removeTeacherCustom(draft, "c_pan00001");
    expect(gone.custom).toEqual([]);
    expect(keys(gone)).not.toContain("c_pan00001");
  });

  it("saves a yes / no as optional even when it is sent as mandatory", () => {
    const draft = addTeacherCustom(teacherDraftOf(settings()), { ...HOUSE, mode: "required" });
    expect(draft.custom[0].mode).toBe("optional");
  });
});
