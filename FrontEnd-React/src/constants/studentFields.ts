/**
 * The details each school decides about, and the export's columns. The same lists as the server's (backend/src/main/students/
 * constants.ts: STUDENT_FORM_FIELDS, EXPORT_COLUMNS, DEFAULT_EXPORT_LAYOUT): the server checks everything again, these let a screen
 * show and check them before anything is sent.
 */

export type FieldMode = "required" | "optional" | "hidden";

export const RELIGIONS = ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Prefer not to say"] as const;
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

export type FieldGroup = "Student" | "Parents" | "Address" | "IDs" | "Previous school" | "More" | "Fees and transport";

/**
 * The details of an admission each school decides about: needed, optional or not asked. `message` is said when a needed one is
 * missing (the server's exact words). `yesNo` details are a tick: never needed.
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
] as const satisfies readonly { key: string; label: string; group: FieldGroup; default: FieldMode; message: string; yesNo?: boolean }[];

export type FormFieldKey = (typeof STUDENT_FORM_FIELDS)[number]["key"];
export type FieldRules = Record<FormFieldKey, FieldMode>;
export const DEFAULT_FIELD_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, f.default])) as FieldRules;
/** Every decidable detail optional: what a bulk upload is held to (the school's own needs are said as warnings, not refusals). */
export const LENIENT_FIELD_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, "optional"])) as FieldRules;
export const fieldOf = (key: FormFieldKey) => STUDENT_FORM_FIELDS.find((f) => f.key === key)!;

/** Always needed, whatever the school decides: the software itself depends on them. */
export const ALWAYS_NEEDED = ["Student's first and last name", "Gender", "Date of birth", "Class (and section, when the class has sections)", "Primary parent's name and mobile number"];

/** Every column an export can have, with its heading until the school renames it; `locked` ones are in every export. */
export const EXPORT_COLUMNS = [
  { key: "admissionNumber", heading: "Admission No.", group: "Student" },
  { key: "studentName", heading: "Student Name", group: "Student", locked: true },
  { key: "firstName", heading: "First Name", group: "Student" },
  { key: "lastName", heading: "Last Name", group: "Student" },
  { key: "gender", heading: "Gender", group: "Student", locked: true },
  { key: "dateOfBirth", heading: "Date of Birth", group: "Student", locked: true },
  { key: "age", heading: "Age", group: "Student", locked: true },
  { key: "category", heading: "Category", group: "Student", locked: true },
  { key: "className", heading: "Class", group: "Class", locked: true },
  { key: "sectionName", heading: "Section", group: "Class", locked: true },
  { key: "rollNumber", heading: "Roll No.", group: "Class" },
  { key: "admissionDate", heading: "Admission Date", group: "Class" },
  { key: "fatherName", heading: "Father's Name", group: "Parents", locked: true },
  { key: "fatherMobile", heading: "Father's Mobile", group: "Parents", locked: true },
  { key: "fatherOccupation", heading: "Father's Occupation", group: "Parents" },
  { key: "motherName", heading: "Mother's Name", group: "Parents", locked: true },
  { key: "motherMobile", heading: "Mother's Mobile", group: "Parents", locked: true },
  { key: "motherOccupation", heading: "Mother's Occupation", group: "Parents" },
  { key: "guardianName", heading: "Guardian's Name", group: "Parents" },
  { key: "guardianMobile", heading: "Guardian's Mobile", group: "Parents" },
  { key: "guardianRelation", heading: "Guardian's Relation", group: "Parents" },
  { key: "parentEmail", heading: "Parent's Email", group: "Parents" },
  { key: "address", heading: "Address", group: "Address", locked: true },
  { key: "area", heading: "Area or Landmark", group: "Address" },
  { key: "city", heading: "City or Village", group: "Address", locked: true },
  { key: "state", heading: "State", group: "Address", locked: true },
  { key: "pincode", heading: "PIN Code", group: "Address", locked: true },
  { key: "bloodGroup", heading: "Blood Group", group: "More" },
  { key: "aadhaarNumber", heading: "Aadhaar No.", group: "IDs" },
  { key: "samagraId", heading: "Samagra ID", group: "IDs" },
  { key: "apaarId", heading: "APAAR ID", group: "IDs" },
  { key: "pen", heading: "PEN", group: "IDs" },
  { key: "srNumber", heading: "SR / Scholar No.", group: "IDs" },
  { key: "religion", heading: "Religion", group: "More" },
  { key: "nationality", heading: "Nationality", group: "More" },
  { key: "emergencyMobile", heading: "Emergency / WhatsApp No.", group: "More" },
  { key: "disability", heading: "Disability (CWSN)", group: "More" },
  { key: "medicalNotes", heading: "Medical / Allergy", group: "More" },
  { key: "rteSeat", heading: "RTE Seat", group: "Fees and transport" },
  { key: "bpl", heading: "BPL", group: "Fees and transport" },
  { key: "feeConcession", heading: "Fee Concession", group: "Fees and transport" },
  { key: "transportRoute", heading: "Transport Route", group: "Fees and transport" },
  { key: "transportStop", heading: "Transport Stop", group: "Fees and transport" },
  { key: "previousSchool", heading: "Previous School", group: "Previous school", locked: true },
  { key: "lastClass", heading: "Last Class", group: "Previous school" },
  { key: "tcNumber", heading: "TC No.", group: "Previous school" },
  { key: "tcDate", heading: "TC Date", group: "Previous school" },
] as const satisfies readonly { key: string; heading: string; group: string; locked?: boolean }[];

/** The names of the fields on the list (the export's headings and the form's labels): a field of the school's own cannot take one (the server says the same). */
const LIST_NAMES = new Map<string, string>([
  ...EXPORT_COLUMNS.map((c) => [c.heading.toLowerCase(), c.heading] as [string, string]),
  ...STUDENT_FORM_FIELDS.map((f) => [f.label.toLowerCase(), f.label] as [string, string]),
]);
/** The field of the list called `name` (as the list writes it), whatever the case or the spaces; nothing when no field has that name. */
export const listFieldNamed = (name: string): string | undefined => LIST_NAMES.get(name.trim().replace(/\s+/g, " ").toLowerCase());

export type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]["key"];
export const exportColumnOf = (key: ExportColumnKey) => EXPORT_COLUMNS.find((c) => c.key === key)!;
export const isLockedColumn = (key: ExportColumnKey) => "locked" in exportColumnOf(key) && !!(exportColumnOf(key) as { locked?: boolean }).locked;
export const MAX_EXPORT_HEADING = 60;

/**
 * A school's own fields, beyond the list (a house, a bus pass number...): the kind of answer each takes. Mirrors the server's
 * CUSTOM_FIELD_TYPES and limits (backend/src/main/students/constants.ts).
 */
export const CUSTOM_FIELD_TYPES = [
  { type: "text", label: "Text", hint: "Words or a code, up to 200 characters" },
  { type: "number", label: "Number", hint: "A number, such as a height or a pass number of digits" },
  { type: "date", label: "Date", hint: "A day, chosen on a calendar" },
  { type: "yesNo", label: "Yes / No", hint: "A tick (never mandatory)" },
  { type: "choice", label: "List of choices", hint: "One of the choices you write, such as a house" },
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]["type"];
export interface CustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  /** The choices of a list; empty for the other kinds. */
  options: string[];
  mode: FieldMode;
}
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_CUSTOM_LABEL = 40;
export const MAX_CUSTOM_OPTIONS = 30;
export const MAX_CUSTOM_OPTION = 40;
export const MAX_CUSTOM_TEXT = 200;
export const isCustomKey = (key: string) => /^c_[a-z0-9]{4,16}$/.test(key);
/** A new field's key: `c_` and 10 letters and digits (no dots: the server's sanitiser drops dotted keys). */
export const newCustomKey = () => `c_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();

/**
 * The steps of Add student and the details a school may put in any of them (the server's ADMIT_STEPS / MOVABLE_FIELDS). The name, the
 * gender, the birthday, the category, the class, the parents, the address and the previous school stay in their own step; the details
 * here, and the school's own fields, can go to any step, in any order. The first three steps are always there; More details and the
 * steps a school adds (`StepDef`) follow them, in the order the school chose. `step` is where a new school has each detail (the ones it
 * does not ask are spread over the four steps, so the steps are about as long as each other); the order of this list is the order a new
 * school has them in within a step.
 */
export const ADMIT_STEPS = ["personal", "academic", "parents", "more"] as const;
/** A step's key: one of the four, or a step of the school's own (`s_` and a few letters and digits). */
export type AdmitStepKey = string;
export const STEP_NAMES: Record<(typeof ADMIT_STEPS)[number], string> = { personal: "Personal info", academic: "Academic", parents: "Parents", more: "More details" };
export const MAX_CUSTOM_STEPS = 4;
export const MAX_STEP_NAME = 30;
export const isCustomStepKey = (key: string) => /^s_[a-z0-9]{4,16}$/.test(key);
/** A new step's key: `s_` and 10 letters and digits (no dots: the server's sanitiser drops dotted keys). */
export const newStepKey = () => `s_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
/** A step after Parents: More details (key "more") or one the school added. */
export interface StepDef {
  key: string;
  name: string;
}
/** The steps a school that added none has: More details alone. */
export const USUAL_STEPS: readonly StepDef[] = [{ key: "more", name: STEP_NAMES.more }];
/** The steps are the usual ones. */
export const isUsualSteps = (steps: readonly StepDef[]) => steps.length === 1 && steps[0].key === "more";
/** The steps after Parents as given, with More details (under its own name) put first when it was left out. */
export function effectiveSteps(saved: readonly StepDef[] | null | undefined): StepDef[] {
  const seen = new Set<string>();
  const list: StepDef[] = [];
  for (const s of saved ?? []) {
    if (seen.has(s.key)) continue;
    if (s.key === "more") list.push({ key: "more", name: STEP_NAMES.more });
    else if (isCustomStepKey(s.key)) list.push({ key: s.key, name: s.name });
    else continue;
    seen.add(s.key);
  }
  return seen.has("more") ? list : [...USUAL_STEPS, ...list];
}

export const MOVABLE_FIELDS = [
  { key: "bloodGroup", step: "personal" },
  { key: "srNumber", step: "academic" },
  { key: "pen", step: "academic" },
  { key: "aadhaarNumber", step: "academic" },
  { key: "emergencyMobile", step: "parents" },
  { key: "rteSeat", step: "parents" },
  { key: "bpl", step: "parents" },
  { key: "religion", step: "more" },
  { key: "samagraId", step: "more" },
  { key: "apaarId", step: "more" },
  { key: "nationality", step: "more" },
  { key: "disability", step: "more" },
  { key: "medicalNotes", step: "more" },
  { key: "feeConcession", step: "more" },
  { key: "transportRoute", step: "more" },
  { key: "transportStop", step: "more" },
] as const satisfies readonly { key: FormFieldKey; step: AdmitStepKey }[];
export type MovableKey = (typeof MOVABLE_FIELDS)[number]["key"];
const MOVABLE_KEYS: ReadonlySet<string> = new Set(MOVABLE_FIELDS.map((f) => f.key));
export const isMovableKey = (key: string): key is MovableKey => MOVABLE_KEYS.has(key);
/** Where one detail is asked: a detail of the list or one of the school's own (its `c_` key), and its step. The list's order is the order within a step. */
export interface Placement {
  key: string;
  step: AdmitStepKey;
}

/**
 * The places of every movable detail and every own field: the ones given (an unknown key and a repeat are dropped, a step that is no
 * longer there becomes More details), then the rest at the end of their usual step.
 */
export function effectivePlacements(saved: readonly Placement[] | null | undefined, custom: readonly { key: string }[], steps: readonly { key: string }[] = USUAL_STEPS): Placement[] {
  const known = new Set<string>([...MOVABLE_KEYS, ...custom.map((f) => f.key)]);
  const stepKeys = new Set<string>([...ADMIT_STEPS, ...steps.map((s) => s.key)]);
  const seen = new Set<string>();
  const kept: Placement[] = [];
  for (const p of saved ?? []) {
    if (!known.has(p.key) || seen.has(p.key)) continue;
    seen.add(p.key);
    kept.push({ key: p.key, step: stepKeys.has(p.step) ? p.step : "more" });
  }
  const usual: Placement[] = [...MOVABLE_FIELDS.map((f) => ({ key: f.key as string, step: f.step as string })), ...custom.map((f) => ({ key: f.key, step: "more" }))];
  return [...kept, ...usual.filter((p) => !seen.has(p.key))];
}

/** Every detail is in its usual step, in its usual order. */
export const isUsualPlacements = (placements: readonly Placement[], custom: readonly { key: string }[]) =>
  JSON.stringify(placements) === JSON.stringify(effectivePlacements(null, custom));

/**
 * Details no school can change (the server's FIXED_RULES): the address is always needed, and so is the previous school's name for a
 * student of Class 1 to 12 (`effectiveRules`: before Class 1 it is optional).
 */
export const FIXED_RULES = {
  addressLine1: "required",
  addressCity: "required",
  addressState: "required",
  addressPincode: "required",
  previousSchoolName: "required",
} as const satisfies Partial<Record<FormFieldKey, FieldMode>>;
/** Details that are always asked: a school makes them needed or optional, never not asked. */
export const ALWAYS_ASKED_RULES: readonly FormFieldKey[] = ["category"];
/** The previous school's boxes: needed (when the school says so) only for a student of Class 1 to 12. */
export const PREVIOUS_SCHOOL_RULES: readonly FormFieldKey[] = ["previousSchoolName", "previousSchoolLastClass", "previousSchoolTcNumber"];

/** A new school's export, the server's default (also what "Back to the default" puts back). */
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
