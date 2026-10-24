import { MAX_AGE, MAX_ROLL_NUMBER, MESSAGES, MIN_AGE } from "../constants/students";
import { DEFAULT_FIELD_RULES, MAX_CUSTOM_TEXT, STUDENT_FORM_FIELDS, type CustomFieldDef, type FieldRules, type FormFieldKey } from "../constants/studentFields";
import type { Tone } from "../constants/tones";
import type {
  AdmitStudentInput,
  Gender,
  GuardianMatch,
  MoveStudentInput,
  RecordTextKey,
  Relation,
  StudentDetail,
  StudentPlace,
  UpdateGuardianInput,
  UpdateStudentInput,
} from "../types";
import { isEmail, isIndianMobile } from "./validators";

// ---------------------------------------------------------------------------------------------------------------------------
// What the admission form and the student's edit form hold while a person types (both use the same boxes).
// ---------------------------------------------------------------------------------------------------------------------------

/** One guardian's boxes, and (on the admission form) what the mobile number lookup found. */
export interface GuardianDraft {
  /** A key for React only. */
  key: string;
  /** On a student's page: the guardian's id (their details are saved with PATCH /students/guardians/:id). */
  id: string | null;
  mobile: string;
  name: string;
  relation: Relation | "";
  isPrimary: boolean;
  alternateMobile: string;
  email: string;
  occupation: string;
  /** The school's guardian with this mobile number (admission form), and whether to keep their details or update them. */
  match: GuardianMatch | null;
  /** The mobile number that was looked up last (so the same number is never asked twice). */
  lookedUp: string | null;
  choice: "use" | "update";
  /** Details typed without a mobile number (a second guardian whose number is not known). */
  manual: boolean;
}

/** The student's records a school may keep, as their boxes hold them (the text ones). */
export const RECORD_TEXT_KEYS = [
  "aadhaarNumber",
  "samagraId",
  "apaarId",
  "pen",
  "srNumber",
  "religion",
  "nationality",
  "emergencyMobile",
  "disability",
  "medicalNotes",
  "feeConcession",
  "transportRoute",
  "transportStop",
] as const satisfies readonly RecordTextKey[];

export type StudentFormValues = {
  firstName: string;
  lastName: string;
  gender: Gender | "";
  dateOfBirth: string;
  admissionDate: string;
  classId: string;
  /** "" = none picked (or the class has no sections). */
  sectionId: string;
  rollNumber: string;
  guardians: GuardianDraft[];
  address: { line1: string; line2: string; city: string; state: string; pincode: string };
  bloodGroup: string;
  category: string;
  previousSchool: { name: string; lastClass: string; tcNumber: string; tcDate: string };
  rteSeat: boolean;
  bpl: boolean;
  /** The school's own fields, by key, as their boxes hold them: text (a number and a day too) or a tick. */
  custom: Record<string, string | boolean>;
} & Record<RecordTextKey, string>;

/** What is wrong, by the same paths the server uses ("firstName", "address.city", "guardians.0.mobile"). */
export type FormErrors = Record<string, string>;

let keys = 0;
export const newGuardianKey = () => `g${++keys}`;

export const emptyGuardian = (isPrimary: boolean, relation: Relation | "" = ""): GuardianDraft => ({
  key: newGuardianKey(),
  id: null,
  mobile: "",
  name: "",
  relation,
  isPrimary,
  alternateMobile: "",
  email: "",
  occupation: "",
  match: null,
  lookedUp: null,
  choice: "use",
  manual: false,
});

/** "2026-10-22": today in India, the day the server checks against too. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const emptyRecords = () => Object.fromEntries(RECORD_TEXT_KEYS.map((k) => [k, ""])) as Record<RecordTextKey, string>;

/**
 * A new admission's boxes. When the school needs both parents, the form starts with the father (the primary contact, by mobile number)
 * and the mother (her name boxes open at once: her number may be unknown).
 */
export const emptyStudentForm = (rules?: FieldRules): StudentFormValues => ({
  firstName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  admissionDate: todayInIndia(),
  classId: "",
  sectionId: "",
  rollNumber: "",
  guardians: rules?.secondParent === "required" ? [emptyGuardian(true, "Father"), { ...emptyGuardian(false, "Mother"), manual: true }] : [emptyGuardian(true, "Father")],
  address: { line1: "", line2: "", city: "", state: "", pincode: "" },
  bloodGroup: "",
  category: "",
  previousSchool: { name: "", lastClass: "", tcNumber: "", tcDate: "" },
  ...emptyRecords(),
  rteSeat: false,
  bpl: false,
  custom: {},
});

/** A student's saved details as the edit form's starting point (the boxes show exactly what is saved). */
export function formFromStudent(s: StudentDetail): StudentFormValues {
  return {
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    admissionDate: s.admissionDate,
    classId: s.place?.classId ?? "",
    sectionId: s.place?.sectionId ?? "",
    rollNumber: s.place?.rollNumber != null ? String(s.place.rollNumber) : "",
    guardians: s.guardians.map((g) => ({
      ...emptyGuardian(g.isPrimary, g.relation),
      key: g.id,
      id: g.id,
      mobile: g.mobile ?? "",
      name: g.name,
      alternateMobile: g.alternateMobile ?? "",
      email: g.email ?? "",
      occupation: g.occupation ?? "",
      manual: true,
    })),
    address: {
      line1: s.address.line1 ?? "",
      line2: s.address.line2 ?? "",
      city: s.address.city ?? "",
      state: s.address.state ?? "",
      pincode: s.address.pincode ?? "",
    },
    bloodGroup: s.bloodGroup ?? "",
    category: s.category ?? "",
    previousSchool: {
      name: s.previousSchool?.name ?? "",
      lastClass: s.previousSchool?.lastClass ?? "",
      tcNumber: s.previousSchool?.tcNumber ?? "",
      tcDate: s.previousSchool?.tcDate ?? "",
    },
    ...(Object.fromEntries(RECORD_TEXT_KEYS.map((k) => [k, s[k] ?? ""])) as Record<RecordTextKey, string>),
    rteSeat: !!s.rteSeat,
    bpl: !!s.bpl,
    custom: Object.fromEntries(Object.entries(s.custom ?? {}).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)])),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading and writing one box by its path.
// ---------------------------------------------------------------------------------------------------------------------------

type Tree = Record<string, unknown> | unknown[];

export function getAt(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node == null ? undefined : (node as Record<string, unknown>)[part]), root);
}

/** A copy of `root` with the value at `path` replaced (only the objects on the way are copied). */
export function setAt<T>(root: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const node = root as unknown as Tree;
  const copy: Tree = Array.isArray(node) ? [...node] : { ...(node as Record<string, unknown>) };
  (copy as Record<string, unknown>)[head] = rest.length === 0 ? value : setAt((node as Record<string, unknown>)[head], rest.join("."), value);
  return copy as unknown as T;
}

// ---------------------------------------------------------------------------------------------------------------------------
// The rules, with the server's words (backend/src/main/students/schemas/students.schemas.ts).
// ---------------------------------------------------------------------------------------------------------------------------

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
const ANGLE = /[<>]/;

function nameProblem(value: string, what: string, max: number): string | undefined {
  const t = tidy(value);
  if (!t) return MESSAGES.enter(what);
  if (t.length < 2 || t.length > max) return MESSAGES.length(what, max);
  if (ANGLE.test(t)) return MESSAGES.brackets(what);
}

function textProblem(value: string, what: string, max: number, required?: { empty: string; min: number }): string | undefined {
  const t = tidy(value);
  if (required && t.length < required.min) return required.empty;
  if (t.length > max) return MESSAGES.tooLong(what, max);
  if (ANGLE.test(t)) return MESSAGES.brackets(what);
}

/** A real calendar day, not after today. */
function dayProblem(value: string, what: string, inFuture: string, today: string, required = true): string | undefined {
  if (!value) return required ? MESSAGES.chooseDay(what) : undefined;
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value || day.getUTCFullYear() < 1900) {
    return MESSAGES.validDay(what);
  }
  if (value > today) return inFuture;
}

/** Whole years from one calendar day to another. */
export function ageOn(dateOfBirth: string, day: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Verhoeff's check digit (the last digit of every Aadhaar number). */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
/** 12 digits, not starting with 0 or 1, with the right check digit (spaces and dashes are allowed between them). */
export function isAadhaar(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  return /^[2-9]\d{11}$/.test(digits) && [...digits].reverse().reduce((c, digit, i) => VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(digit)]], 0) === 0;
}
const onlyDigits = (value: string) => value.replace(/[\s-]/g, "");

/** The format of each record a school may keep (nothing to say when it is empty: whether it is needed is the school's choice). */
const RECORD_CHECKS: Partial<Record<RecordTextKey, (value: string) => string | undefined>> = {
  aadhaarNumber: (v) => (isAadhaar(v) ? undefined : MESSAGES.aadhaar),
  samagraId: (v) => (/^\d{8,9}$/.test(onlyDigits(v)) ? undefined : MESSAGES.samagra),
  apaarId: (v) => (/^\d{12}$/.test(onlyDigits(v)) ? undefined : MESSAGES.apaar),
  pen: (v) => (/^\d{11}$/.test(onlyDigits(v)) ? undefined : MESSAGES.pen),
  srNumber: (v) => textProblem(v, "SR / Scholar number", 30),
  nationality: (v) => textProblem(v, "nationality", 40),
  emergencyMobile: (v) => (isIndianMobile(v) ? undefined : MESSAGES.mobile),
  medicalNotes: (v) => textProblem(v, "medical notes", 300),
  feeConcession: (v) => textProblem(v, "fee concession", 80),
  transportRoute: (v) => textProblem(v, "transport route", 60),
  transportStop: (v) => textProblem(v, "transport stop", 60),
};

/** The box each needed detail is about, by its path. */
const RULE_PATHS: Partial<Record<FormFieldKey, string>> = {
  addressLine1: "address.line1",
  addressArea: "address.line2",
  addressCity: "address.city",
  addressState: "address.state",
  addressPincode: "address.pincode",
  previousSchoolName: "previousSchool.name",
  previousSchoolLastClass: "previousSchool.lastClass",
  previousSchoolTcNumber: "previousSchool.tcNumber",
  previousSchoolTcDate: "previousSchool.tcDate",
};
/** The path of a box a school decides about ("addressCity" -> "address.city", "aadhaarNumber" -> "aadhaarNumber"). */
export const pathOfRule = (key: FormFieldKey) => RULE_PATHS[key] ?? key;

/** The box whose rule a guardian follows: a parent the school has, kept as they are, has nothing to check but the relation. */
export const keepsDetails = (g: GuardianDraft) => !!g.match && g.choice === "use";

/**
 * Everything the server would refuse that can be seen from the boxes alone, with its words. `classHasSections` decides whether a
 * section is needed (the server checks it against the year's sections). `rules` are the school's needs (Manage school > Students >
 * Fields): a needed detail left empty is said with its own message; a detail that is not needed is checked only when it is filled.
 */
export function checkStudentForm(
  v: StudentFormValues,
  options: {
    classHasSections: boolean;
    admissionDateRequired: boolean;
    today?: string;
    rules?: FieldRules;
    /** A student's edit form: what is saved. A needed detail is then asked for only when it was saved and is emptied (like the server). */
    saved?: StudentFormValues;
    /** The school's own fields: a needed one left empty has its message, a given one is checked for its kind. */
    custom?: CustomFieldDef[];
  }
): FormErrors {
  const today = options.today ?? todayInIndia();
  const rules = options.rules ?? DEFAULT_FIELD_RULES;
  const needs = (key: FormFieldKey) => rules[key] === "required";
  const errors: FormErrors = {};
  const put = (path: string, message: string | undefined) => {
    if (message && !errors[path]) errors[path] = message;
  };

  put("firstName", nameProblem(v.firstName, "first name", 50));
  put("lastName", nameProblem(v.lastName, "last name", 50));
  if (!v.gender) put("gender", MESSAGES.gender);
  put("dateOfBirth", dayProblem(v.dateOfBirth, "date of birth", MESSAGES.bornInFuture, today));
  // An admission may leave it empty (the server takes today) unless the school needs it; a saved student keeps one.
  put("admissionDate", dayProblem(v.admissionDate, "admission date", MESSAGES.admittedInFuture, today, options.admissionDateRequired || needs("admissionDate")));
  if (!errors.dateOfBirth && !errors.admissionDate) {
    const age = ageOn(v.dateOfBirth, v.admissionDate || today);
    if (age < MIN_AGE || age > MAX_AGE) put("dateOfBirth", MESSAGES.age);
  }

  if (!v.classId) put("classId", MESSAGES.className);
  else if (options.classHasSections && !v.sectionId) put("sectionId", MESSAGES.section);
  if (v.rollNumber.trim()) {
    const roll = Number(v.rollNumber);
    if (!Number.isInteger(roll) || roll < 1 || roll > MAX_ROLL_NUMBER) put("rollNumber", MESSAGES.rollNumber);
  }

  const primaries = v.guardians.filter((g) => g.isPrimary).length;
  if (primaries !== 1) put("guardians", MESSAGES.onePrimary);
  const mobiles = new Set<string>();
  v.guardians.forEach((g, i) => {
    const at = (field: string) => `guardians.${i}.${field}`;
    if (g.mobile) {
      if (!isIndianMobile(g.mobile)) put(at("mobile"), MESSAGES.mobile);
      else if (mobiles.has(g.mobile)) put(at("mobile"), MESSAGES.sameMobile);
      mobiles.add(g.mobile);
    } else if (g.isPrimary) {
      put(at("mobile"), MESSAGES.mobileMissing);
    }
    if (!g.relation) put(at("relation"), MESSAGES.relation);
    if (keepsDetails(g)) return;
    put(at("name"), nameProblem(g.name, "guardian's name", 80));
    if (g.alternateMobile) {
      if (!isIndianMobile(g.alternateMobile)) put(at("alternateMobile"), MESSAGES.mobile);
      else if (g.alternateMobile === g.mobile) put(at("alternateMobile"), MESSAGES.alternateSame);
    }
    if (g.email.trim() && (!isEmail(g.email) || g.email.trim().length > 254)) put(at("email"), MESSAGES.email);
    put(at("occupation"), textProblem(g.occupation, "occupation", 60));
    const savedOccupation = options.saved?.guardians.find((s) => s.key === g.key)?.occupation;
    const emptied = !options.saved || !!tidy(savedOccupation ?? "");
    if (needs("guardianOccupation") && emptied && !tidy(g.occupation)) put(at("occupation"), ruleMessage("guardianOccupation"));
  });
  if (needs("secondParent") && !options.saved && v.guardians.length > 0) {
    const relations = new Set(v.guardians.map((g) => g.relation));
    if (!relations.has("Father") || !relations.has("Mother")) put("guardians", ruleMessage("secondParent"));
  }

  // The address: each part as the school wants it, and right when it is filled.
  const a = v.address;
  if (tidy(a.line1)) put("address.line1", textProblem(a.line1, "address", 200, { empty: MESSAGES.street, min: 3 }));
  put("address.line2", textProblem(a.line2, "area or landmark", 200));
  if (tidy(a.city)) put("address.city", textProblem(a.city, "city", 80, { empty: MESSAGES.city, min: 2 }));
  if (a.pincode.trim() && !/^\d{6}$/.test(a.pincode.trim())) put("address.pincode", MESSAGES.pincode);

  const p = v.previousSchool;
  const anything = tidy(p.lastClass) || tidy(p.tcNumber) || p.tcDate;
  if ((!tidy(p.name) && anything) || (tidy(p.name) && tidy(p.name).length < 2)) put("previousSchool.name", MESSAGES.previousSchool);
  put("previousSchool.name", textProblem(p.name, "school name", 150));
  put("previousSchool.lastClass", textProblem(p.lastClass, "class", 40));
  put("previousSchool.tcNumber", textProblem(p.tcNumber, "TC number", 40));
  put("previousSchool.tcDate", dayProblem(p.tcDate, "TC date", MESSAGES.tcInFuture, today, false));

  for (const key of RECORD_TEXT_KEYS) {
    const value = v[key];
    if (tidy(value)) put(key, RECORD_CHECKS[key]?.(value));
  }

  // What the school needs and is still empty (after the format checks, so a wrong box says what is wrong with it).
  for (const field of STUDENT_FORM_FIELDS) {
    if (!needs(field.key) || ("yesNo" in field && field.yesNo) || field.key === "guardianOccupation" || field.key === "secondParent") continue;
    const path = pathOfRule(field.key);
    const value = getAt(v, path);
    // On a student's page a detail that was never filled (the student came before the rule, or from an old sheet) is not forced.
    if (options.saved && !tidy(String(getAt(options.saved, path) ?? ""))) continue;
    if (typeof value === "string" && !tidy(value)) put(path, field.message);
  }

  // The school's own fields, with the server's words.
  for (const field of options.custom ?? []) {
    if (field.type === "yesNo") continue;
    const path = `custom.${field.key}`;
    const text = tidy(String(v.custom[field.key] ?? ""));
    if (text) put(path, customProblem(field, text));
    else if (field.mode === "required" && !(options.saved && !tidy(String(options.saved.custom[field.key] ?? "")))) put(path, customNeedMessage(field));
  }
  return errors;
}

/** What a needed field of the school's own says when it is missing (the server's words). */
export const customNeedMessage = (field: CustomFieldDef) => `${field.type === "choice" || field.type === "date" ? "Choose" : "Enter"} the ${field.label}`;

/** What is wrong with a filled box of the school's own field (the server's words), or nothing. */
function customProblem(field: CustomFieldDef, text: string): string | undefined {
  if (field.type === "number") return /^-?\d+(\.\d+)?$/.test(text) && Math.abs(Number(text)) <= 1e12 ? undefined : `Enter a number for ${field.label}`;
  // A real day from 1900 to 2100 (the server's range).
  if (field.type === "date") return dayProblem(text, field.label, "after 2100", "2100-12-31") ? `Choose a valid date for ${field.label}` : undefined;
  if (field.type === "choice") return field.options.includes(text) ? undefined : `Choose the ${field.label} from the list`;
  if (text.length > MAX_CUSTOM_TEXT) return `Keep the ${field.label} under ${MAX_CUSTOM_TEXT} characters`;
  if (ANGLE.test(text)) return `The ${field.label} cannot contain < or >`;
  return undefined;
}

/** The answers of the school's own fields as they are sent: a number as a number, a tick, text tidied; an empty box is left out. */
function customAnswersOf(values: StudentFormValues["custom"], fields: CustomFieldDef[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.type === "yesNo") {
      if (value === true) out[field.key] = true;
      continue;
    }
    const text = tidy(String(value ?? ""));
    if (text) out[field.key] = field.type === "number" ? Number(text) : text;
  }
  return out;
}

/** The message said when a needed detail is missing (the server's words). */
export const ruleMessage = (key: FormFieldKey) => STUDENT_FORM_FIELDS.find((f) => f.key === key)!.message;

// ---------------------------------------------------------------------------------------------------------------------------
// What is sent.
// ---------------------------------------------------------------------------------------------------------------------------

const orUndefined = (text: string) => tidy(text) || undefined;

function previousSchoolOf(v: StudentFormValues) {
  const p = v.previousSchool;
  if (!tidy(p.name) && !tidy(p.lastClass) && !tidy(p.tcNumber) && !p.tcDate) return undefined;
  return { name: orUndefined(p.name), lastClass: orUndefined(p.lastClass), tcNumber: orUndefined(p.tcNumber), tcDate: p.tcDate || undefined };
}

/** The address as it is sent: only the parts given (nothing at all when every part is empty). */
const addressOf = (v: StudentFormValues) => {
  const a = { line1: orUndefined(v.address.line1), line2: orUndefined(v.address.line2), city: orUndefined(v.address.city), state: v.address.state || undefined, pincode: orUndefined(v.address.pincode) };
  return Object.values(a).some(Boolean) ? a : undefined;
};

/** The records as they are sent with an admission: the ones given. */
const recordsOf = (v: StudentFormValues) => ({
  ...Object.fromEntries(RECORD_TEXT_KEYS.flatMap((k) => (tidy(v[k]) ? [[k, tidy(v[k])]] : []))),
  ...(v.rteSeat ? { rteSeat: true } : {}),
  ...(v.bpl ? { bpl: true } : {}),
});

/** POST /students: the form as one admission. A parent the school has is sent by their id (kept as they are unless "update"). */
export function toAdmission(v: StudentFormValues, flags: { allowOverCapacity: boolean; confirmNotDuplicate: boolean }, custom: CustomFieldDef[] = []): AdmitStudentInput {
  const answers = customAnswersOf(v.custom, custom);
  return {
    ...(Object.keys(answers).length > 0 ? { custom: answers } : {}),
    firstName: v.firstName,
    lastName: v.lastName,
    gender: v.gender as Gender,
    dateOfBirth: v.dateOfBirth,
    admissionDate: v.admissionDate || undefined,
    address: addressOf(v),
    bloodGroup: v.bloodGroup || undefined,
    category: v.category || undefined,
    previousSchool: previousSchoolOf(v),
    ...recordsOf(v),
    classId: v.classId,
    sectionId: v.sectionId || null,
    rollNumber: v.rollNumber.trim() ? Number(v.rollNumber) : undefined,
    guardians: v.guardians.map((g) => {
      const base = { relation: g.relation as Relation, isPrimary: g.isPrimary, mobile: g.mobile || undefined };
      const details = { alternateMobile: g.alternateMobile || undefined, email: orUndefined(g.email), occupation: orUndefined(g.occupation) };
      if (g.match) {
        const update = g.choice === "update";
        return { ...base, guardianId: g.match.id, updateDetails: update, name: update ? g.name : g.match.name, ...(update ? details : {}) };
      }
      return { ...base, name: g.name, ...details };
    }),
    ...flags,
  };
}

/** PATCH /students/:id: only the student's own boxes that differ from what is saved (an emptied optional one is cleared). */
export function profileChanges(v: StudentFormValues, saved: StudentFormValues, custom: CustomFieldDef[] = []): UpdateStudentInput {
  const changes: UpdateStudentInput = {};
  // The school's own fields: each answer that differs (an emptied one is taken away).
  const now = customAnswersOf(v.custom, custom);
  const before = customAnswersOf(saved.custom, custom);
  const own: Record<string, string | number | boolean | null> = {};
  for (const field of custom) {
    if (now[field.key] === before[field.key]) continue;
    own[field.key] = field.type === "yesNo" ? now[field.key] === true : (now[field.key] ?? null);
  }
  if (Object.keys(own).length > 0) changes.custom = own;
  if (tidy(v.firstName) !== tidy(saved.firstName)) changes.firstName = v.firstName;
  if (tidy(v.lastName) !== tidy(saved.lastName)) changes.lastName = v.lastName;
  if (v.gender !== saved.gender) changes.gender = v.gender as Gender;
  if (v.dateOfBirth !== saved.dateOfBirth) changes.dateOfBirth = v.dateOfBirth;
  if (v.admissionDate !== saved.admissionDate) changes.admissionDate = v.admissionDate;
  if (JSON.stringify(addressOf(v)) !== JSON.stringify(addressOf(saved))) changes.address = addressOf(v) ?? {};
  if (v.bloodGroup !== saved.bloodGroup) changes.bloodGroup = v.bloodGroup || null;
  if (v.category !== saved.category) changes.category = v.category || null;
  if (JSON.stringify(previousSchoolOf(v)) !== JSON.stringify(previousSchoolOf(saved))) changes.previousSchool = previousSchoolOf(v) ?? null;
  for (const key of RECORD_TEXT_KEYS) if (tidy(v[key]) !== tidy(saved[key])) changes[key] = tidy(v[key]) || null;
  if (v.rteSeat !== saved.rteSeat) changes.rteSeat = v.rteSeat;
  if (v.bpl !== saved.bpl) changes.bpl = v.bpl;
  return changes;
}

/** PATCH /students/:id/enrolment: the class, the section and the roll number, when any of them differs. */
export function placementChanges(v: StudentFormValues, saved: StudentFormValues, allowOverCapacity: boolean): MoveStudentInput | null {
  const moved = v.classId !== saved.classId || v.sectionId !== saved.sectionId;
  const rollChanged = v.rollNumber.trim() !== saved.rollNumber.trim();
  if (!moved && !rollChanged) return null;
  return {
    ...(v.classId !== saved.classId ? { classId: v.classId } : {}),
    ...(moved ? { sectionId: v.sectionId || null, allowOverCapacity } : {}),
    ...(rollChanged || moved ? { rollNumber: v.rollNumber.trim() ? Number(v.rollNumber) : null } : {}),
  };
}

/** PATCH /students/guardians/:id: a guardian's own boxes that differ from what is saved. */
export function guardianChanges(g: GuardianDraft, saved: GuardianDraft): UpdateGuardianInput {
  const changes: UpdateGuardianInput = {};
  if (tidy(g.name) !== tidy(saved.name)) changes.name = g.name;
  if (g.mobile !== saved.mobile) changes.mobile = g.mobile;
  if (g.alternateMobile !== saved.alternateMobile) changes.alternateMobile = g.alternateMobile || null;
  if (tidy(g.email) !== tidy(saved.email)) changes.email = tidy(g.email) || null;
  if (tidy(g.occupation) !== tidy(saved.occupation)) changes.occupation = tidy(g.occupation) || null;
  return changes;
}

// ---------------------------------------------------------------------------------------------------------------------------
// How a student is shown.
// ---------------------------------------------------------------------------------------------------------------------------

/** "Class 5 - A", or "Class 5" for a class without sections. */
export const placeLabel = (place: Pick<StudentPlace, "className" | "sectionName"> | null | undefined) =>
  place ? (place.sectionName ? `${place.className} - ${place.sectionName}` : place.className) : "No class this year";

/** "98765 43210". */
export const formatMobile = (mobile: string | null | undefined) => (mobile && mobile.length === 10 ? `${mobile.slice(0, 5)} ${mobile.slice(5)}` : (mobile ?? ""));

/** "2345 6789 0124": an Aadhaar number in its groups of four. */
export const formatAadhaar = (aadhaar: string | null | undefined) => (aadhaar && aadhaar.length === 12 ? aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ") : (aadhaar ?? ""));

/** Digits only, at most 10: what a phone box keeps of what was typed or pasted (+91 and a leading 0 are dropped). */
export function mobileDigits(typed: string): string {
  let digits = typed.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * The page numbers to show under the list: all of them while there are few, else the first, the last, the ones around the current page
 * and "gap" for each hole (1 ... 4 5 6 ... 20). Never more than 7 entries, so the row fits a phone.
 */
export function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", total];
  if (current >= total - 3) return [1, "gap", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "gap", current - 1, current, current + 1, "gap", total];
}

const AVATAR_TONES: Tone[] = ["primary", "success", "warning", "info", "danger", "navy"];
/** Each student keeps one colour for their initials, picked from their admission number. */
export function avatarTone(seed: string): Tone {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** "8 years" today. */
export function ageText(dateOfBirth: string): string {
  const age = ageOn(dateOfBirth, todayInIndia());
  return `${age} year${age === 1 ? "" : "s"}`;
}
