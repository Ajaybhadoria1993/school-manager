import { STATES } from "../constants/schoolOptions";
import { BLOOD_GROUPS, CATEGORIES, GENDERS } from "../constants/students";
import { DISABILITIES, LENIENT_FIELD_RULES, RELIGIONS, isCustomKey, type CustomFieldDef, type ExportColumnKey, type FieldRules, type FormFieldKey } from "../constants/studentFields";
import type { AcademicStructure, ClassItem, ExportColumn, Gender, ImportRowInput, Relation } from "../types";
import { checkStudentForm, emptyGuardian, emptyStudentForm, todayInIndia, toAdmission, type GuardianDraft, type StudentFormValues } from "./students";

// ---------------------------------------------------------------------------------------------------------------------------
// What a file's columns can be. The same columns as the server's template (backend/src/main/students/constants.ts
// STUDENT_SHEET_COLUMNS), plus "Student name" for a sheet that has the whole name in one column, and "Guardian's occupation".
// ---------------------------------------------------------------------------------------------------------------------------

export type ImportField =
  | "admissionNumber"
  | "fullName"
  | "firstName"
  | "lastName"
  | "gender"
  | "dateOfBirth"
  | "className"
  | "sectionName"
  | "rollNumber"
  | "admissionDate"
  | "fatherName"
  | "fatherMobile"
  | "fatherOccupation"
  | "motherName"
  | "motherMobile"
  | "motherOccupation"
  | "guardianName"
  | "guardianMobile"
  | "guardianRelation"
  | "guardianOccupation"
  | "parentEmail"
  | "address"
  | "area"
  | "city"
  | "state"
  | "pincode"
  | "bloodGroup"
  | "category"
  | "previousSchool"
  | "lastClass"
  | "tcNumber"
  | "tcDate"
  | "aadhaarNumber"
  | "samagraId"
  | "apaarId"
  | "pen"
  | "srNumber"
  | "religion"
  | "nationality"
  | "emergencyMobile"
  | "disability"
  | "medicalNotes"
  | "rteSeat"
  | "bpl"
  | "feeConcession"
  | "transportRoute"
  | "transportStop";

/** How a cell of the field is typed in: free text, a day, or one of a list (offered as suggestions while typing). */
export type CellInput = "text" | "date" | "gender" | "class" | "section" | "state" | "bloodGroup" | "category" | "relation" | "religion" | "disability" | "yesNo";

export interface FieldDef {
  key: ImportField;
  label: string;
  /** required: needed for every row; parent: at least one parent's mobile is needed; optional. */
  kind: "required" | "parent" | "optional";
  /** What to type, shown under the column heading and in Add column. */
  hint: string;
  input: CellInput;
  /** Column titles it is recognised by, written as `headerKey` writes them (lower case, letters and digits only). */
  synonyms: string[];
}

export const IMPORT_FIELDS: readonly FieldDef[] = [
  { key: "admissionNumber", label: "Admission no.", kind: "optional", input: "text", hint: "Your school's own number; empty gets the next one", synonyms: ["admissionno", "admissionnumber", "admno", "admnno", "admissionnum", "srno", "scholarno", "scholarnumber", "regno", "registrationno", "registrationnumber", "enrollmentno", "enrolmentno", "grno"] },
  { key: "fullName", label: "Student name (whole)", kind: "optional", input: "text", hint: "The last word becomes the last name", synonyms: ["studentname", "name", "nameofstudent", "fullname", "studentsname", "nameofthestudent", "studentfullname"] },
  { key: "firstName", label: "First name", kind: "required", input: "text", hint: "2 to 50 letters", synonyms: ["firstname", "fname", "givenname", "studentfirstname"] },
  { key: "lastName", label: "Last name", kind: "required", input: "text", hint: "2 to 50 letters", synonyms: ["lastname", "lname", "surname", "familyname", "studentlastname"] },
  { key: "gender", label: "Gender", kind: "required", input: "gender", hint: "Male, Female, Other (M, F, Boy, Girl work)", synonyms: ["gender", "sex"] },
  { key: "dateOfBirth", label: "Date of birth", kind: "required", input: "date", hint: "DD-MM-YYYY", synonyms: ["dateofbirth", "dob", "birthdate", "dateofbirthddmmyyyy", "dobddmmyyyy", "birthday"] },
  { key: "className", label: "Class", kind: "required", input: "class", hint: "V, 5th, Class 5 or 5-A", synonyms: ["class", "classname", "std", "standard", "grade", "classsection", "classandsection", "currentclass", "admittedclass"] },
  { key: "sectionName", label: "Section", kind: "optional", input: "section", hint: "Needed when the class has sections", synonyms: ["section", "sec", "div", "division", "sectionname"] },
  { key: "rollNumber", label: "Roll no.", kind: "optional", input: "text", hint: "1 to 999, once in a section", synonyms: ["rollno", "rollnumber", "roll", "rollnum"] },
  { key: "admissionDate", label: "Admission date", kind: "optional", input: "date", hint: "DD-MM-YYYY; empty is today", synonyms: ["admissiondate", "dateofadmission", "doa", "joiningdate", "dateofjoining", "admissiondateddmmyyyy"] },
  { key: "fatherName", label: "Father's name", kind: "parent", input: "text", hint: "", synonyms: ["fathersname", "fathername", "father", "nameoffather", "fatherfullname"] },
  { key: "fatherMobile", label: "Father's mobile", kind: "parent", input: "text", hint: "10 digits; +91 or a leading 0 is fine", synonyms: ["fathersmobile", "fathermobile", "fatherphone", "fathersphone", "fathercontact", "fathermobileno", "fathersmobileno", "fathercontactno", "mobile", "mobileno", "phone", "phoneno", "contact", "contactno", "parentmobile", "parentsmobile", "parentphone", "whatsapp", "whatsappno"] },
  { key: "fatherOccupation", label: "Father's occupation", kind: "optional", input: "text", hint: "Farmer, teacher, business...", synonyms: ["fathersoccupation", "fatheroccupation", "fatherprofession", "fathersprofession", "fatherjob", "occupationoffather", "occupation", "parentsoccupation", "parentoccupation", "profession"] },
  { key: "motherName", label: "Mother's name", kind: "parent", input: "text", hint: "", synonyms: ["mothersname", "mothername", "mother", "nameofmother", "motherfullname"] },
  { key: "motherMobile", label: "Mother's mobile", kind: "parent", input: "text", hint: "10 digits", synonyms: ["mothersmobile", "mothermobile", "motherphone", "mothersphone", "mothercontact", "mothermobileno", "mothersmobileno"] },
  { key: "motherOccupation", label: "Mother's occupation", kind: "optional", input: "text", hint: "Homemaker, teacher...", synonyms: ["mothersoccupation", "motheroccupation", "motherprofession", "mothersprofession", "motherjob", "occupationofmother"] },
  { key: "guardianName", label: "Guardian's name", kind: "parent", input: "text", hint: "", synonyms: ["guardiansname", "guardianname", "guardian", "nameofguardian", "localguardian"] },
  { key: "guardianMobile", label: "Guardian's mobile", kind: "parent", input: "text", hint: "10 digits", synonyms: ["guardiansmobile", "guardianmobile", "guardianphone", "guardiancontact", "guardianmobileno"] },
  { key: "guardianRelation", label: "Guardian's relation", kind: "optional", input: "relation", hint: "Guardian or Other", synonyms: ["guardiansrelation", "guardianrelation", "relation", "relationwithstudent"] },
  { key: "guardianOccupation", label: "Guardian's occupation", kind: "optional", input: "text", hint: "", synonyms: ["guardiansoccupation", "guardianoccupation"] },
  { key: "parentEmail", label: "Parent's email", kind: "optional", input: "text", hint: "Saved for the primary contact", synonyms: ["parentsemail", "parentemail", "email", "emailid", "emailaddress", "fatheremail", "motheremail"] },
  { key: "address", label: "Address", kind: "optional", input: "text", hint: "House and street", synonyms: ["address", "addressline1", "residentialaddress", "permanentaddress", "fulladdress", "homeaddress", "correspondenceaddress", "houseandstreet"] },
  { key: "area", label: "Area or landmark", kind: "optional", input: "text", hint: "Colony, area or a landmark", synonyms: ["areaorlandmark", "arealandmark", "area", "landmark", "locality", "colony", "addressline2", "mohalla", "ward"] },
  { key: "city", label: "City", kind: "optional", input: "text", hint: "", synonyms: ["city", "cityorvillage", "town", "village", "cityvillage", "cityortown", "district"] },
  { key: "state", label: "State", kind: "optional", input: "state", hint: "MP, UP, Delhi... work", synonyms: ["state", "statename"] },
  { key: "pincode", label: "PIN code", kind: "optional", input: "text", hint: "6 digits", synonyms: ["pincode", "pin", "pinno", "postalcode", "zip", "zipcode", "postcode"] },
  { key: "bloodGroup", label: "Blood group", kind: "optional", input: "bloodGroup", hint: "B+, B +ve...", synonyms: ["bloodgroup", "blood", "bloodtype"] },
  { key: "category", label: "Category", kind: "optional", input: "category", hint: "General, OBC, SC, ST, EWS", synonyms: ["category", "caste", "castecategory", "socialcategory"] },
  { key: "previousSchool", label: "Previous school", kind: "optional", input: "text", hint: "", synonyms: ["previousschool", "lastschool", "previousschoolname", "schoollastattended", "lastschoolattended"] },
  { key: "lastClass", label: "Last class", kind: "optional", input: "text", hint: "The class finished there", synonyms: ["lastclass", "lastclassattended", "previousclass", "classpassed", "lastclasspassed", "lastclassthere"] },
  { key: "tcNumber", label: "TC no.", kind: "optional", input: "text", hint: "", synonyms: ["tcno", "tcnumber", "tc", "transfercertificateno", "transfercertificatenumber", "slcno"] },
  { key: "tcDate", label: "TC date", kind: "optional", input: "date", hint: "DD-MM-YYYY", synonyms: ["tcdate", "dateoftc", "tcissuedate", "transfercertificatedate", "slcdate"] },
  { key: "aadhaarNumber", label: "Aadhaar no.", kind: "optional", input: "text", hint: "12 digits", synonyms: ["aadhaarno", "aadhaarnumber", "aadhaar", "aadharno", "aadharnumber", "aadhar", "adharno", "adhar", "adharnumber", "uid", "uidno", "studentaadhaar", "studentaadhar"] },
  { key: "samagraId", label: "Samagra ID", kind: "optional", input: "text", hint: "8 or 9 digits", synonyms: ["samagraid", "samagra", "samagrano", "samagraidno", "samagramemberid", "memberid"] },
  { key: "apaarId", label: "APAAR ID", kind: "optional", input: "text", hint: "12 digits", synonyms: ["apaarid", "apaar", "apaarno", "aparid", "apar", "abcid"] },
  { key: "pen", label: "PEN", kind: "optional", input: "text", hint: "11 digits (UDISE+)", synonyms: ["pen", "penno", "pennumber", "permanenteducationnumber", "udisepen", "studentpen"] },
  { key: "srNumber", label: "SR / Scholar no.", kind: "optional", input: "text", hint: "The old register's number", synonyms: ["srscholarno", "srno", "srnumber", "scholarno", "scholarnumber", "scholarregisterno"] },
  { key: "religion", label: "Religion", kind: "optional", input: "religion", hint: "Hindu, Muslim, Sikh...", synonyms: ["religion", "dharm", "dharma"] },
  { key: "nationality", label: "Nationality", kind: "optional", input: "text", hint: "Indian", synonyms: ["nationality", "citizenship"] },
  { key: "emergencyMobile", label: "Emergency / WhatsApp no.", kind: "optional", input: "text", hint: "10 digits", synonyms: ["emergencywhatsappno", "emergencyno", "emergencynumber", "emergencymobile", "emergencycontact", "emergencycontactno", "whatsappnumber"] },
  { key: "disability", label: "Disability (CWSN)", kind: "optional", input: "disability", hint: "None, or the kind", synonyms: ["disabilitycwsn", "disability", "cwsn", "divyang", "specialneeds", "handicap"] },
  { key: "medicalNotes", label: "Medical / allergy", kind: "optional", input: "text", hint: "", synonyms: ["medicalallergy", "medical", "allergy", "allergies", "medicalconditions", "medicalcondition", "healthissues", "medicalnotes"] },
  { key: "rteSeat", label: "RTE seat", kind: "optional", input: "yesNo", hint: "Yes or No", synonyms: ["rteseat", "rte", "rtestudent", "underrte"] },
  { key: "bpl", label: "BPL", kind: "optional", input: "yesNo", hint: "Yes or No", synonyms: ["bpl", "bplfamily", "bplcard", "belowpovertyline"] },
  { key: "feeConcession", label: "Fee concession", kind: "optional", input: "text", hint: "50% tuition, staff ward...", synonyms: ["feeconcession", "concession", "feediscount", "discount", "scholarship"] },
  { key: "transportRoute", label: "Transport route", kind: "optional", input: "text", hint: "", synonyms: ["transportroute", "busroute", "route", "vanroute"] },
  { key: "transportStop", label: "Transport stop", kind: "optional", input: "text", hint: "", synonyms: ["transportstop", "busstop", "stop", "pickuppoint", "boardingpoint"] },
];

/** The detail of the school's admission form an import column fills (its needed / optional / hidden rule). */
const RULE_OF_FIELD: Partial<Record<ImportField, FormFieldKey>> = {
  admissionDate: "admissionDate",
  category: "category",
  bloodGroup: "bloodGroup",
  fatherOccupation: "guardianOccupation",
  motherOccupation: "guardianOccupation",
  guardianOccupation: "guardianOccupation",
  address: "addressLine1",
  area: "addressArea",
  city: "addressCity",
  state: "addressState",
  pincode: "addressPincode",
  previousSchool: "previousSchoolName",
  lastClass: "previousSchoolLastClass",
  tcNumber: "previousSchoolTcNumber",
  tcDate: "previousSchoolTcDate",
  aadhaarNumber: "aadhaarNumber",
  samagraId: "samagraId",
  apaarId: "apaarId",
  pen: "pen",
  srNumber: "srNumber",
  religion: "religion",
  nationality: "nationality",
  emergencyMobile: "emergencyMobile",
  disability: "disability",
  medicalNotes: "medicalNotes",
  rteSeat: "rteSeat",
  bpl: "bpl",
  feeConcession: "feeConcession",
  transportRoute: "transportRoute",
  transportStop: "transportStop",
};

/** The columns the typed table starts with: the ones a sheet has always had, and every detail the school's form needs. */
const TYPED_CORE = new Set<ImportField>(["admissionNumber", "firstName", "lastName", "gender", "dateOfBirth", "className", "sectionName", "rollNumber", "admissionDate", "fatherName", "fatherMobile", "motherName", "motherMobile", "guardianName", "guardianMobile", "guardianRelation", "parentEmail", "address", "city", "state", "pincode", "bloodGroup", "category", "previousSchool"]);
export function typedTableFields(rules: FieldRules | undefined): FieldDef[] {
  return IMPORT_FIELDS.filter((f) => {
    if (f.key === "fullName") return false;
    const rule = RULE_OF_FIELD[f.key];
    const mode = rule && rules ? rules[rule] : undefined;
    return mode === "required" || (TYPED_CORE.has(f.key) && mode !== "hidden");
  });
}

export const fieldDef = (key: ImportField) => IMPORT_FIELDS.find((f) => f.key === key)!;

/** Which column of the file each detail comes from (null: the file has none). */
export type ColumnMapping = Record<ImportField, number | null>;

/** "Father's Mobile *" -> "fathersmobile": how a column title is compared with the names a field is known by. */
export const headerKey = (title: string) => title.toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]/g, "");

export const emptyMapping = () => Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, null])) as ColumnMapping;

/**
 * The detail an export column holds, so a file the school exported (under its own headings) can be uploaded back. Age is not read; the
 * school's own fields are found by `ownColumnsOf`.
 */
const importFieldOfExport = (key: string): ImportField | null =>
  key === "studentName" ? "fullName" : key === "age" || !IMPORT_FIELDS.some((f) => f.key === key) ? null : (key as ExportColumnKey as ImportField);

/**
 * Each field gets the first column whose title it is known by; one column is used once (the first fields in the list win). `own` is
 * the school's export layout: a column under a heading the school chose for a detail is that detail, before any other name is tried,
 * and a column under the heading of one of its own fields is left for that field (`ownColumnsOf`), even when it is a usual name.
 */
export function autoMap(headers: readonly string[], own: readonly ExportColumn[] = []): ColumnMapping {
  const keys = headers.map(headerKey);
  const used = new Set<number>();
  const mapping = emptyMapping();
  for (const column of own) {
    const index = keys.findIndex((key, i) => key === headerKey(column.heading) && !used.has(i));
    if (index < 0) continue;
    if (isCustomKey(column.key)) {
      used.add(index);
      continue;
    }
    const field = importFieldOfExport(column.key);
    if (!field || mapping[field] !== null) continue;
    mapping[field] = index;
    used.add(index);
  }
  // Specific names first ("father's mobile" before the generic "mobile"), then the synonyms in their order.
  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key] !== null) continue;
    for (const synonym of field.synonyms) {
      const index = keys.findIndex((key, i) => key === synonym && !used.has(i));
      if (index >= 0) {
        mapping[field.key] = index;
        used.add(index);
        break;
      }
    }
  }
  // A sheet with first and last name columns does not also need the whole name.
  if (mapping.firstName !== null && mapping.lastName !== null && mapping.fullName !== null) mapping.fullName = null;
  return mapping;
}

/** The detail each column is (the other way round from the mapping), or null for a column that is not imported. */
export function fieldsByColumn(mapping: ColumnMapping, columns: number): (ImportField | null)[] {
  const byColumn: (ImportField | null)[] = Array.from({ length: columns }, () => null);
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field.key];
    if (column !== null && column < columns) byColumn[column] = field.key;
  }
  return byColumn;
}

/** Column `column` is now `field` (or not imported): a field is in one column only, so a column that had it lets it go. */
export function assignColumn(mapping: ColumnMapping, column: number, field: ImportField | null): ColumnMapping {
  const next = { ...mapping };
  for (const f of IMPORT_FIELDS) if (next[f.key] === column) next[f.key] = null;
  if (field) next[field] = column;
  return next;
}

/**
 * The columns the table gets, empty, when the file opens, because every student needs them and the file has none: the name (one
 * column for the whole name), gender, date of birth, class, a parent's name and mobile, and the section when a class of the file is
 * split into sections. Their empty boxes are red and say what to type, so everything is fixed in the table itself. Nothing else is
 * added: the address, the previous school, the IDs... are optional in a bulk upload.
 */
export function columnsToAdd(mapping: ColumnMapping, rows: readonly { cells: string[] }[], classes: readonly ClassItem[]): ImportField[] {
  const add: ImportField[] = [];
  if (mapping.fullName === null) {
    if (mapping.firstName === null && mapping.lastName === null) add.push("fullName");
    else {
      if (mapping.firstName === null) add.push("firstName");
      if (mapping.lastName === null) add.push("lastName");
    }
  }
  for (const key of ["gender", "dateOfBirth", "className"] as const) if (mapping[key] === null) add.push(key);
  if (mapping.fatherName === null && mapping.motherName === null && mapping.guardianName === null) add.push("fatherName");
  if (mapping.fatherMobile === null && mapping.motherMobile === null && mapping.guardianMobile === null) add.push("fatherMobile");
  const classColumn = mapping.className;
  if (mapping.sectionName === null && classColumn !== null) {
    const needsOne = rows.some((r) => {
      const matched = matchClass(tidy(r.cells[classColumn] ?? ""), classes);
      // A section written in the class cell ("5-C") is fixed in that cell: no new column for it.
      return !!matched && !matched.sectionId && !matched.unknownSection && !!classes.find((c) => c.id === matched.classId)?.sections.length;
    });
    if (needsOne) add.push("sectionName");
  }
  // Nothing else is asked of a file: the address, the previous school and the rest are optional, an old register seldom holds them.
  return add;
}

/** A column the table can get: a detail of the list or one of the school's own fields, and the box its value for every row needs. */
export interface ColumnChoice {
  value: string;
  label: string;
  /** One of a list (a dropdown); otherwise text, or a day. */
  list?: readonly string[];
  date?: boolean;
}

/** What a detail's value for every row is chosen from (gender, class, state...), or nothing for free text. */
function listOf(field: ImportField, structure: AcademicStructure): readonly string[] | undefined {
  const lists: Partial<Record<CellInput, readonly string[]>> = {
    state: STATES,
    gender: GENDERS,
    class: structure.classes.map((c) => c.name),
    bloodGroup: BLOOD_GROUPS,
    category: CATEGORIES,
    relation: ["Guardian", "Other"],
    religion: RELIGIONS,
    disability: DISABILITIES,
    yesNo: ["Yes", "No"],
  };
  return lists[fieldDef(field).input];
}

/** The columns the "+" of the table can add: the details of the list not in the table yet, then the school's own fields not in it yet. */
export function columnChoices(fields: readonly ImportField[], own: readonly CustomFieldDef[], structure: AcademicStructure): ColumnChoice[] {
  return [
    ...fields.map((f) => ({ value: f as string, label: fieldDef(f).label, list: listOf(f, structure), date: fieldDef(f).input === "date" })),
    ...own.map((f) => ({
      value: f.key,
      label: `${f.label} (your own)`,
      list: f.type === "choice" ? f.options : f.type === "yesNo" ? ["Yes", "No"] : undefined,
      date: f.type === "date",
    })),
  ];
}

/**
 * Which columns of the file are the school's own fields: a title that is the field's name or its heading in the school's export (a
 * file it exported comes back as it is). A column already read as a detail of the list is left as it is.
 */
export function ownColumnsOf(headers: readonly string[], custom: readonly CustomFieldDef[], exportColumns: readonly ExportColumn[], taken: ReadonlySet<number>): Record<string, number> {
  const keys = headers.map(headerKey);
  const found: Record<string, number> = {};
  for (const field of custom) {
    const names = [field.label, ...exportColumns.filter((c) => c.key === field.key).map((c) => c.heading)].map(headerKey);
    const index = keys.findIndex((key, i) => names.includes(key) && !taken.has(i) && !Object.values(found).includes(i));
    if (index >= 0) found[field.key] = index;
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Turning what a school typed into what the server takes.
// ---------------------------------------------------------------------------------------------------------------------------

export const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A real calendar day as "YYYY-MM-DD", or null. */
function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A day as a school writes it, as "YYYY-MM-DD": 14-05-2016, 14/5/16, 14.05.2016 (day first, as in India), 2016-05-14, 14 May 2016,
 * or an Excel day number. Something that is not a day is passed on as it is, so the check says "Choose a valid date of birth".
 */
export function normaliseDay(raw: string): string {
  const value = tidy(raw);
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (m) return isoDay(+m[1], +m[2], +m[3]) ?? value;
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(value);
  if (m) {
    let year = +m[3];
    if (m[3].length === 2) year += year <= new Date().getFullYear() % 100 ? 2000 : 1900;
    // Day first, unless the second number cannot be a month (5/14/2016, as a sheet set to US dates writes it).
    const [day, month] = +m[2] > 12 && +m[1] <= 12 ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return isoDay(year, month, day) ?? value;
  }
  m = /^(\d{1,2})[-/ ]([a-z]{3,9})[-/ ,]+(\d{4})$/i.exec(value);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return month > 0 ? (isoDay(+m[3], month, +m[1]) ?? value) : value;
  }
  // An Excel day number (days since 30 December 1899), as a CSV saved from Excel can carry.
  if (/^\d{5}$/.test(value) && +value > 1000 && +value < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + +value * 86_400_000).toISOString().slice(0, 10);
  }
  return value;
}

/** "M", "boy", "female" -> "Male" / "Female" / "Other"; anything else is passed on for the check to refuse. */
export function normaliseGender(raw: string): string {
  const value = tidy(raw).toLowerCase();
  if (!value) return "";
  if (["m", "male", "boy", "b", "man"].includes(value)) return "Male";
  if (["f", "female", "girl", "g", "woman"].includes(value)) return "Female";
  if (["o", "other", "others", "transgender", "t"].includes(value)) return "Other";
  return raw.trim();
}

/** The 10 digits of a mobile number: +91, 91 and a leading 0 are dropped; anything else is kept for the check to refuse. */
export function normaliseMobile(raw: string): string {
  let digits = raw.replace(/\.0+$/, "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

const STATE_ALIASES: Record<string, string> = {
  ap: "Andhra Pradesh", ar: "Arunachal Pradesh", as: "Assam", br: "Bihar", cg: "Chhattisgarh", ct: "Chhattisgarh", chattisgarh: "Chhattisgarh",
  ga: "Goa", gj: "Gujarat", hr: "Haryana", hp: "Himachal Pradesh", jh: "Jharkhand", ka: "Karnataka", kl: "Kerala", mp: "Madhya Pradesh",
  mh: "Maharashtra", mn: "Manipur", ml: "Meghalaya", mz: "Mizoram", nl: "Nagaland", od: "Odisha", or: "Odisha", orissa: "Odisha",
  pb: "Punjab", rj: "Rajasthan", sk: "Sikkim", tn: "Tamil Nadu", tg: "Telangana", ts: "Telangana", tr: "Tripura", up: "Uttar Pradesh",
  uk: "Uttarakhand", ut: "Uttarakhand", uttaranchal: "Uttarakhand", wb: "West Bengal", dl: "Delhi", newdelhi: "Delhi", nctofdelhi: "Delhi",
  jk: "Jammu and Kashmir", jandk: "Jammu and Kashmir", jammukashmir: "Jammu and Kashmir", la: "Ladakh", py: "Puducherry", pondicherry: "Puducherry", ch: "Chandigarh",
  an: "Andaman and Nicobar Islands", ld: "Lakshadweep", dnhdd: "Dadra and Nagar Haveli and Daman and Diu",
};
/** "MP", "m.p.", "madhya pradesh" -> "Madhya Pradesh"; a name not in the list is passed on for the check to refuse. */
export function normaliseState(raw: string): string {
  const key = raw.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
  if (!key) return "";
  return STATES.find((s) => s.toLowerCase().replace(/[^a-z]/g, "") === key) ?? STATE_ALIASES[key] ?? tidy(raw);
}

/** "B +ve", "b positive", "B+" -> "B+". */
export function normaliseBloodGroup(raw: string): string {
  const value = raw.toLowerCase().replace(/\s+/g, "").replace(/(\+ve|positive|pos)$/, "+").replace(/(-ve|negative|neg)$/, "-").toUpperCase();
  if (!value) return "";
  return (BLOOD_GROUPS as readonly string[]).includes(value) ? value : tidy(raw);
}

export function normaliseCategory(raw: string): string {
  const value = tidy(raw).toLowerCase();
  if (!value) return "";
  if (["gen", "general", "open", "unreserved", "ur"].includes(value)) return "General";
  return CATEGORIES.find((c) => c.toLowerCase() === value) ?? tidy(raw);
}

/** The third parent's relation: Guardian unless said otherwise; an uncle or a grandparent is Other. */
function normaliseRelation(raw: string): Relation {
  const value = tidy(raw).toLowerCase();
  if (!value || value === "guardian") return "Guardian";
  if (value === "father") return "Father";
  if (value === "mother") return "Mother";
  return "Other";
}

/** "Yes", "Y", "haan", "1" -> true; "No", "N", "nahi", "0" or empty -> false; anything else is null (the row says "Write Yes or No"). */
export function normaliseYesNo(raw: string): boolean | null {
  const value = tidy(raw).toLowerCase().replace(/\.$/, "");
  if (["yes", "y", "true", "1", "haan", "ha", "han", "hai"].includes(value)) return true;
  if (["", "no", "n", "false", "0", "nahi", "nahin", "na", "-"].includes(value)) return false;
  return null;
}

const RELIGION_ALIASES: Record<string, string> = { hinduism: "Hindu", islam: "Muslim", mohammedan: "Muslim", christianity: "Christian", sikhism: "Sikh", buddhism: "Buddhist", bauddh: "Buddhist", jainism: "Jain", zoroastrian: "Parsi" };
/** "hindu", "Islam" -> "Hindu", "Muslim"; a value not in the list is passed on for the check to refuse. */
export function normaliseReligion(raw: string): string {
  const value = tidy(raw).toLowerCase();
  if (!value) return "";
  return RELIGIONS.find((r) => r.toLowerCase() === value) ?? RELIGION_ALIASES[value] ?? tidy(raw);
}

/** "no", "nil", "NA" -> "None"; the kinds of the list without regard to case; anything else is passed on for the check to refuse. */
export function normaliseDisability(raw: string): string {
  const value = tidy(raw).toLowerCase();
  if (!value) return "";
  if (["none", "no", "nil", "na", "n/a", "-", "not applicable"].includes(value)) return "None";
  return DISABILITIES.find((d) => d.toLowerCase() === value) ?? tidy(raw);
}

/** A number kept as text (Aadhaar, Samagra, APAAR, PEN): the spaces and dashes between its digits, and a ".0" from Excel, are dropped. */
const idDigits = (raw: string) => {
  const value = tidy(raw).replace(/\.0+$/, "");
  return /^[\d\s-]+$/.test(value) ? value.replace(/[\s-]/g, "") : value;
};

// ---------------------------------------------------------------------------------------------------------------------------
// Classes and sections: "V", "5th", "Std 5", "Class-5", "5-A", "LKG B" -> a class (and section) of the school.
// ---------------------------------------------------------------------------------------------------------------------------

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11", xii: "12" };
const PRE_PRIMARY: Record<string, string> = {
  "pre nursery": "pre nursery", prenursery: "pre nursery", pn: "pre nursery", playgroup: "pre nursery", "play group": "pre nursery", pg: "pre nursery",
  nursery: "nursery", nur: "nursery",
  lkg: "lkg", "l k g": "lkg", "lower kg": "lkg", "kg 1": "lkg", kg1: "lkg", "jr kg": "lkg", "junior kg": "lkg",
  ukg: "ukg", "u k g": "ukg", "upper kg": "ukg", "kg 2": "ukg", kg2: "ukg", "sr kg": "ukg", "senior kg": "ukg",
};

/** Words around a class's number that are not part of it, wherever they stand ("Class 5", "5th Std"). */
const CLASS_WORDS = new Set(["class", "std", "standard", "grade", "cls"]);

/** The words of a class name, compared without "Class", "Std", ordinals (also written apart, "5 th"), roman numbers and spelling differences. */
function classTokens(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const rest = words.filter((word, i) => !CLASS_WORDS.has(word) && !(/^(st|nd|rd|th)$/.test(word) && /^\d{1,2}$/.test(words[i - 1] ?? "")));
  return rest.map((word, i) => {
    const ordinal = /^(\d{1,2})(st|nd|rd|th)$/.exec(word);
    if (ordinal) return ordinal[1];
    return i === 0 && ROMAN[word] ? ROMAN[word] : word;
  });
}
const keyOfTokens = (tokens: string[]) => {
  const joined = tokens.join(" ");
  return PRE_PRIMARY[joined] ?? joined;
};
export const classKey = (text: string) => keyOfTokens(classTokens(text));

/** The section named in a value such as "A", "Sec A", "Section-A"; compared without regard to case. */
const sectionKey = (text: string) => text.toLowerCase().replace(/^(section|sec|div|division)\b/, "").replace(/[^a-z0-9]/g, "");

/**
 * The class a value of the file's Class column means, and the section when the value carries one ("5-A", "V B", "LKG A"): the whole
 * value is tried first, then all but its last word as the class and the last word as one of that class's sections. When that last word
 * is no section of the class ("5-C"), the class is still right: `unknownSection` is the word as written, for the row to say so.
 */
export function matchClass(value: string, classes: readonly ClassItem[]): { classId: string; sectionId: string | null; unknownSection?: string } | null {
  const tokens = classTokens(value);
  if (tokens.length === 0) return null;
  const whole = keyOfTokens(tokens);
  const direct = classes.find((c) => classKey(c.name) === whole);
  if (direct) return { classId: direct.id, sectionId: null };
  if (tokens.length > 1) {
    const klass = classes.find((c) => classKey(c.name) === keyOfTokens(tokens.slice(0, -1)));
    if (!klass) return null;
    const section = klass.sections.find((s) => sectionKey(s.name) === tokens[tokens.length - 1]);
    if (section) return { classId: klass.id, sectionId: section.id };
    return { classId: klass.id, sectionId: null, unknownSection: value.split(/[^A-Za-z0-9]+/).filter(Boolean).at(-1) ?? "" };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// One row of the file as an admission, with what is wrong with it and in which columns.
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * A problem of a row: the column the person fixes it in (its label), the message, and the fields whose cells are marked (a detail of
 * the list, or the key of one of the school's own fields).
 */
export interface RowProblem {
  label: string;
  message: string;
  fields: string[];
}

export type GuardianSource = "father" | "mother" | "guardian";

export interface PreparedRow {
  row: number;
  name: string;
  classLabel: string;
  parentLabel: string;
  classId: string;
  sectionId: string | null;
  /** What is sent to the server. */
  input: ImportRowInput;
  problems: RowProblem[];
  warnings: string[];
  /** Where each guardian of the body came from, to name a problem by its column ("Father's mobile"). */
  guardianSources: GuardianSource[];
}

const ADMISSION_NUMBER = /^[A-Z0-9][A-Z0-9 /._-]{0,29}$/;
export const ADMISSION_NUMBER_MESSAGE = "Use letters, digits and / - . _ in the admission number (up to 30)";

const PATH_FIELDS: Record<string, ImportField[]> = {
  admissionNumber: ["admissionNumber"],
  gender: ["gender"],
  dateOfBirth: ["dateOfBirth"],
  admissionDate: ["admissionDate"],
  classId: ["className"],
  // The section is typed in its own column (the class itself is right).
  sectionId: ["sectionName"],
  rollNumber: ["rollNumber"],
  guardians: ["fatherName", "fatherMobile", "motherName", "motherMobile", "guardianName", "guardianMobile"],
  "address.line1": ["address"],
  "address.line2": ["area"],
  "address.city": ["city"],
  "address.state": ["state"],
  "address.pincode": ["pincode"],
  bloodGroup: ["bloodGroup"],
  category: ["category"],
  "previousSchool.name": ["previousSchool"],
  "previousSchool.lastClass": ["lastClass"],
  "previousSchool.tcNumber": ["tcNumber"],
  "previousSchool.tcDate": ["tcDate"],
  aadhaarNumber: ["aadhaarNumber"],
  samagraId: ["samagraId"],
  apaarId: ["apaarId"],
  pen: ["pen"],
  srNumber: ["srNumber"],
  religion: ["religion"],
  nationality: ["nationality"],
  emergencyMobile: ["emergencyMobile"],
  disability: ["disability"],
  medicalNotes: ["medicalNotes"],
  rteSeat: ["rteSeat"],
  bpl: ["bpl"],
  feeConcession: ["feeConcession"],
  transportRoute: ["transportRoute"],
  transportStop: ["transportStop"],
};
const GUARDIAN_FIELDS: Record<GuardianSource, Partial<Record<string, ImportField>>> = {
  father: { mobile: "fatherMobile", name: "fatherName", email: "parentEmail", occupation: "fatherOccupation" },
  mother: { mobile: "motherMobile", name: "motherName", email: "parentEmail", occupation: "motherOccupation" },
  guardian: { mobile: "guardianMobile", name: "guardianName", relation: "guardianRelation", email: "parentEmail", occupation: "guardianOccupation" },
};

/** The fields a problem's path ("guardians.1.mobile", "address.city") is about, so their cells can be marked. */
export function fieldsOf(path: string, sources: readonly GuardianSource[], wholeName: boolean): ImportField[] {
  if (path === "firstName" || path === "lastName") return wholeName ? ["fullName"] : [path];
  const guardian = /^guardians\.(\d+)\.(\w+)$/.exec(path);
  if (guardian) {
    const field = GUARDIAN_FIELDS[sources[Number(guardian[1])] ?? "father"][guardian[2]];
    return field ? [field] : [];
  }
  return PATH_FIELDS[path] ?? [];
}

/** A problem's path ("guardians.1.mobile") as the column the person fixes it in ("Mother's mobile"). */
export function labelOf(path: string, sources: readonly GuardianSource[], wholeName: boolean): string {
  if (path === "guardians") return "Parents";
  if (path === "") return "Row";
  const fields = fieldsOf(path, sources, wholeName);
  if (fields[0] === "fullName") return "Student name";
  return fields.length > 0 ? fieldDef(fields[0]).label : path;
}

/** A problem as the server or the form's rules name it (by path), for the screen. */
export const problemOf = (path: string, message: string, sources: readonly GuardianSource[], wholeName: boolean): RowProblem => ({
  label: labelOf(path, sources, wholeName),
  message,
  fields: fieldsOf(path, sources, wholeName),
});

/** How a row's warning about the school's own needs begins (the server's words): the screen leaves it out (the table says enough). */
export const SCHOOL_NEEDS = "Not in the file, but your school needs it";

/** A column of the school's own field in the table: which field, in which column. */
export interface OwnColumn {
  field: CustomFieldDef;
  column: number;
}

/**
 * One row of the file as an admission. Each value is cleaned the way a person would read it (a day, a gender, a state, a mobile number),
 * the class and section are matched to the school's ("V", "5-A"), the parents become guardians (the first with a mobile number is the
 * primary contact), and the row is checked with the admission form's own rules and words (`checkStudentForm`), so the screen can say
 * what is wrong, and in which cell, before anything is sent. The server checks every row again.
 * The school's own needs (Aadhaar, the address...) do not stop a row, as on the server. The school's own fields that have a column
 * (`own`) are read by their kind (a day, a number, Yes / No, one of the list) and sent with the row.
 */
export function prepareRow(
  sheetRow: { row: number; cells: string[] },
  mapping: ColumnMapping,
  structure: AcademicStructure,
  own: readonly OwnColumn[] = []
): PreparedRow {
  const get = (field: ImportField) => {
    const column = mapping[field];
    return column !== null ? tidy(sheetRow.cells[column] ?? "") : "";
  };
  const problems: RowProblem[] = [];
  const warnings: string[] = [];

  // The name: first and last name columns, or the whole name split at its last word.
  let firstName = get("firstName");
  let lastName = get("lastName");
  const wholeName = mapping.firstName === null && mapping.lastName === null && mapping.fullName !== null;
  if (wholeName) {
    const words = get("fullName").split(" ").filter(Boolean);
    firstName = words.length > 1 ? words.slice(0, -1).join(" ") : (words[0] ?? "");
    lastName = words.length > 1 ? words[words.length - 1] : "";
  }

  // The class, and the section from its column or from the class value ("5-A"). A section written in the class cell that is not the
  // class's ("5-C") is said in that cell, where it is fixed.
  const classValue = get("className");
  const matched = classValue ? matchClass(classValue, structure.classes) : null;
  const klass = matched ? structure.classes.find((c) => c.id === matched.classId) : undefined;
  let sectionId: string | null = null;
  const sectionValue = get("sectionName") || matched?.unknownSection || "";
  const sectionCell: ImportField = get("sectionName") || !matched?.unknownSection ? "sectionName" : "className";
  if (klass) {
    const names = klass.sections.map((s) => s.name).join(", ");
    if (sectionValue && klass.sections.length > 0) {
      const section = klass.sections.find((s) => sectionKey(s.name) === sectionKey(sectionValue));
      if (section) sectionId = section.id;
      else problems.push({ label: "Section", message: `${klass.name} has sections ${names}, not "${sectionValue}"`, fields: [sectionCell] });
    } else if (sectionValue && klass.sections.length === 0) {
      warnings.push(`${klass.name} has no sections: the section in the file (${sectionValue}) is not used.`);
    } else {
      sectionId = matched?.sectionId ?? null;
      // The class is right; it is split into sections, so the row needs one (typed in the Section column).
      if (!sectionId && klass.sections.length > 0) problems.push({ label: "Section", message: `${klass.name} has sections ${names}: type one`, fields: ["sectionName"] });
    }
  } else if (classValue) {
    problems.push({ label: "Class", message: `Your school has no "${classValue}": type one of your classes`, fields: ["className"] });
  }
  const section = klass?.sections.find((s) => s.id === sectionId);

  // Father, mother, guardian: the ones with a name or a number. The first with a valid-looking mobile is the primary contact.
  const sources: GuardianSource[] = [];
  const guardians: GuardianDraft[] = [];
  const parent = (source: GuardianSource, name: string, mobile: string, relation: Relation, occupation: string) => {
    if (!name && !mobile) return;
    sources.push(source);
    guardians.push({ ...emptyGuardian(false, relation), name, mobile: normaliseMobile(mobile), occupation, manual: true });
  };
  parent("father", get("fatherName"), get("fatherMobile"), "Father", get("fatherOccupation"));
  parent("mother", get("motherName"), get("motherMobile"), "Mother", get("motherOccupation"));
  parent("guardian", get("guardianName"), get("guardianMobile"), normaliseRelation(get("guardianRelation")), get("guardianOccupation"));
  const primary = Math.max(0, guardians.findIndex((g) => g.mobile.length === 10));
  if (guardians[primary]) {
    guardians[primary].isPrimary = true;
    guardians[primary].email = get("parentEmail");
  }

  const values: StudentFormValues = {
    ...emptyStudentForm(),
    firstName,
    lastName,
    gender: normaliseGender(get("gender")) as Gender,
    dateOfBirth: normaliseDay(get("dateOfBirth")),
    admissionDate: normaliseDay(get("admissionDate")),
    classId: klass?.id ?? "",
    sectionId: sectionId ?? "",
    rollNumber: get("rollNumber").replace(/\.0+$/, ""),
    guardians,
    address: { line1: get("address"), line2: get("area"), city: get("city"), state: normaliseState(get("state")), pincode: get("pincode").replace(/\s/g, "") },
    bloodGroup: normaliseBloodGroup(get("bloodGroup")),
    category: normaliseCategory(get("category")),
    previousSchool: { name: get("previousSchool"), lastClass: get("lastClass"), tcNumber: get("tcNumber"), tcDate: normaliseDay(get("tcDate")) },
    aadhaarNumber: idDigits(get("aadhaarNumber")),
    samagraId: idDigits(get("samagraId")),
    apaarId: idDigits(get("apaarId")),
    pen: idDigits(get("pen")),
    srNumber: get("srNumber"),
    religion: normaliseReligion(get("religion")),
    nationality: get("nationality"),
    emergencyMobile: get("emergencyMobile") ? normaliseMobile(get("emergencyMobile")) : "",
    disability: normaliseDisability(get("disability")),
    medicalNotes: get("medicalNotes"),
    feeConcession: get("feeConcession"),
    transportRoute: get("transportRoute"),
    transportStop: get("transportStop"),
    rteSeat: normaliseYesNo(get("rteSeat")) ?? false,
    bpl: normaliseYesNo(get("bpl")) ?? false,
  };

  const admissionNumber = get("admissionNumber").toUpperCase();
  if (admissionNumber && !ADMISSION_NUMBER.test(admissionNumber)) problems.push({ label: "Admission no.", message: ADMISSION_NUMBER_MESSAGE, fields: ["admissionNumber"] });
  // The lists the form offers as a dropdown (its check never sees a value outside them there): the server's words, or what to write.
  if (values.gender && !(GENDERS as readonly string[]).includes(values.gender)) problems.push({ label: "Gender", message: "Write Male, Female or Other", fields: ["gender"] });
  if (values.address.state && !(STATES as readonly string[]).includes(values.address.state)) problems.push({ label: "State", message: "Choose a state from the list", fields: ["state"] });
  if (values.bloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(values.bloodGroup)) problems.push({ label: "Blood group", message: "Choose a blood group from the list", fields: ["bloodGroup"] });
  if (values.category && !(CATEGORIES as readonly string[]).includes(values.category)) problems.push({ label: "Category", message: "Choose a category from the list", fields: ["category"] });
  if (values.religion && !(RELIGIONS as readonly string[]).includes(values.religion)) problems.push({ label: "Religion", message: "Choose a religion from the list", fields: ["religion"] });
  if (values.disability && !(DISABILITIES as readonly string[]).includes(values.disability)) problems.push({ label: "Disability (CWSN)", message: "Choose a disability from the list", fields: ["disability"] });
  for (const key of ["rteSeat", "bpl"] as const) {
    if (normaliseYesNo(get(key)) === null) problems.push({ label: fieldDef(key).label, message: "Write Yes or No", fields: [key] });
  }

  // The school's own fields that have a column, read by their kind.
  for (const { field, column } of own) {
    const raw = tidy(sheetRow.cells[column] ?? "");
    if (!raw) continue;
    if (field.type === "yesNo") {
      const yes = normaliseYesNo(raw);
      if (yes === null) problems.push({ label: field.label, message: "Write Yes or No", fields: [field.key] });
      else values.custom[field.key] = yes;
    } else if (field.type === "date") values.custom[field.key] = normaliseDay(raw);
    else if (field.type === "choice") values.custom[field.key] = field.options.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? raw;
    else if (field.type === "number") values.custom[field.key] = raw.replace(/,/g, "").replace(/\.0+$/, "");
    else values.custom[field.key] = raw;
  }
  // Never needed here (an old register seldom has them): only checked for what is typed.
  const ownFields = own.map((o) => ({ ...o.field, mode: "optional" as const }));

  // The admission form's own rules, with its words. Every detail the school decides about is optional here (the bulk upload is never
  // refused for them: a school brings in the students it already has, and an old register seldom holds the address, the previous school
  // or the IDs); a detail that is given is still checked. The class and section problems above already say what is wrong with them.
  const check = { classHasSections: !!klass?.sections.length, admissionDateRequired: false, today: todayInIndia() };
  const errors = checkStudentForm(values, { ...check, rules: LENIENT_FIELD_RULES, custom: ownFields });
  if (guardians.length === 0) errors.guardians = "Add at least one parent with a mobile number";
  for (const [path, message] of Object.entries(errors)) {
    if (path === "classId" && classValue) continue;
    if (path === "sectionId" && problems.some((p) => p.label === "Section")) continue;
    const ownField = path.startsWith("custom.") ? ownFields.find((f) => `custom.${f.key}` === path) : undefined;
    problems.push(ownField ? { label: ownField.label, message, fields: [ownField.key] } : problemOf(path, message, sources, wholeName));
  }

  const primaryGuardian = guardians[primary];
  return {
    row: sheetRow.row,
    name: `${firstName} ${lastName}`.trim() || "(no name)",
    classLabel: klass ? (section ? `${klass.name} - ${section.name}` : klass.name) : classValue || "(no class)",
    parentLabel: primaryGuardian ? `${primaryGuardian.name || "(no name)"}${primaryGuardian.mobile ? ` · ${primaryGuardian.mobile}` : ""}` : "(no parent)",
    classId: klass?.id ?? "",
    sectionId,
    input: {
      row: sheetRow.row,
      ...(admissionNumber ? { admissionNumber } : {}),
      student: toAdmission(values, { allowOverCapacity: false, confirmNotDuplicate: false }, ownFields),
    },
    problems,
    warnings,
    guardianSources: sources,
  };
}

/**
 * Problems only the whole file shows: the same student twice (name, birthday and primary mobile), the same admission number twice, and
 * a roll number used twice in a section. The later row gets the problem (the server would refuse it anyway).
 */
export function crossCheck(rows: readonly PreparedRow[]): Map<number, RowProblem[]> {
  const found = new Map<number, RowProblem[]>();
  const add = (row: number, problem: RowProblem) => found.set(row, [...(found.get(row) ?? []), problem]);
  const students = new Map<string, number>();
  const numbers = new Map<string, number>();
  const rolls = new Map<string, number>();
  for (const r of rows) {
    const s = r.input.student;
    const primary = s.guardians.find((g) => g.isPrimary)?.mobile ?? "";
    const who = `${tidy(s.firstName).toLowerCase()} ${tidy(s.lastName).toLowerCase()}|${s.dateOfBirth}|${primary}`;
    const earlier = students.get(who);
    if (earlier !== undefined) add(r.row, { label: "Row", message: `The same student as row ${earlier}`, fields: [] });
    else students.set(who, r.row);
    const number = r.input.admissionNumber;
    if (number) {
      const before = numbers.get(number);
      if (before !== undefined && earlier === undefined) add(r.row, { label: "Admission no.", message: `Admission number ${number} is also on row ${before}`, fields: ["admissionNumber"] });
      else if (before === undefined) numbers.set(number, r.row);
    }
    if (s.rollNumber) {
      const seat = `${r.classId}|${r.sectionId ?? ""}|${s.rollNumber}`;
      const before = rolls.get(seat);
      if (before !== undefined) add(r.row, { label: "Roll no.", message: `Roll number ${s.rollNumber} is also on row ${before}`, fields: ["rollNumber"] });
      else rolls.set(seat, r.row);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Files.
// ---------------------------------------------------------------------------------------------------------------------------

const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** A CSV (with a byte-order mark, so Excel reads it as UTF-8) of the file's columns plus a "Problem" column. */
export function problemsCsv(headers: readonly string[], rows: { cells: string[]; problem: string }[]): Blob {
  const lines = [[...headers, "Problem"], ...rows.map((r) => [...r.cells, r.problem])].map((line) => line.map(csvField).join(","));
  return new Blob([String.fromCharCode(0xfeff), lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

/** What is wrong with a picked file before it is sent (the server checks the same and more). */
export function fileProblem(file: File, maxMb: number): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) return "This is an old Excel file (.xls). Open it in Excel, choose File > Save As > Excel Workbook (.xlsx), and upload that.";
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) return "Upload an Excel file (.xlsx) or a CSV file (.csv).";
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxMb * 1024 * 1024) return `The file is bigger than ${maxMb} MB. Split it into smaller files.`;
  return null;
}

/** Hands a file made in the browser to the browser to save. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
