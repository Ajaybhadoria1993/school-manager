import { describe, expect, it } from "vitest";
import type { CustomFieldDef } from "../../constants/studentFields";
import {
  assignTeacherColumn,
  autoMapTeachers,
  emptyTeacherMapping,
  newFieldCandidates,
  normaliseOwnCell,
  ownColumnsOf,
  prepareTeacherRow,
  serverTeacherProblem,
  teacherFieldsByColumn,
  type TeacherImportField,
  type TeacherMapping,
} from "../teacherImport";

// The school's own fields (2026-11-07): columns of a file that are not among the usual details.
const own = (key: string, label: string, type: CustomFieldDef["type"], extra: Partial<CustomFieldDef> = {}): CustomFieldDef => ({ key, label, type, options: [], mode: "optional", ...extra });
const PAN = own("c_pan00001", "PAN Number", "text");
const BLOOD = own("c_blood001", "Blood Group", "choice", { options: ["A+", "B+", "O+"] });
const HOUSE = own("c_house001", "House Duty", "yesNo");
const SINCE = own("c_since001", "Member Since", "date");
const KIDS = own("c_kids0001", "Children", "number");
const NEEDED = own("c_aadhaar1", "Aadhaar Number", "text", { mode: "required" });

const mappingOf = (fields: TeacherImportField[]): TeacherMapping => fields.reduce((m, f, i) => assignTeacherColumn(m, i, f), emptyTeacherMapping());

describe("the school's own fields as columns of a file", () => {
  it("finds a column by the name of a field (the sample file and the export write them), and not one already read as something else", () => {
    const headers = ["Name", "Mobile", "pan number", "Blood  Group", "Remarks"];
    expect(ownColumnsOf(headers, [PAN, BLOOD, HOUSE], new Set([0, 1]))).toEqual({ c_pan00001: 2, c_blood001: 3 });
    expect(ownColumnsOf(headers, [PAN], new Set([0, 1, 2]))).toEqual({});
    const mapping = autoMapTeachers(headers);
    expect(teacherFieldsByColumn(mapping, 5, { c_pan00001: 2, c_blood001: 3 })).toEqual(["name", "mobile", "c_pan00001", "c_blood001", null]);
  });

  const row = (cells: string[], columns: Record<string, number>, defs: CustomFieldDef[], known: string[] = []) =>
    prepareTeacherRow({ row: 3, cells }, mappingOf(["name", "mobile"]), new Set(known), defs.flatMap((field) => (columns[field.key] === undefined ? [] : [{ field, column: columns[field.key] }])));

  it("reads each answer by the kind of its field and sends them by key", () => {
    const p = row(
      ["Meena", "9876543210", " abcde1234f ", "b+", "yes", "14/5/2015", "2", ""],
      { c_pan00001: 2, c_blood001: 3, c_house001: 4, c_since001: 5, c_kids0001: 6, c_aadhaar1: 7 },
      [PAN, BLOOD, HOUSE, SINCE, KIDS, NEEDED]
    );
    expect(p.problems).toEqual([]);
    expect(p.input.teacher.custom).toEqual({ c_pan00001: "abcde1234f", c_blood001: "B+", c_house001: true, c_since001: "2015-05-14", c_kids0001: 2 });
  });

  it("never stops a row for an answer it lacks (a needed field too), and sends no answers when the file has none", () => {
    const p = row(["Meena", "9876543210", ""], { c_aadhaar1: 2 }, [NEEDED]);
    expect(p.problems).toEqual([]);
    expect(p.input.teacher).not.toHaveProperty("custom");
  });

  it("says what is wrong with an answer, in the words of the form, in the box of its field", () => {
    const p = row(["Meena", "9876543210", "Z+", "maybe", "31-02-2015", "many"], { c_blood001: 2, c_house001: 3, c_since001: 4, c_kids0001: 5 }, [BLOOD, HOUSE, SINCE, KIDS]);
    expect(p.problems.map((x) => [x.label, x.message, x.fields])).toEqual([
      ["Blood Group", "Choose the Blood Group from the list", ["c_blood001"]],
      ["House Duty", "Say yes or no", ["c_house001"]],
      ["Member Since", "Choose a valid date for Member Since", ["c_since001"]],
      ["Children", "Enter a number for Children", ["c_kids0001"]],
    ]);
  });

  it("shapes an answer as it is kept in the box", () => {
    expect(normaliseOwnCell(BLOOD, "o+")).toBe("O+");
    expect(normaliseOwnCell(BLOOD, "Z+")).toBe("Z+");
    expect(normaliseOwnCell(HOUSE, "Y")).toBe("Yes");
    expect(normaliseOwnCell(HOUSE, "nahi")).toBe("No");
    expect(normaliseOwnCell(HOUSE, "maybe")).toBe("maybe");
    expect(normaliseOwnCell(SINCE, "2015-05-14")).toBe("14-05-2015");
    expect(normaliseOwnCell(KIDS, " 2.0 ")).toBe("2");
    expect(normaliseOwnCell(PAN, "  ab   cd ")).toBe("ab cd");
  });

  it("puts a refusal of the server in the box of its field", () => {
    expect(serverTeacherProblem("custom.c_blood001", "Choose the Blood Group from the list", [BLOOD])).toEqual({ label: "Blood Group", message: "Choose the Blood Group from the list", fields: ["c_blood001"] });
    expect(serverTeacherProblem("custom.c_gone0001", "This is not one of your school's fields", [BLOOD])).toEqual({ label: "Row", message: "This is not one of your school's fields", fields: [] });
  });
});

describe("the columns of a file that are not uploaded", () => {
  it("are offered as new fields of the school's own, named as the file names them (once each; no blank, generic or taken name)", () => {
    const headers = ["Name", "Mobile", "Blood Group", "pan no", "Column E", "", "Designation", "Blood group", "Remarks"];
    const byColumn = ["name", "mobile", null, null, null, null, "designation", null, null];
    expect(newFieldCandidates(headers, byColumn, [PAN]).map((c) => [c.column, c.title])).toEqual([
      [2, "Blood Group"],
      [3, "pan no"],
      [8, "Remarks"],
    ]);
    // A name the list has is never offered; a name the school has made already is not offered again.
    expect(newFieldCandidates(["Mobile", "PAN Number", "Gender"], [null, null, null], [PAN]).map((c) => c.title)).toEqual([]);
  });
});
