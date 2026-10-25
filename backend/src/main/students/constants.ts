import type { UserRole } from "../users/models/User";
import { classNumber } from "./classNumber";

/**
 * Who may admit students and change them. One list, so a "reception" role (the front desk that does admissions) is added by
 * editing this one line when Staff exists. The routes and the screens both follow it.
 */
export const STUDENT_WRITERS = ["school_admin", "principal"] as const satisfies readonly UserRole[];
/** Who may look at students. Teachers join when teacher allocation exists (they will see only their own sections). */
export const STUDENT_READERS = ["school_admin", "principal", "accountant"] as const satisfies readonly UserRole[];

export const GENDERS = ["Male", "Female", "Other"] as const;
export type Gender = (typeof GENDERS)[number];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS", "Prefer not to say"] as const;

/** How a guardian is related to one student. It belongs to the link, not to the guardian: one person is "Father" of two children. */
export const RELATIONS = ["Father", "Mother", "Guardian", "Other"] as const;
export type Relation = (typeof RELATIONS)[number];

/** A student's state. Only `active` exists today; a "left" state (transfer certificate, dropped out) comes with that workflow. */
export const STUDENT_STATUSES = ["active"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** An enrolment's state: `active` while the student studies in that class that year. Promotion and leaving add more later. */
export const ENROLMENT_STATUSES = ["active"] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

export const MIN_GUARDIANS = 1;
export const MAX_GUARDIANS = 4;
/** The youngest and the oldest a student may be on the day of admission (a guard against a mistyped year, not a policy). */
export const MIN_AGE = 2;
export const MAX_AGE = 25;
export const MAX_ROLL_NUMBER = 999;

/** A bulk import: the most students one file may hold, and the most rows one request may carry (the screen sends a file in parts). */
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_ROWS_PER_REQUEST = 100;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** The most columns of a file that are read (a school's own sheet may have many we do not use). */
export const MAX_IMPORT_COLUMNS = 60;

/** How a column of the students sheet is filled: required, part of "at least one parent", or optional. */
export type SheetColumnKind = "required" | "parent" | "optional";

/**
 * The columns of the students spreadsheet, in order: the sample template, the export and the import all use these (so an export can be
 * read back, and the screen can match a school's own headers to them). `note` is shown on the header cell of the template.
 */
export const STUDENT_SHEET_COLUMNS = [
  { key: "admissionNumber", header: "Admission No.", kind: "optional", width: 16, note: "Optional. The number your school already gave this student (letters, digits and / - . _, up to 30). Leave it empty and the software gives the next one, for example ADM-2026-0001." },
  { key: "firstName", header: "First Name", kind: "required", width: 18, note: "Required. 2 to 50 letters." },
  { key: "lastName", header: "Last Name", kind: "required", width: 18, note: "Required. 2 to 50 letters." },
  { key: "gender", header: "Gender", kind: "required", width: 10, note: "Required. Male, Female or Other." },
  { key: "dateOfBirth", header: "Date of Birth", kind: "required", width: 15, note: "Required. DD-MM-YYYY, for example 14-05-2016. The student must be 2 to 25 years old on the admission date." },
  { key: "className", header: "Class", kind: "required", width: 14, note: "Required. A class of your school, as written in the Classes sheet: Nursery, LKG, Class 5..." },
  { key: "sectionName", header: "Section", kind: "optional", width: 10, note: "Required when the class has sections this year (see the Classes sheet), for example A. Leave it empty for a class without sections." },
  { key: "rollNumber", header: "Roll No.", kind: "optional", width: 10, note: "Optional. A whole number from 1 to 999, used once in a section." },
  { key: "admissionDate", header: "Admission Date", kind: "optional", width: 15, note: "Optional. DD-MM-YYYY. Leave it empty for today." },
  { key: "fatherName", header: "Father's Name", kind: "parent", width: 20, note: "Father, Mother or Guardian: at least one with a name and a mobile number. The first of them with a mobile number is the primary contact." },
  { key: "fatherMobile", header: "Father's Mobile", kind: "parent", width: 16, note: "10 digits starting with 6, 7, 8 or 9. A parent already in your school (another child) is found by this number and linked, not copied." },
  { key: "motherName", header: "Mother's Name", kind: "parent", width: 20, note: "See Father's Name." },
  { key: "motherMobile", header: "Mother's Mobile", kind: "parent", width: 16, note: "10 digits starting with 6, 7, 8 or 9." },
  { key: "guardianName", header: "Guardian's Name", kind: "parent", width: 20, note: "Another guardian (an uncle, a grandparent...), when there is one." },
  { key: "guardianMobile", header: "Guardian's Mobile", kind: "parent", width: 16, note: "10 digits starting with 6, 7, 8 or 9." },
  { key: "guardianRelation", header: "Guardian's Relation", kind: "optional", width: 16, note: "Guardian or Other. Empty means Guardian." },
  { key: "parentEmail", header: "Parent's Email", kind: "optional", width: 24, note: "Optional. Saved for the primary contact." },
  { key: "fatherOccupation", header: "Father's Occupation", kind: "optional", width: 18, note: "What the father does (farmer, teacher, business...)." },
  { key: "motherOccupation", header: "Mother's Occupation", kind: "optional", width: 18, note: "What the mother does (homemaker, teacher...)." },
  { key: "address", header: "Address", kind: "optional", width: 28, note: "House and street, at least 3 characters." },
  { key: "area", header: "Area or Landmark", kind: "optional", width: 22, note: "The colony, area or a landmark near the house." },
  { key: "city", header: "City", kind: "optional", width: 14, note: "The city, town or village." },
  { key: "state", header: "State", kind: "optional", width: 18, note: "A state or union territory of India, as in the list." },
  { key: "pincode", header: "PIN Code", kind: "optional", width: 10, note: "6 digits." },
  { key: "bloodGroup", header: "Blood Group", kind: "optional", width: 12, note: "A+, A-, B+, B-, AB+, AB-, O+ or O-." },
  { key: "category", header: "Category", kind: "optional", width: 16, note: "General, OBC, SC, ST, EWS or Prefer not to say." },
  { key: "previousSchool", header: "Previous School", kind: "optional", width: 24, note: "The school the student comes from, if your old register has it." },
  { key: "lastClass", header: "Last Class", kind: "optional", width: 12, note: "The class the student finished there, for example Class 4." },
  { key: "tcNumber", header: "TC No.", kind: "optional", width: 12, note: "The transfer certificate's number." },
  { key: "tcDate", header: "TC Date", kind: "optional", width: 13, note: "DD-MM-YYYY." },
  { key: "aadhaarNumber", header: "Aadhaar No.", kind: "optional", width: 16, note: "12 digits." },
  { key: "samagraId", header: "Samagra ID", kind: "optional", width: 13, note: "8 or 9 digits (Madhya Pradesh)." },
  { key: "apaarId", header: "APAAR ID", kind: "optional", width: 15, note: "12 digits." },
  { key: "pen", header: "PEN", kind: "optional", width: 14, note: "The 11-digit Permanent Education Number (UDISE+)." },
  { key: "srNumber", header: "SR / Scholar No.", kind: "optional", width: 15, note: "The number in the school's old register." },
  { key: "religion", header: "Religion", kind: "optional", width: 14, note: "As in the list." },
  { key: "nationality", header: "Nationality", kind: "optional", width: 13, note: "For example Indian." },
  { key: "emergencyMobile", header: "Emergency / WhatsApp No.", kind: "optional", width: 18, note: "10 digits starting with 6, 7, 8 or 9." },
  { key: "disability", header: "Disability (CWSN)", kind: "optional", width: 20, note: "None, or the kind of disability, as in the list." },
  { key: "medicalNotes", header: "Medical / Allergy", kind: "optional", width: 24, note: "Medical conditions or allergies the school should know." },
  { key: "rteSeat", header: "RTE Seat", kind: "optional", width: 10, note: "Yes when the student has a free seat under the Right to Education Act." },
  { key: "bpl", header: "BPL", kind: "optional", width: 8, note: "Yes when the family is below the poverty line." },
  { key: "feeConcession", header: "Fee Concession", kind: "optional", width: 18, note: "For example 50% tuition, staff ward." },
  { key: "transportRoute", header: "Transport Route", kind: "optional", width: 16, note: "The school bus route." },
  { key: "transportStop", header: "Transport Stop", kind: "optional", width: 16, note: "Where the student gets on." },
] as const satisfies readonly { key: string; header: string; kind: SheetColumnKind; width: number; note: string }[];

export type SheetColumnKey = (typeof STUDENT_SHEET_COLUMNS)[number]["key"];

export const RELIGIONS = ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Prefer not to say"] as const;
/** The kinds of disability of UDISE+ (children with special needs), and None (so a school that needs the answer gets one). */
export const DISABILITIES = [
  "None",
  "Blindness",
  "Low vision",
  "Hearing impairment",
  "Speech and language",
  "Locomotor disability",
  "Intellectual disability",
  "Specific learning disability",
  "Autism spectrum disorder",
  "Cerebral palsy",
  "Multiple disabilities",
  "Other",
] as const;

/** How a school wants one detail of a student: asked and needed, asked but may be left empty, or not asked at all. */
export const FIELD_MODES = ["required", "optional", "hidden"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

/**
 * The details of an admission that each school decides about (on the Export screen, beside each column): needed, optional or not
 * asked. The rest is always needed and is not on this list: the name, gender, date of birth, the class (and the section of a class that
 * has sections) and the primary parent's name and mobile number, because the software itself depends on them (the duplicate guard, the
 * age rule, the enrolment, the parent's login). `default` is how a new school starts: what is in the default export layout is asked
 * (the school's own list), the rest is not asked until the school turns it on. `yesNo` details are a tick, never "needed". `message` is
 * said when a needed detail is missing, in the form and by the server.
 */
export const STUDENT_FORM_FIELDS = [
  { key: "admissionDate", label: "Admission date", group: "Student", default: "hidden", message: "Choose the admission date" },
  { key: "category", label: "Category", group: "Student", default: "required", message: "Choose the category" },
  { key: "bloodGroup", label: "Blood group", group: "Student", default: "optional", message: "Choose the blood group" },
  { key: "secondParent", label: "Both parents (father and mother)", group: "Parents", default: "required", message: "Add both parents: the father and the mother (a name is enough for the one without a mobile number)" },
  { key: "guardianOccupation", label: "Parent's occupation", group: "Parents", default: "required", message: "Enter the occupation" },
  { key: "addressLine1", label: "House and street", group: "Address", default: "required", message: "Enter the street address" },
  { key: "addressArea", label: "Area or landmark", group: "Address", default: "required", message: "Enter the area or landmark" },
  { key: "addressCity", label: "City or village", group: "Address", default: "required", message: "Enter the city" },
  { key: "addressState", label: "State", group: "Address", default: "required", message: "Choose the state" },
  { key: "addressPincode", label: "PIN code", group: "Address", default: "required", message: "PIN code is 6 digits" },
  { key: "aadhaarNumber", label: "Aadhaar number", group: "IDs", default: "required", message: "Enter the Aadhaar number" },
  { key: "samagraId", label: "Samagra ID", group: "IDs", default: "hidden", message: "Enter the Samagra ID" },
  { key: "apaarId", label: "APAAR ID", group: "IDs", default: "hidden", message: "Enter the APAAR ID" },
  { key: "pen", label: "PEN (UDISE+)", group: "IDs", default: "hidden", message: "Enter the PEN" },
  { key: "srNumber", label: "SR / Scholar number", group: "IDs", default: "hidden", message: "Enter the SR / Scholar number" },
  { key: "previousSchoolName", label: "Previous school", group: "Previous school", default: "required", message: "Enter the previous school's name" },
  { key: "previousSchoolLastClass", label: "Last class there", group: "Previous school", default: "required", message: "Enter the last class at the previous school" },
  { key: "previousSchoolTcNumber", label: "TC number", group: "Previous school", default: "required", message: "Enter the TC number" },
  { key: "previousSchoolTcDate", label: "TC date", group: "Previous school", default: "optional", message: "Choose the TC date" },
  { key: "religion", label: "Religion", group: "More", default: "hidden", message: "Choose the religion" },
  { key: "nationality", label: "Nationality", group: "More", default: "hidden", message: "Enter the nationality" },
  { key: "emergencyMobile", label: "Emergency / WhatsApp number", group: "More", default: "hidden", message: "Enter the emergency / WhatsApp number" },
  { key: "disability", label: "Disability (CWSN)", group: "More", default: "hidden", message: "Choose the disability (or None)" },
  { key: "medicalNotes", label: "Medical conditions / allergy", group: "More", default: "hidden", message: "Enter the medical conditions (or None)" },
  { key: "rteSeat", label: "RTE seat", group: "Fees and transport", default: "hidden", yesNo: true, message: "" },
  { key: "bpl", label: "BPL family", group: "Fees and transport", default: "hidden", yesNo: true, message: "" },
  { key: "feeConcession", label: "Fee concession", group: "Fees and transport", default: "hidden", message: "Enter the fee concession" },
  { key: "transportRoute", label: "Transport route", group: "Fees and transport", default: "hidden", message: "Enter the transport route" },
  { key: "transportStop", label: "Transport stop", group: "Fees and transport", default: "hidden", message: "Enter the transport stop" },
] as const satisfies readonly { key: string; label: string; group: string; default: FieldMode; message: string; yesNo?: boolean }[];

export type FormFieldKey = (typeof STUDENT_FORM_FIELDS)[number]["key"];
/** Each decidable detail and how this school wants it. */
export type FieldRules = Record<FormFieldKey, FieldMode>;
export const DEFAULT_FIELD_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, f.default])) as FieldRules;
/** Every decidable detail optional: what a bulk import is held to (the school's own needs are said as warnings, not refusals). */
export const LENIENT_FIELD_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, "optional"])) as FieldRules;

/**
 * Details no school can change, whatever it chooses on the Export screen: the address is always needed (house and street, city, state
 * and PIN code), and so is the previous school's name for a student of Class 1 to 12 (`needsForClass`: before Class 1 it is optional).
 */
export const FIXED_RULES = {
  addressLine1: "required",
  addressCity: "required",
  addressState: "required",
  addressPincode: "required",
  previousSchoolName: "required",
} as const satisfies Partial<Record<FormFieldKey, FieldMode>>;
/** Details that are always asked (a school may make them needed or optional, never not asked). */
export const ALWAYS_ASKED_RULES: readonly FormFieldKey[] = ["category"];
/** The previous school's boxes: needed (when the school says so) only for a student of Class 1 to 12. */
export const PREVIOUS_SCHOOL_RULES: readonly FormFieldKey[] = ["previousSchoolName", "previousSchoolLastClass", "previousSchoolTcNumber"];

/** A school's decisions with what no school can change put right (an older setting that says otherwise is read the right way). */
export function normaliseRules(rules: FieldRules): FieldRules {
  const next: FieldRules = { ...rules, ...FIXED_RULES };
  for (const key of ALWAYS_ASKED_RULES) if (next[key] === "hidden") next[key] = "optional";
  return next;
}

/**
 * What a school needs of ONE admission, by the class the student goes into: the previous school (its name, the last class there and
 * the TC number) is needed only for a student of Class 1 to 12, as the school decided; for any other class (Nursery, LKG, UKG...), or
 * when the class is not known, nothing of it is needed. The rest of the school's needs are the same for every class.
 */
export function needsForClass(needs: SchoolNeeds, className: string | null | undefined): SchoolNeeds {
  if (className && classNumber(className) !== null) return needs;
  const rules = { ...needs.rules };
  for (const key of PREVIOUS_SCHOOL_RULES) if (rules[key] === "required") rules[key] = "optional";
  return { ...needs, rules };
}

/**
 * Every column an export can have, in the order of the catalog, with its heading until the school renames it. `locked` columns are
 * in every export and cannot be turned off: the details every school keeps (the name, gender, birthday, age, category, class and
 * section, both parents' names and the mobile numbers, the address and the previous school).
 */
export const EXPORT_COLUMNS = [
  { key: "admissionNumber", heading: "Admission No." },
  { key: "studentName", heading: "Student Name", locked: true },
  { key: "firstName", heading: "First Name" },
  { key: "lastName", heading: "Last Name" },
  { key: "gender", heading: "Gender", locked: true },
  { key: "dateOfBirth", heading: "Date of Birth", locked: true },
  { key: "age", heading: "Age", locked: true },
  { key: "category", heading: "Category", locked: true },
  { key: "className", heading: "Class", locked: true },
  { key: "sectionName", heading: "Section", locked: true },
  { key: "rollNumber", heading: "Roll No." },
  { key: "admissionDate", heading: "Admission Date" },
  { key: "fatherName", heading: "Father's Name", locked: true },
  { key: "fatherMobile", heading: "Father's Mobile", locked: true },
  { key: "fatherOccupation", heading: "Father's Occupation" },
  { key: "motherName", heading: "Mother's Name", locked: true },
  { key: "motherMobile", heading: "Mother's Mobile", locked: true },
  { key: "motherOccupation", heading: "Mother's Occupation" },
  { key: "guardianName", heading: "Guardian's Name" },
  { key: "guardianMobile", heading: "Guardian's Mobile" },
  { key: "guardianRelation", heading: "Guardian's Relation" },
  { key: "parentEmail", heading: "Parent's Email" },
  { key: "address", heading: "Address", locked: true },
  { key: "area", heading: "Area or Landmark" },
  { key: "city", heading: "City or Village", locked: true },
  { key: "state", heading: "State", locked: true },
  { key: "pincode", heading: "PIN Code", locked: true },
  { key: "bloodGroup", heading: "Blood Group" },
  { key: "aadhaarNumber", heading: "Aadhaar No." },
  { key: "samagraId", heading: "Samagra ID" },
  { key: "apaarId", heading: "APAAR ID" },
  { key: "pen", heading: "PEN" },
  { key: "srNumber", heading: "SR / Scholar No." },
  { key: "religion", heading: "Religion" },
  { key: "nationality", heading: "Nationality" },
  { key: "emergencyMobile", heading: "Emergency / WhatsApp No." },
  { key: "disability", heading: "Disability (CWSN)" },
  { key: "medicalNotes", heading: "Medical / Allergy" },
  { key: "rteSeat", heading: "RTE Seat" },
  { key: "bpl", heading: "BPL" },
  { key: "feeConcession", heading: "Fee Concession" },
  { key: "transportRoute", heading: "Transport Route" },
  { key: "transportStop", heading: "Transport Stop" },
  { key: "previousSchool", heading: "Previous School", locked: true },
  { key: "lastClass", heading: "Last Class" },
  { key: "tcNumber", heading: "TC No." },
  { key: "tcDate", heading: "TC Date" },
] as const satisfies readonly { key: string; heading: string; locked?: boolean }[];

export type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]["key"];
export const LOCKED_EXPORT_COLUMNS = EXPORT_COLUMNS.filter((c) => "locked" in c && c.locked).map((c) => c.key) as ExportColumnKey[];

/** A new school's export: the details schools ask for most, in this order (the school changes it once and it is kept). */
export const DEFAULT_EXPORT_LAYOUT: ExportColumnKey[] = [
  "admissionNumber",
  "studentName",
  "gender",
  "dateOfBirth",
  "age",
  "category",
  "className",
  "sectionName",
  "fatherName",
  "fatherMobile",
  "fatherOccupation",
  "motherName",
  "motherMobile",
  "motherOccupation",
  "address",
  "area",
  "city",
  "state",
  "pincode",
  "previousSchool",
  "lastClass",
  "tcNumber",
  "tcDate",
  "bloodGroup",
  "aadhaarNumber",
];
export const MAX_EXPORT_HEADING = 60;

/**
 * A school's own fields, beyond the list above (a house, a bus pass number, a hostel room...): a name, the kind of answer, the
 * choices of a list, and needed / optional / not asked like the others. Their key is `c_` and a few letters and digits (no dots:
 * express-mongo-sanitize drops dotted body keys); a student's answers are kept in `Student.custom` by that key.
 */
export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "yesNo", "choice"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export const CUSTOM_KEY = /^c_[a-z0-9]{4,16}$/;
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_CUSTOM_LABEL = 40;
export const MAX_CUSTOM_OPTIONS = 30;
export const MAX_CUSTOM_OPTION = 40;
export const MAX_CUSTOM_TEXT = 200;
export interface CustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  /** The choices of a list ("choice"); empty for the other kinds. */
  options: string[];
  mode: FieldMode;
}
/** Everything a school needs of an admission: its decisions on the list, and its own fields. */
export interface SchoolNeeds {
  rules: FieldRules;
  custom: CustomFieldDef[];
}

/** "ADM-2026-0001": the school's prefix, the first year of the session the student joined in, and a running number. */
export const ADMISSION_PREFIX = "ADM";
export const admissionNumberOf = (startYear: number, sequence: number) =>
  `${ADMISSION_PREFIX}-${startYear}-${String(sequence).padStart(4, "0")}`;
