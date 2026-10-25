import { describe, expect, it } from "vitest";
import { STATES } from "../../constants/schoolOptions";
import { GENDERS } from "../../constants/students";
import { DEFAULT_FIELD_RULES, type CustomFieldDef, type FieldRules } from "../../constants/studentFields";
import type { AcademicStructure, ClassItem, ExportColumn } from "../../types";
import {
  ADMISSION_NUMBER_MESSAGE,
  assignColumn,
  autoMap,
  columnChoices,
  columnsToAdd,
  crossCheck,
  emptyMapping,
  fieldsByColumn,
  fieldsOf,
  fileProblem,
  headerKey,
  labelOf,
  matchClass,
  normaliseBloodGroup,
  normaliseCategory,
  normaliseDay,
  normaliseDisability,
  normaliseGender,
  normaliseMobile,
  normaliseReligion,
  normaliseState,
  normaliseYesNo,
  ownColumnsOf,
  prepareRow,
  problemOf,
  problemsCsv,
  typedTableFields,
  type OwnColumn,
} from "../studentImport";

// ---- A school: pre-primary classes, Class 1 (no sections), Class 5 (A, B), Class 6 (A), Class 10 and 11 -----------------------

const klass = (id: string, name: string, order: number, sections: string[] = []): ClassItem => ({
  id,
  name,
  order,
  departmentId: null,
  sections: sections.map((s) => ({ id: `${id}-${s}`, classId: id, name: s, capacity: 40, room: null })),
});
const CLASSES: ClassItem[] = [
  klass("nur", "Nursery", 1),
  klass("lkg", "LKG", 2),
  klass("ukg", "UKG", 3),
  klass("c1", "Class 1", 4),
  klass("c5", "Class 5", 8, ["A", "B"]),
  klass("c6", "Class 6", 9, ["A"]),
  klass("c10", "Class 10", 13),
  klass("c11", "Class 11", 14),
];
const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: CLASSES,
  totals: { departments: 0, classes: CLASSES.length, sections: 3, seats: 120 },
};

// ---- A school's own sheet, as schools keep them ------------------------------------------------------------------------------

const HEADERS = ["S.No", "Adm No", "Student Name", "Class", "Sec", "Gender", "DOB", "Father Name", "Mobile No", "Mother Name", "Address", "Village", "Pin", "Blood Group", "State", "Previous School"];
/** The columns of the address and the previous school, for a file that has them (the others have them added empty when it opens). */
const ADDRESS_COLUMNS = ["Address", "Village", "State", "Pin", "Previous School"];
type Title = (typeof HEADERS)[number];
/** One row of the sheet: the cells named by their titles, the rest empty. */
const sheetRow = (row: number, values: Partial<Record<Title, string>>, headers: readonly string[] = HEADERS) => ({ row, cells: headers.map((h) => values[h] ?? "") });
const AARAV: Partial<Record<Title, string>> = {
  "S.No": "1",
  "Adm No": "2019/45",
  "Student Name": "Aarav Kumar Sharma",
  Class: "V",
  Sec: "a",
  Gender: "M",
  DOB: "14-05-2016",
  "Father Name": "Ramesh Sharma",
  "Mobile No": "+91 98765 43210",
  "Mother Name": "Sunita Sharma",
  Address: "12 MG Road",
  Village: "Bhopal",
  Pin: "462 001",
  "Blood Group": "B +ve",
  State: "MP",
  "Previous School": "Little Flower School",
};
const MAPPING = autoMap(HEADERS);
const prepare = (values: Partial<Record<Title, string>>, row = 4) => prepareRow(sheetRow(row, values), MAPPING, STRUCTURE);
const problemFor = (p: ReturnType<typeof prepare>, field: string) => p.problems.filter((x) => x.fields.includes(field));

// ---- The school's own fields -------------------------------------------------------------------------------------------------

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "required" };
const BUS: CustomFieldDef = { key: "c_bus001", label: "Bus pass no.", type: "text", options: [], mode: "optional" };
const FEE: CustomFieldDef = { key: "c_fee001", label: "Fee paid", type: "yesNo", options: [], mode: "optional" };
const HEIGHT: CustomFieldDef = { key: "c_hgt001", label: "Height (cm)", type: "number", options: [], mode: "optional" };
const JOINED: CustomFieldDef = { key: "c_join01", label: "Hostel from", type: "date", options: [], mode: "optional" };
const ROUTE: CustomFieldDef = { key: "c_route1", label: "Route", type: "text", options: [], mode: "optional" };

describe("column titles", () => {
  it("are compared without case, spaces, punctuation or the * of a needed column", () => {
    expect(headerKey("Father's Mobile *")).toBe("fathersmobile");
    expect(headerKey("  D.O.B. ")).toBe("dob");
    expect(headerKey("Aadhar No")).toBe("aadharno");
  });
});

describe("values are read as a person writes them", () => {
  it("days: day first as in India, any separator, two-digit years, month names, ISO, Excel day numbers", () => {
    expect(normaliseDay("14-05-2016")).toBe("2016-05-14");
    expect(normaliseDay("14/5/16")).toBe("2016-05-14");
    expect(normaliseDay("14.05.2016")).toBe("2016-05-14");
    expect(normaliseDay("2016-05-14")).toBe("2016-05-14");
    expect(normaliseDay("2016/5/14")).toBe("2016-05-14");
    expect(normaliseDay("14 May 2016")).toBe("2016-05-14");
    expect(normaliseDay("14-may-2016")).toBe("2016-05-14");
    expect(normaliseDay("01-01-25")).toBe("2025-01-01");
    expect(normaliseDay("01-01-95")).toBe("1995-01-01");
    // A sheet set to US dates: the second number cannot be a month.
    expect(normaliseDay("5/14/2016")).toBe("2016-05-14");
    // An Excel day number (a CSV saved from Excel).
    expect(normaliseDay("42504")).toBe("2016-05-14");
  });

  it("days that are not real are passed on as written, so the check can say so", () => {
    expect(normaliseDay("31-02-2015")).toBe("31-02-2015");
    expect(normaliseDay("someday")).toBe("someday");
    expect(normaliseDay("  ")).toBe("");
  });

  it("genders, mobiles, states, blood groups, categories, religions, disabilities and Yes / No", () => {
    expect(["m", "M", "boy", "Male"].map(normaliseGender)).toEqual(["Male", "Male", "Male", "Male"]);
    expect(["f", "Girl", "FEMALE"].map(normaliseGender)).toEqual(["Female", "Female", "Female"]);
    expect(normaliseGender("Other")).toBe("Other");
    expect(normaliseGender(" robot ")).toBe("robot");

    expect(normaliseMobile("+91 98765 43210")).toBe("9876543210");
    expect(normaliseMobile("919876543210")).toBe("9876543210");
    expect(normaliseMobile("09876543210")).toBe("9876543210");
    expect(normaliseMobile("9876543210.0")).toBe("9876543210");
    expect(normaliseMobile("98765-43210")).toBe("9876543210");
    expect(normaliseMobile("12345")).toBe("12345");

    expect(normaliseState("MP")).toBe("Madhya Pradesh");
    expect(normaliseState("m.p.")).toBe("Madhya Pradesh");
    expect(normaliseState("madhya pradesh")).toBe("Madhya Pradesh");
    expect(normaliseState("Orissa")).toBe("Odisha");
    expect(normaliseState("Jammu & Kashmir")).toBe("Jammu and Kashmir");
    expect(normaliseState("Narnia")).toBe("Narnia");

    expect(normaliseBloodGroup("B +ve")).toBe("B+");
    expect(normaliseBloodGroup("b positive")).toBe("B+");
    expect(normaliseBloodGroup("AB-ve")).toBe("AB-");
    expect(normaliseBloodGroup("o neg")).toBe("O-");
    expect(normaliseBloodGroup("Z+")).toBe("Z+");

    expect(normaliseCategory("gen")).toBe("General");
    expect(normaliseCategory("UR")).toBe("General");
    expect(normaliseCategory("obc")).toBe("OBC");

    expect(normaliseReligion("islam")).toBe("Muslim");
    expect(normaliseReligion("hindu")).toBe("Hindu");
    expect(normaliseDisability("nil")).toBe("None");
    expect(normaliseDisability("NA")).toBe("None");

    expect(["Yes", "y", "haan", "1", "TRUE", "Yes."].map(normaliseYesNo)).toEqual([true, true, true, true, true, true]);
    expect(["", "No", "n", "nahi", "0", "-"].map(normaliseYesNo)).toEqual([false, false, false, false, false, false]);
    expect(normaliseYesNo("maybe")).toBeNull();
  });

  it('reads "J&K", as forms write it, as Jammu and Kashmir', () => {
    expect(normaliseState("J&K")).toBe("Jammu and Kashmir");
    expect(normaliseState("J & K")).toBe("Jammu and Kashmir");
  });
});

describe("a class of the file is matched to a class of the school", () => {
  it('by its number in any spelling: "V", "5th", "Std 5", "Class-5", "X", "XI"', () => {
    for (const value of ["V", "5th", "Std 5", "Class-5", "class 5", "5", "Grade 5"]) expect(matchClass(value, CLASSES), value).toEqual({ classId: "c5", sectionId: null });
    expect(matchClass("X", CLASSES)?.classId).toBe("c10");
    expect(matchClass("10th", CLASSES)?.classId).toBe("c10");
    expect(matchClass("XI", CLASSES)?.classId).toBe("c11");
    expect(matchClass("I", CLASSES)?.classId).toBe("c1");
  });

  it("pre-primary classes by their usual names", () => {
    expect(matchClass("KG 1", CLASSES)?.classId).toBe("lkg");
    expect(matchClass("Jr KG", CLASSES)?.classId).toBe("lkg");
    expect(matchClass("U.K.G.", CLASSES)?.classId).toBe("ukg");
    expect(matchClass("nur", CLASSES)?.classId).toBe("nur");
  });

  it('with the section in the same cell: "5-A", "V B", "Class 5 - A"', () => {
    expect(matchClass("5-A", CLASSES)).toEqual({ classId: "c5", sectionId: "c5-A" });
    expect(matchClass("V B", CLASSES)).toEqual({ classId: "c5", sectionId: "c5-B" });
    expect(matchClass("Class 5 - A", CLASSES)).toEqual({ classId: "c5", sectionId: "c5-A" });
  });

  it("is nothing for a class the school does not have", () => {
    expect(matchClass("Class 9", CLASSES)).toBeNull();
    expect(matchClass("Play group", CLASSES)).toBeNull();
    expect(matchClass("", CLASSES)).toBeNull();
  });

  it('keeps the class when only the section in the cell is not one of its sections ("5-C"): the class is right', () => {
    expect(matchClass("5-C", CLASSES)).toEqual({ classId: "c5", sectionId: null, unknownSection: "C" });
    expect(matchClass("Class 1 A", CLASSES)).toEqual({ classId: "c1", sectionId: null, unknownSection: "A" });
  });

  it('reads an ordinal written apart ("5 th") and a trailing "Std" as part of the class, not as a section', () => {
    expect(matchClass("5 th", CLASSES)).toEqual({ classId: "c5", sectionId: null });
    expect(matchClass("1 st", CLASSES)).toEqual({ classId: "c1", sectionId: null });
    expect(matchClass("5th Std", CLASSES)).toEqual({ classId: "c5", sectionId: null });
    expect(matchClass("V Standard", CLASSES)).toEqual({ classId: "c5", sectionId: null });
    expect(matchClass("5th Std B", CLASSES)).toEqual({ classId: "c5", sectionId: "c5-B" });
  });
});

describe("the columns of a file are recognised by their titles", () => {
  it("a school's own sheet: every usual title, the whole name in one column, an unknown column left out", () => {
    expect(MAPPING).toMatchObject({
      admissionNumber: 1,
      fullName: 2,
      firstName: null,
      lastName: null,
      className: 3,
      sectionName: 4,
      gender: 5,
      dateOfBirth: 6,
      fatherName: 7,
      fatherMobile: 8,
      motherName: 9,
      address: 10,
      city: 11,
      pincode: 12,
      bloodGroup: 13,
      state: 14,
      previousSchool: 15,
    });
    expect(fieldsByColumn(MAPPING, HEADERS.length)[0]).toBeNull();
  });

  it("first and last name columns win over a whole-name column; a parent's own mobile over a plain Mobile", () => {
    const names = autoMap(["First Name", "Last Name", "Name"]);
    expect([names.firstName, names.lastName, names.fullName]).toEqual([0, 1, null]);
    const mobiles = autoMap(["Mobile", "Father's Mobile", "Mother's Mobile"]);
    expect([mobiles.fatherMobile, mobiles.motherMobile]).toEqual([1, 2]);
  });

  it("the school's export headings first, so a file it exported comes back as it is (the age is not read)", () => {
    const layout: ExportColumn[] = [
      { key: "studentName", heading: "Naam" },
      { key: "className", heading: "Kaksha" },
      { key: "fatherMobile", heading: "Contact" },
      { key: "age", heading: "Age" },
    ];
    const mapping = autoMap(["Naam", "Kaksha", "Contact", "Age"], layout);
    expect([mapping.fullName, mapping.className, mapping.fatherMobile]).toEqual([0, 1, 2]);
    expect(fieldsByColumn(mapping, 4)[3]).toBeNull();
  });

  it("a heading of one of the school's own fields stays that field, even when it is also a usual name (Route)", () => {
    const layout: ExportColumn[] = [
      { key: "studentName", heading: "Name" },
      { key: "className", heading: "Class" },
      { key: "c_route1", heading: "Route" },
    ];
    const headers = ["Name", "Class", "Route"];
    const mapping = autoMap(headers, layout);
    expect(mapping.transportRoute).toBeNull();
    const taken = new Set(fieldsByColumn(mapping, 3).flatMap((f, i) => (f ? [i] : [])));
    expect(ownColumnsOf(headers, [ROUTE], layout, taken)).toEqual({ c_route1: 2 });
  });

  it("a column holds one detail: giving it another lets the first go, and a detail moved to another column leaves its old one", () => {
    let mapping = assignColumn(emptyMapping(), 0, "city");
    mapping = assignColumn(mapping, 0, "state");
    expect([mapping.city, mapping.state]).toEqual([null, 0]);
    mapping = assignColumn(mapping, 3, "state");
    expect(mapping.state).toBe(3);
    expect(fieldsByColumn(mapping, 4)).toEqual([null, null, null, "state"]);
    expect(assignColumn(mapping, 3, null).state).toBeNull();
  });
});

describe("the school's own fields in a file", () => {
  it("are found by their name or by their heading in the school's export, once each, never in a column already read", () => {
    expect(ownColumnsOf(["House", "Bus Pass No"], [HOUSE, BUS], [], new Set())).toEqual({ c_house1: 0, c_bus001: 1 });
    expect(ownColumnsOf(["School House"], [HOUSE], [{ key: "c_house1", heading: "School House" }], new Set())).toEqual({ c_house1: 0 });
    expect(ownColumnsOf(["House"], [HOUSE], [], new Set([0]))).toEqual({});
    expect(ownColumnsOf(["Gender"], [HOUSE], [], new Set())).toEqual({});
  });
});

describe("the columns the table adds, empty, when a file lacks what every student needs", () => {
  it("gender, date of birth and a parent's name and mobile, for a file of names and classes (and nothing else: the rest is optional)", () => {
    const headers = ["Name", "Class"];
    expect(columnsToAdd(autoMap(headers), [{ cells: ["Asha Verma", "Class 1"] }], CLASSES)).toEqual(["gender", "dateOfBirth", "fatherName", "fatherMobile"]);
    expect(columnsToAdd(autoMap(headers), [{ cells: ["Asha Verma", "Nursery"] }, { cells: ["Kabir Rao", "LKG"] }], CLASSES)).toEqual(["gender", "dateOfBirth", "fatherName", "fatherMobile"]);
  });

  it("the missing half of a split name, and the class", () => {
    const headers = ["First Name", "Gender", "DOB", "Mobile"];
    expect(columnsToAdd(autoMap(headers), [{ cells: ["Asha", "F", "14-05-2016", "9876543210"] }], CLASSES)).toEqual(["lastName", "className", "fatherName"]);
  });

  it("no address and no previous school column: an old register seldom holds them, so the file is not asked for them", () => {
    const headers = ["Name", "Class", "Gender", "DOB", "Father Name", "Mobile"];
    const mapping = autoMap(headers);
    const row = (klassName: string) => ({ cells: ["Asha Verma", klassName, "F", "14-05-2016", "Ravi Verma", "9876543210"] });
    // Class 6 has a section, so that column is added; the address and the previous school never are.
    expect(columnsToAdd(mapping, [row("Class 6")], CLASSES)).toEqual(["sectionName"]);
    expect(columnsToAdd(mapping, [row("Class 1")], CLASSES)).toEqual([]);
    expect(columnsToAdd(mapping, [row("UKG")], CLASSES)).toEqual([]);
  });

  it("a Section column when a class of the file has sections and no section is given", () => {
    const headers = ["Name", "Class", "Gender", "DOB", "Father Name", "Mobile", ...ADDRESS_COLUMNS];
    const mapping = autoMap(headers);
    const row = (klassName: string) => ({ cells: ["Asha Verma", klassName, "F", "14-05-2016", "Ravi Verma", "9876543210"] });
    expect(columnsToAdd(mapping, [row("Class 1"), row("Class 5")], CLASSES)).toEqual(["sectionName"]);
    expect(columnsToAdd(mapping, [row("Class 1"), row("5-A")], CLASSES)).toEqual([]);
    // A section that is not the class's is fixed in the class cell itself (it says so), not in a new column.
    expect(columnsToAdd(mapping, [row("5-C")], CLASSES)).toEqual([]);
    expect(columnsToAdd(mapping, [row("Class 9")], CLASSES)).toEqual([]);
  });

  it("nothing for a file that has every column", () => {
    expect(columnsToAdd(MAPPING, [sheetRow(4, AARAV)], CLASSES)).toEqual([]);
  });
});

describe("one row of the file as an admission", () => {
  it("cleans every value, matches the class and section, makes the parents guardians, and has nothing to fix", () => {
    const p = prepare(AARAV);
    expect(p.problems).toEqual([]);
    expect(p.warnings).toEqual([]);
    expect(p).toMatchObject({ row: 4, name: "Aarav Kumar Sharma", classLabel: "Class 5 - A", parentLabel: "Ramesh Sharma · 9876543210", classId: "c5", sectionId: "c5-A" });
    expect(p.input.admissionNumber).toBe("2019/45");
    expect(p.input.student).toMatchObject({
      firstName: "Aarav Kumar",
      lastName: "Sharma",
      gender: "Male",
      dateOfBirth: "2016-05-14",
      classId: "c5",
      sectionId: "c5-A",
      bloodGroup: "B+",
      address: { line1: "12 MG Road", city: "Bhopal", pincode: "462001" },
      guardians: [
        { name: "Ramesh Sharma", relation: "Father", isPrimary: true, mobile: "9876543210" },
        { name: "Sunita Sharma", relation: "Mother", isPrimary: false },
      ],
    });
    expect(p.guardianSources).toEqual(["father", "mother"]);
  });

  it("never stops a row for what only the school wants (Aadhaar, the TC number, the occupation...): those are not checked here", () => {
    const p = prepare(AARAV);
    expect(p.problems).toEqual([]);
    const headers = [...HEADERS, "Aadhaar No", "TC No"];
    const odd = prepareRow(sheetRow(4, { ...AARAV, "Aadhaar No": "", "TC No": "" } as never, headers), autoMap(headers), STRUCTURE);
    expect(odd.problems).toEqual([]);
  });

  it("the address and the previous school are never a problem when empty (an old register seldom holds them): the row is ready, whatever the class", () => {
    expect(prepare({ ...AARAV, Address: "", Village: "", Pin: "", State: "" }).problems).toEqual([]);
    for (const klassName of ["Class 1", "Class 5", "Nursery", "LKG", "UKG"]) {
      const p = prepare({ ...AARAV, Class: klassName, Sec: klassName === "Class 5" ? "A" : "", Address: "", "Previous School": "" });
      expect(p.problems, klassName).toEqual([]);
    }
  });

  it("a detail that IS given is still checked and goes with the row: a PIN code of 5 digits is a problem, a previous school is kept", () => {
    expect(prepare({ ...AARAV, Pin: "4620" }).problems).toEqual([{ label: "PIN code", message: "PIN code is 6 digits", fields: ["pincode"] }]);
    expect(prepare(AARAV).input.student.previousSchool).toMatchObject({ name: "Little Flower School" });
  });

  it('a class the school does not have says so in the Class cell, once ("Class 9")', () => {
    const p = prepare({ ...AARAV, Class: "Class 9", Sec: "" });
    expect(problemFor(p, "className")).toEqual([{ label: "Class", message: 'Your school has no "Class 9": type one of your classes', fields: ["className"] }]);
    expect(p.classLabel).toBe("Class 9");
  });

  it("an empty class asks for one", () => {
    const p = prepare({ ...AARAV, Class: "", Sec: "" });
    expect(problemFor(p, "className")).toHaveLength(1);
    expect(p.classLabel).toBe("(no class)");
  });

  it("a class with sections and no section says so in the Section cell (the class is right), once", () => {
    const p = prepare({ ...AARAV, Class: "6", Sec: "" });
    expect(problemFor(p, "className")).toEqual([]);
    expect(p.problems).toEqual([{ label: "Section", message: "Class 6 has sections A: type one", fields: ["sectionName"] }]);
  });

  it("a section that is not the class's says which ones it has", () => {
    const p = prepare({ ...AARAV, Class: "5", Sec: "C" });
    expect(p.problems).toEqual([{ label: "Section", message: 'Class 5 has sections A, B, not "C"', fields: ["sectionName"] }]);
  });

  it('a section in the class cell that is not the class\'s ("5-C") is fixed in that cell, and says which sections there are', () => {
    const p = prepare({ ...AARAV, Class: "5-C", Sec: "" });
    expect(p.problems).toEqual([{ label: "Section", message: 'Class 5 has sections A, B, not "C"', fields: ["className"] }]);
    expect(p.classId).toBe("c5");
  });

  it("a section given for a class without sections is not used, and the row says so", () => {
    const fromColumn = prepare({ ...AARAV, Class: "Class 1", Sec: "A" });
    expect(fromColumn.problems).toEqual([]);
    expect(fromColumn.sectionId).toBeNull();
    expect(fromColumn.warnings).toEqual(["Class 1 has no sections: the section in the file (A) is not used."]);
    const fromCell = prepare({ ...AARAV, Class: "Class 1 A", Sec: "" });
    expect(fromCell.problems).toEqual([]);
    expect(fromCell.classId).toBe("c1");
    expect(fromCell.warnings).toEqual(["Class 1 has no sections: the section in the file (A) is not used."]);
  });

  it("a whole name of one word asks for the last name in the name cell", () => {
    const p = prepare({ ...AARAV, "Student Name": "Riya" });
    expect(problemFor(p, "fullName")).toEqual([expect.objectContaining({ label: "Student name" })]);
  });

  it("a day that is not real, a wrong mobile, a word that is no gender: each in its own cell", () => {
    const p = prepare({ ...AARAV, DOB: "31-02-2015", "Mobile No": "12345", Gender: "robot" });
    expect(problemFor(p, "dateOfBirth")).toHaveLength(1);
    expect(problemFor(p, "fatherMobile")).toEqual([expect.objectContaining({ label: "Father's mobile" })]);
    // The form's gender is a dropdown, so its check never sees a word like this: the table says what to write.
    expect(problemFor(p, "gender")).toEqual([{ label: "Gender", message: "Write Male, Female or Other", fields: ["gender"] }]);
  });

  it("a state, blood group or category that is not on the form's list is a problem here (the server would refuse the row)", () => {
    const headers = [...HEADERS, "Category"];
    const mapping = autoMap(headers);
    const p = prepareRow(sheetRow(4, { ...AARAV, State: "Narnia", "Blood Group": "Z+", Category: "Rich" } as never, headers), mapping, STRUCTURE);
    expect(problemFor(p, "state")).toEqual([{ label: "State", message: "Choose a state from the list", fields: ["state"] }]);
    expect(problemFor(p, "bloodGroup")).toEqual([{ label: "Blood group", message: "Choose a blood group from the list", fields: ["bloodGroup"] }]);
    expect(problemFor(p, "category")).toEqual([{ label: "Category", message: "Choose a category from the list", fields: ["category"] }]);
    // Written the usual ways, they are fine.
    const fine = prepareRow(sheetRow(4, { ...AARAV, State: "MP", "Blood Group": "o +ve", Category: "gen" } as never, headers), mapping, STRUCTURE);
    expect(fine.problems).toEqual([]);
    expect(fine.input.student).toMatchObject({ address: { state: "Madhya Pradesh" }, bloodGroup: "O+", category: "General" });
  });

  it("a row without any parent asks for one with a mobile number", () => {
    const p = prepare({ ...AARAV, "Father Name": "", "Mobile No": "", "Mother Name": "" });
    expect(p.problems).toContainEqual(expect.objectContaining({ label: "Parents", message: "Add at least one parent with a mobile number" }));
  });

  it("a guardian written down as a second Father (or Mother) is a problem in the Guardian's relation cell: a child has one of each", () => {
    const headers = ["Student Name", "Class", "Gender", "DOB", "Father Name", "Mobile No", "Mother Name", "Guardian Name", "Guardian Mobile", "Guardian Relation", ...ADDRESS_COLUMNS];
    const mapping = autoMap(headers);
    const base = { "Student Name": "Asha Verma", Class: "Class 1", Gender: "F", DOB: "14-05-2016", "Father Name": "Ravi Verma", "Mobile No": "9876543210", "Mother Name": "Sita Verma", "Guardian Name": "Mohan Verma", "Guardian Mobile": "9876543211", Address: "12 MG Road", Village: "Bhopal", State: "MP", Pin: "462001", "Previous School": "Little Flower School" };
    const prepareWith = (relation: string) => prepareRow(sheetRow(2, { ...base, "Guardian Relation": relation } as never, headers), mapping, STRUCTURE);
    expect(prepareWith("Father").problems).toEqual([
      { label: "Guardian's relation", message: "A child has only one father: choose Guardian or Other for this one", fields: ["guardianRelation"] },
    ]);
    expect(prepareWith("mother").problems).toEqual([
      { label: "Guardian's relation", message: "A child has only one mother: choose Guardian or Other for this one", fields: ["guardianRelation"] },
    ]);
    // An uncle, written as the guardian, or nothing at all (Guardian), is fine.
    expect(prepareWith("Guardian").problems).toEqual([]);
    expect(prepareWith("").problems).toEqual([]);
    expect(prepareWith("Uncle").problems).toEqual([]);
  });

  it("the first parent with a 10-digit mobile is the primary contact and gets the email", () => {
    const headers = ["Student Name", "Class", "Gender", "DOB", "Father Name", "Mother Name", "Mother Mobile", "Email", ...ADDRESS_COLUMNS];
    const mapping = autoMap(headers);
    const p = prepareRow(
      sheetRow(
        2,
        { "Student Name": "Asha Verma", Class: "Class 1", Gender: "F", DOB: "14-05-2016", "Father Name": "Ravi Verma", "Mother Name": "Sita Verma", "Mother Mobile": "9876543211", Email: "sita@example.com", Address: "12 MG Road", Village: "Bhopal", State: "MP", Pin: "462001", "Previous School": "Little Flower School" } as never,
        headers
      ),
      mapping,
      STRUCTURE
    );
    expect(p.problems).toEqual([]);
    expect(p.input.student.guardians).toMatchObject([
      { name: "Ravi Verma", relation: "Father", isPrimary: false },
      { name: "Sita Verma", relation: "Mother", isPrimary: true, mobile: "9876543211", email: "sita@example.com" },
    ]);
  });

  it("an admission number, a religion, a Yes / No that cannot be read are problems with the form's words", () => {
    const headers = [...HEADERS, "Religion", "RTE"];
    const mapping = autoMap(headers);
    const p = prepareRow(sheetRow(4, { ...AARAV, "Adm No": "bad#1", Religion: "Pastafarian", RTE: "maybe" } as never, headers), mapping, STRUCTURE);
    expect(problemFor(p, "admissionNumber")).toEqual([{ label: "Admission no.", message: ADMISSION_NUMBER_MESSAGE, fields: ["admissionNumber"] }]);
    expect(problemFor(p, "religion")).toEqual([{ label: "Religion", message: "Choose a religion from the list", fields: ["religion"] }]);
    expect(problemFor(p, "rteSeat")).toEqual([{ label: "RTE seat", message: "Write Yes or No", fields: ["rteSeat"] }]);
  });

  describe("with the school's own fields", () => {
    const headers = [...HEADERS, "House", "Bus pass", "Fee paid", "Height", "Hostel from"];
    const mapping = autoMap(headers);
    const own: OwnColumn[] = [HOUSE, BUS, FEE, HEIGHT, JOINED].map((field, i) => ({ field, column: HEADERS.length + i }));
    const withOwn = (values: Record<string, string>) => prepareRow(sheetRow(4, { ...AARAV, ...values } as never, headers), mapping, STRUCTURE, own);

    it("reads each by its kind: a choice in any case, Yes / No in any spelling, a number with commas, a day as written", () => {
      const p = withOwn({ House: "red", "Bus pass": "  BP 12 ", "Fee paid": "haan", Height: "1,200", "Hostel from": "01-04-2026" });
      expect(p.problems).toEqual([]);
      expect(p.input.student.custom).toEqual({ c_house1: "Red", c_bus001: "BP 12", c_fee001: true, c_hgt001: 1200, c_join01: "2026-04-01" });
    });

    it("a value that does not fit is a problem in its own cell, named by the field", () => {
      const p = withOwn({ House: "Purple", "Fee paid": "maybe", Height: "tall", "Hostel from": "31-02-2026" });
      expect(problemFor(p, "c_house1")).toEqual([{ label: "House", message: "Choose the House from the list", fields: ["c_house1"] }]);
      expect(problemFor(p, "c_fee001")).toEqual([{ label: "Fee paid", message: "Write Yes or No", fields: ["c_fee001"] }]);
      expect(problemFor(p, "c_hgt001")).toEqual([{ label: "Height (cm)", message: "Enter a number for Height (cm)", fields: ["c_hgt001"] }]);
      expect(problemFor(p, "c_join01")).toEqual([{ label: "Hostel from", message: "Choose a valid date for Hostel from", fields: ["c_join01"] }]);
    });

    it("an empty one is never a problem here, even a mandatory one (as with the school's other needs)", () => {
      const p = withOwn({});
      expect(p.problems).toEqual([]);
      expect(p.input.student.custom).toBeUndefined();
    });
  });
});

describe("what only the whole file shows", () => {
  it("the same student twice, an admission number twice, a roll number twice in one section", () => {
    const headers = [...HEADERS, "Roll No"];
    const mapping = autoMap(headers);
    const make = (row: number, values: Record<string, string>) => prepareRow(sheetRow(row, { ...AARAV, ...values } as never, headers), mapping, STRUCTURE);
    const found = crossCheck([
      make(4, { "Roll No": "7" }),
      make(5, { "Roll No": "8" }),
      make(6, { "Student Name": "Kabir Verma", "Adm No": "2019/45", "Mobile No": "9811122233", "Roll No": "9" }),
      make(7, { "Student Name": "Neel Verma", "Adm No": "2019/47", "Mobile No": "9811122234", "Roll No": "7" }),
      make(8, { "Student Name": "Ira Verma", "Adm No": "2019/48", "Mobile No": "9811122235", Sec: "B", "Roll No": "7" }),
    ]);
    expect(found.get(5)).toEqual([{ label: "Row", message: "The same student as row 4", fields: [] }]);
    expect(found.get(6)).toEqual([{ label: "Admission no.", message: "Admission number 2019/45 is also on row 4", fields: ["admissionNumber"] }]);
    expect(found.get(7)).toEqual([{ label: "Roll no.", message: "Roll number 7 is also on row 4", fields: ["rollNumber"] }]);
    // Roll number 7 of another section is another seat.
    expect(found.has(8)).toBe(false);
    expect(found.has(4)).toBe(false);
  });
});

describe("a problem named by the server's path is shown in the column the person fixes it in", () => {
  it("names the parent by the column it came from, the whole name, the section, the row", () => {
    expect(fieldsOf("guardians.1.mobile", ["father", "mother"], false)).toEqual(["motherMobile"]);
    expect(labelOf("guardians.1.mobile", ["father", "mother"], false)).toBe("Mother's mobile");
    expect(labelOf("guardians.0.name", ["guardian"], false)).toBe("Guardian's name");
    expect(fieldsOf("firstName", [], true)).toEqual(["fullName"]);
    expect(labelOf("lastName", [], true)).toBe("Student name");
    expect(labelOf("lastName", [], false)).toBe("Last name");
    expect(fieldsOf("sectionId", [], false)).toEqual(["sectionName"]);
    expect(labelOf("guardians", [], false)).toBe("Parents");
    expect(labelOf("", [], false)).toBe("Row");
    expect(problemOf("address.city", "Enter the city", [], false)).toEqual({ label: "City", message: "Enter the city", fields: ["city"] });
    expect(labelOf("something.else", [], false)).toBe("something.else");
  });
});

describe("what the table offers", () => {
  it('the "+" column: each detail with the box its one value needs, then the school\'s own fields', () => {
    const choices = columnChoices(["state", "gender", "className", "rteSeat", "dateOfBirth", "address"], [HOUSE, FEE, JOINED], STRUCTURE);
    const by = Object.fromEntries(choices.map((c) => [c.value, c]));
    expect(by.state.list).toEqual(STATES);
    expect(by.gender.list).toEqual(GENDERS);
    expect(by.className.list).toEqual(CLASSES.map((c) => c.name));
    expect(by.rteSeat.list).toEqual(["Yes", "No"]);
    expect(by.dateOfBirth).toMatchObject({ label: "Date of birth", date: true, list: undefined });
    expect(by.address).toMatchObject({ label: "Address", date: false, list: undefined });
    expect(by.c_house1).toMatchObject({ label: "House (your own)", list: ["Red", "Blue"] });
    expect(by.c_fee001.list).toEqual(["Yes", "No"]);
    expect(by.c_join01.date).toBe(true);
    expect(choices.map((c) => c.value).slice(-3)).toEqual(["c_house1", "c_fee001", "c_join01"]);
  });

  it("the typed table: the usual columns and every detail the school needs, never what it does not ask, never the whole name", () => {
    const keys = (rules: FieldRules) => typedTableFields(rules).map((f) => f.key);
    const usual = keys(DEFAULT_FIELD_RULES);
    expect(usual).not.toContain("fullName");
    expect(usual).toEqual(expect.arrayContaining(["firstName", "lastName", "gender", "dateOfBirth", "className", "sectionName", "fatherMobile"]));
    expect(usual).toContain("aadhaarNumber");
    expect(usual).not.toContain("religion");
    expect(keys({ ...DEFAULT_FIELD_RULES, religion: "required" })).toContain("religion");
    expect(keys({ ...DEFAULT_FIELD_RULES, bloodGroup: "hidden" })).not.toContain("bloodGroup");
  });
});

describe("files", () => {
  it("the rows to fix as a CSV Excel opens as UTF-8: the file's columns plus Problem, quoted where needed", async () => {
    const blob = problemsCsv(["Name", "Address"], [{ cells: ['Asha "Ashu" Verma', "12, MG Road"], problem: "Class: no such class" }]);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    // Read as bytes and decoded keeping the byte-order mark (readAsText would drop it).
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toBe('﻿Name,Address,Problem\r\n"Asha ""Ashu"" Verma","12, MG Road",Class: no such class');
  });

  it("a picked file is refused on screen for its type, emptiness and size, with what to do", () => {
    const file = (name: string, content = "a,b,c") => new File([content], name);
    expect(fileProblem(file("old.xls"), 5)).toContain("Save As > Excel Workbook (.xlsx)");
    expect(fileProblem(file("notes.txt"), 5)).toBe("Upload an Excel file (.xlsx) or a CSV file (.csv).");
    expect(fileProblem(file("empty.csv", ""), 5)).toBe("This file is empty.");
    expect(fileProblem(file("big.csv", "x".repeat(2 * 1024 * 1024)), 1)).toBe("The file is bigger than 1 MB. Split it into smaller files.");
    expect(fileProblem(file("Students.XLSX"), 5)).toBeNull();
    expect(fileProblem(file("list.csv"), 5)).toBeNull();
  });
});
