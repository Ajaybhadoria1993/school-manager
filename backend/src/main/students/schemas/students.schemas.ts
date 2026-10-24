import { z } from "zod";
import { INDIAN_STATES } from "../../tenants/constants";
import { INDIAN_MOBILE, optional, phoneNumber } from "../../../utils/formFields";
import {
  BLOOD_GROUPS,
  CATEGORIES,
  CUSTOM_FIELD_TYPES,
  CUSTOM_KEY,
  DISABILITIES,
  EXPORT_COLUMNS,
  FIELD_MODES,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_LABEL,
  MAX_CUSTOM_OPTION,
  MAX_CUSTOM_OPTIONS,
  MAX_CUSTOM_TEXT,
  type CustomFieldDef,
  type CustomFieldType,
  type FieldMode,
  type SchoolNeeds,
  GENDERS,
  LOCKED_EXPORT_COLUMNS,
  MAX_EXPORT_HEADING,
  RELIGIONS,
  STUDENT_FORM_FIELDS,
  type ExportColumnKey,
  type FieldRules,
  type FormFieldKey,
  MAX_AGE,
  MAX_GUARDIANS,
  MAX_IMPORT_ROWS_PER_REQUEST,
  MAX_ROLL_NUMBER,
  MIN_AGE,
  MIN_GUARDIANS,
  RELATIONS,
} from "../constants";

const OBJECT_ID = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(OBJECT_ID, "Invalid id");

export const idParamSchema = z.object({ id: objectId });

/**
 * The messages a person can see, in one place. The admission screen repeats these exact words (FrontEnd-React
 * constants/students.ts) to say what is wrong before anything is sent; the server says the same thing if it gets there anyway.
 */
export const MOBILE_MESSAGE = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";
export const AGE_MESSAGE = `The student must be ${MIN_AGE} to ${MAX_AGE} years old on the admission date`;

/** "2026-10-22": today's calendar day in India, whatever the server's own time zone. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Whole years from one calendar day to another (birthday not reached yet = one year less). */
export function ageOn(dateOfBirth: Date, day: Date): number {
  const years = day.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    day.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (day.getUTCMonth() === dateOfBirth.getUTCMonth() && day.getUTCDate() < dateOfBirth.getUTCDate());
  return beforeBirthday ? years - 1 : years;
}

/** null when a student born on `dateOfBirth` may be admitted on `admissionDate`, else the reason. */
export function ageProblem(dateOfBirth: Date, admissionDate: Date): string | null {
  const age = ageOn(dateOfBirth, admissionDate);
  return age < MIN_AGE || age > MAX_AGE ? AGE_MESSAGE : null;
}

const NO_ANGLE_BRACKETS = /^[^<>]*$/;

/**
 * A name typed by a person: trimmed, inner spaces collapsed, 2 to `max` characters, no angle brackets. One message per box,
 * whichever rule it breaks first.
 */
const personName = (what: string, max: number) =>
  z
    .string({ required_error: `Enter the ${what}`, invalid_type_error: `Enter the ${what}` })
    .transform((value, ctx) => {
      const tidy = value.trim().replace(/\s+/g, " ");
      const problem = !tidy
        ? `Enter the ${what}`
        : tidy.length < 2 || tidy.length > max
          ? `The ${what} must be 2 to ${max} characters`
          : !NO_ANGLE_BRACKETS.test(tidy)
            ? `The ${what} cannot contain < or >`
            : null;
      if (!problem) return tidy;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
      return z.NEVER;
    });

/**
 * A box of free text with a limit, as it is (not optional). `short`: a filled box shorter than `min` characters is refused with this
 * message (a street address of two letters is a mistake).
 */
const textBox = (what: string, max: number, short?: { message: string; min: number }) =>
  z.string({ required_error: short?.message ?? `Enter the ${what}`, invalid_type_error: short?.message ?? `Enter the ${what}` }).transform((value, ctx) => {
    const tidy = value.trim().replace(/\s+/g, " ");
    const problem =
      short && tidy.length < short.min
        ? short.message
        : tidy.length > max
          ? `Keep the ${what} under ${max} characters`
          : !NO_ANGLE_BRACKETS.test(tidy)
            ? `The ${what} cannot contain < or >`
            : null;
    if (!problem) return tidy;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    return z.NEVER;
  });

/** Free text with a limit: required (with `empty` as its message when blank or shorter than `min`) or not. */
const text = (what: string, max: number, required?: { empty: string; min: number }) =>
  required ? textBox(what, max, { message: required.empty, min: required.min }) : optional(textBox(what, max));

/** A number made of digits (spaces and dashes typed between them are dropped), matching `pattern`. */
const digits = (pattern: RegExp, message: string) =>
  z.preprocess((v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : v), z.string({ invalid_type_error: message }).regex(pattern, message));

/** Verhoeff's check digit, the one the last digit of every Aadhaar number is (it catches one wrong digit and two swapped ones). */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export const verhoeffValid = (number: string) =>
  [...number].reverse().reduce((c, digit, i) => VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(digit)]], 0) === 0;

export const AADHAAR_MESSAGE = "Enter a valid 12-digit Aadhaar number";
/** 12 digits, not starting with 0 or 1, whose last digit is the Verhoeff check digit (a mistyped number is caught here). */
const aadhaar = digits(/^\d{12}$/, AADHAAR_MESSAGE).refine((v) => /^[2-9]/.test(v) && verhoeffValid(v), AADHAAR_MESSAGE);

/**
 * A calendar day as the form sends it, "2026-04-01", turned into midnight UTC of that day (like the academic year's days). A day
 * that does not exist (2026-02-30) is refused rather than rolled over, and so is a day after today (in India).
 */
const calendarDay = (what: string, inFuture: string) =>
  z
    .string({ required_error: `Choose the ${what}`, invalid_type_error: `Choose the ${what}` })
    .transform((raw, ctx) => {
      const value = raw.trim();
      const fail = (message: string) => {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      };
      if (!value) return fail(`Choose the ${what}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(`Choose a valid ${what}`);
      const day = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value || day.getUTCFullYear() < 1900) {
        return fail(`Choose a valid ${what}`);
      }
      if (value > todayInIndia()) return fail(inFuture);
      return day;
    });

/**
 * Where the student lives. Every part may be left empty here; which parts a school needs is its own setting (`admitSchemaFor`),
 * so a school that does not keep addresses is not made to type one. A part that is filled must be right.
 */
const address = z.object(
  {
    line1: optional(textBox("address", 200, { message: "Enter the street address", min: 3 })),
    line2: text("area or landmark", 200),
    city: optional(textBox("city", 80, { message: "Enter the city", min: 2 })),
    state: optional(z.enum(INDIAN_STATES, { message: "Choose the state" })),
    pincode: optional(z.string({ invalid_type_error: "PIN code is 6 digits" }).trim().regex(/^\d{6}$/, "PIN code is 6 digits")),
  },
  { invalid_type_error: "Enter the address" }
);

/**
 * Where the student studied before. Every box is optional, but once any is filled the school's name is needed (a TC number
 * without the school it came from means nothing). Nothing filled in is "no previous school" (null).
 */
const previousSchool = z
  .object({
    name: text("school name", 150),
    lastClass: text("class", 40),
    tcNumber: text("TC number", 40),
    tcDate: optional(calendarDay("TC date", "The TC date cannot be in the future")),
  })
  .superRefine((school, ctx) => {
    const anything = school.lastClass || school.tcNumber || school.tcDate;
    if ((!school.name && anything) || (school.name && school.name.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Enter the previous school's name" });
    }
  })
  .transform((school) =>
    school.name
      ? { name: school.name, lastClass: school.lastClass ?? null, tcNumber: school.tcNumber ?? null, tcDate: school.tcDate ?? null }
      : null
  );

/** A choice from a short list that may be left empty ("" and null both mean "not given"). */
const optionalChoice = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess((v) => (v === "" ? null : v), z.enum(values, { message }).nullable().optional());

/**
 * The student's records a school may keep (each decided by the school: needed, optional or not asked). The boxes as they are; the
 * admission makes each optional, a change makes each clearable (null).
 */
const recordBoxes = {
  aadhaarNumber: aadhaar,
  samagraId: digits(/^\d{8,9}$/, "Samagra ID is 8 or 9 digits"),
  apaarId: digits(/^\d{12}$/, "APAAR ID is 12 digits"),
  pen: digits(/^\d{11}$/, "PEN is 11 digits"),
  srNumber: textBox("SR / Scholar number", 30),
  religion: z.enum(RELIGIONS, { message: "Choose a religion from the list" }),
  nationality: textBox("nationality", 40),
  emergencyMobile: phoneNumber(MOBILE_MESSAGE, INDIAN_MOBILE),
  disability: z.enum(DISABILITIES, { message: "Choose a disability from the list" }),
  medicalNotes: textBox("medical notes", 300),
  feeConcession: textBox("fee concession", 80),
  transportRoute: textBox("transport route", 60),
  transportStop: textBox("transport stop", 60),
};
type RecordKey = keyof typeof recordBoxes;
const RECORD_KEYS = Object.keys(recordBoxes) as RecordKey[];
const r = recordBoxes;
/** Each record on an admission: may be left empty ("" and null are "not given"). */
const recordsOptional = {
  aadhaarNumber: optional(r.aadhaarNumber),
  samagraId: optional(r.samagraId),
  apaarId: optional(r.apaarId),
  pen: optional(r.pen),
  srNumber: optional(r.srNumber),
  religion: optional(r.religion),
  nationality: optional(r.nationality),
  emergencyMobile: optional(r.emergencyMobile),
  disability: optional(r.disability),
  medicalNotes: optional(r.medicalNotes),
  feeConcession: optional(r.feeConcession),
  transportRoute: optional(r.transportRoute),
  transportStop: optional(r.transportStop),
} satisfies Record<RecordKey, z.ZodTypeAny>;
/** A box of a change: not sent = unchanged, "" or null = cleared. */
const clearable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable().optional());
const recordsClearable = {
  aadhaarNumber: clearable(r.aadhaarNumber),
  samagraId: clearable(r.samagraId),
  apaarId: clearable(r.apaarId),
  pen: clearable(r.pen),
  srNumber: clearable(r.srNumber),
  religion: clearable(r.religion),
  nationality: clearable(r.nationality),
  emergencyMobile: clearable(r.emergencyMobile),
  disability: clearable(r.disability),
  medicalNotes: clearable(r.medicalNotes),
  feeConcession: clearable(r.feeConcession),
  transportRoute: clearable(r.transportRoute),
  transportStop: clearable(r.transportStop),
} satisfies Record<RecordKey, z.ZodTypeAny>;
const yesNo = z.boolean({ invalid_type_error: "Say yes or no" }).optional();
/**
 * The answers to the school's own fields, by their `c_` key (a change: null clears one). Only the shape is checked here; each answer is
 * checked against the school's field (`customIssues`), which only the school's settings know.
 */
const customAnswers = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]), { invalid_type_error: "Answer your school's own fields" })
  .optional();

/** The student's own details: the same rules when admitting and when changing them. */
const profileShape = {
  firstName: personName("first name", 50),
  lastName: personName("last name", 50),
  gender: z.enum(GENDERS, { message: "Choose the gender" }),
  dateOfBirth: calendarDay("date of birth", "The date of birth cannot be in the future"),
  admissionDate: calendarDay("admission date", "The admission date cannot be in the future"),
  address: optional(address),
  bloodGroup: optionalChoice(BLOOD_GROUPS, "Choose a blood group from the list"),
  category: optionalChoice(CATEGORIES, "Choose a category from the list"),
  previousSchool: optional(previousSchool),
  ...recordsOptional,
  rteSeat: yesNo,
  bpl: yesNo,
};

/**
 * One guardian of the student being admitted.
 *  - A new guardian: name, relation, and the mobile number (required for the primary guardian, optional for the others).
 *  - A guardian the school already has (the screen found them by their mobile number, POST /students/guardians/lookup): their
 *    `guardianId`. Their details are left exactly as they are unless `updateDetails` is true, which saves the name, the alternate
 *    number, the email and the occupation sent here. Their mobile number is theirs and is not changed by an admission.
 * `relation` and `isPrimary` are about THIS child (one person can be the primary contact of one child and not of another).
 */
const guardianEntry = z
  .object({
    guardianId: optional(objectId),
    updateDetails: z.boolean().default(false),
    name: personName("guardian's name", 80),
    relation: z.enum(RELATIONS, { message: "Choose the relation" }),
    isPrimary: z.boolean({ invalid_type_error: "Choose the primary guardian" }).default(false),
    mobile: optional(phoneNumber(MOBILE_MESSAGE, INDIAN_MOBILE)),
    alternateMobile: optional(phoneNumber(MOBILE_MESSAGE, INDIAN_MOBILE)),
    email: optional(z.string().trim().toLowerCase().max(254, "Enter a valid email address").email("Enter a valid email address")),
    occupation: text("occupation", 60),
  })
  .superRefine((g, ctx) => {
    if (g.mobile && g.alternateMobile && g.mobile === g.alternateMobile) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["alternateMobile"], message: "The alternate number must differ from the mobile number" });
    }
  });

/** A roll number: a whole number from 1 to 999, or nothing. */
const rollNumber = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .number({ invalid_type_error: `The roll number must be a whole number from 1 to ${MAX_ROLL_NUMBER}` })
    .int(`The roll number must be a whole number from 1 to ${MAX_ROLL_NUMBER}`)
    .min(1, `The roll number must be a whole number from 1 to ${MAX_ROLL_NUMBER}`)
    .max(MAX_ROLL_NUMBER, `The roll number must be a whole number from 1 to ${MAX_ROLL_NUMBER}`)
    .nullable()
    .optional()
);

const classId = z.string({ required_error: "Choose the class", invalid_type_error: "Choose the class" }).regex(OBJECT_ID, "Choose the class");
/** "" or null: no section (only allowed for a class that has none this year; the service checks that). */
const sectionId = z.preprocess((v) => (v === "" ? null : v), objectId.nullable().optional());

/**
 * One admission: the student, their guardians (1 to 4, exactly one primary) and their place in the current academic year. The
 * class and section rules that need the database (the section belongs to that class and year, a seat is free...) are checked by
 * the service; everything that can be checked from the request alone is checked here, so the person gets every message at once.
 */
export const admitStudentSchema = z
  .object({
    ...profileShape,
    // Today when not given (a school usually admits on the day).
    admissionDate: optional(profileShape.admissionDate),
    classId,
    sectionId,
    rollNumber,
    custom: customAnswers,
    guardians: z
      .array(guardianEntry, { required_error: "Add at least one guardian", invalid_type_error: "Add at least one guardian" })
      .min(MIN_GUARDIANS, "Add at least one guardian")
      .max(MAX_GUARDIANS, `A student can have at most ${MAX_GUARDIANS} guardians`),
    /** The person saw that the section is full and wants the student in it anyway. */
    allowOverCapacity: z.boolean().default(false),
    /** The person saw the possible duplicate (same name, birthday and primary mobile) and says it is a different child. */
    confirmNotDuplicate: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    const primaries = input.guardians.filter((g) => g.isPrimary).length;
    if (primaries === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardians"], message: "Choose one primary guardian" });
    if (primaries > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardians"], message: "Only one guardian can be the primary guardian" });

    const mobiles = new Set<string>();
    const picked = new Set<string>();
    input.guardians.forEach((g, i) => {
      if (g.isPrimary && !g.mobile) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardians", i, "mobile"], message: "Enter the mobile number" });
      }
      if (g.mobile) {
        if (mobiles.has(g.mobile)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardians", i, "mobile"], message: "Two guardians cannot have the same mobile number" });
        }
        mobiles.add(g.mobile);
      }
      if (g.guardianId) {
        if (picked.has(g.guardianId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardians", i, "guardianId"], message: "This guardian is already added" });
        }
        picked.add(g.guardianId);
      }
    });

    if (input.dateOfBirth instanceof Date) {
      const admittedOn = input.admissionDate instanceof Date ? input.admissionDate : new Date(`${todayInIndia()}T00:00:00.000Z`);
      const problem = ageProblem(input.dateOfBirth, admittedOn);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateOfBirth"], message: problem });
    }
  });

const hasAChange = (value: object) => Object.values(value).some((v) => v !== undefined);
const NOTHING_TO_CHANGE = { message: "Nothing to change" };

/**
 * A change to the student's own details: only the boxes that are sent are changed. The address is one block (all of it is sent).
 * The admission number is never changed; the class and section are changed through PATCH /students/:id/enrolment.
 */
export const updateStudentSchema = z
  .object({
    firstName: profileShape.firstName.optional(),
    lastName: profileShape.lastName.optional(),
    gender: profileShape.gender.optional(),
    dateOfBirth: profileShape.dateOfBirth.optional(),
    admissionDate: profileShape.admissionDate.optional(),
    address: address.optional(),
    bloodGroup: profileShape.bloodGroup,
    category: profileShape.category,
    // null (or every box empty) clears it.
    previousSchool: previousSchool.nullable().optional(),
    ...recordsClearable,
    rteSeat: yesNo,
    bpl: yesNo,
    custom: customAnswers,
  })
  .refine(hasAChange, NOTHING_TO_CHANGE);

/**
 * Moving the student within the current academic year: another class and/or section, or only the roll number. When the class or
 * section changes and no roll number is sent, the old one is dropped (roll numbers are per section).
 */
export const moveStudentSchema = z
  .object({
    classId: classId.optional(),
    sectionId,
    rollNumber,
    allowOverCapacity: z.boolean().default(false),
  })
  .refine((v) => v.classId !== undefined || v.sectionId !== undefined || v.rollNumber !== undefined, NOTHING_TO_CHANGE);

/** Changing a guardian's own details. A changed mobile number is not verified any more (it will be the login). */
export const updateGuardianSchema = z
  .object({
    name: personName("guardian's name", 80).optional(),
    mobile: phoneNumber(MOBILE_MESSAGE, INDIAN_MOBILE).optional(),
    alternateMobile: z.preprocess((v) => (v === "" ? null : v), phoneNumber(MOBILE_MESSAGE, INDIAN_MOBILE).nullable().optional()),
    email: z.preprocess(
      (v) => (v === "" ? null : v),
      z.string().trim().toLowerCase().max(254, "Enter a valid email address").email("Enter a valid email address").nullable().optional()
    ),
    occupation: z.preprocess((v) => (v === "" ? null : v), text("occupation", 60).nullable()),
  })
  .refine(hasAChange, NOTHING_TO_CHANGE);

/** "Is this parent already in the school?" The mobile number travels in the body, never in an address (it would end up in logs). */
export const lookupGuardianSchema = z.object({
  // A missing number is "not a mobile number" too: one message.
  mobile: z.preprocess((v) => v ?? "", phoneNumber(MOBILE_MESSAGE, INDIAN_MOBILE)),
});

export const STUDENT_SORTS = ["class", "name", "admissionNumber", "admissionDate"] as const;

/** The student list: search, filters, sort and page, all done by the database. */
export const listStudentsQuerySchema = z.object({
  /** Part of the name or of the admission number. */
  q: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || undefined),
  classId: objectId.optional(),
  /** A section's id, or `none` for the students of a class that has no sections. */
  sectionId: z.union([objectId, z.literal("none")]).optional(),
  sort: z.enum(STUDENT_SORTS).default("class"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

/** The admission number a school brings with a student it already has: letters, digits and / - . _ (kept upper-case), up to 30. */
export const ADMISSION_NUMBER_MESSAGE = "Use letters, digits and / - . _ in the admission number (up to 30)";
export const importAdmissionNumberSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, " ") : v),
  z.string({ invalid_type_error: ADMISSION_NUMBER_MESSAGE }).regex(/^[A-Z0-9][A-Z0-9 /._-]{0,29}$/, ADMISSION_NUMBER_MESSAGE)
);

/**
 * A bulk import, in parts: each row is one admission (the same body as POST /students, checked by the same schema, row by row, so a
 * mistake in one row is reported on that row and never refuses the others), with the row's number in the file and, optionally, the
 * admission number the school already gave the student. `dryRun` checks everything and saves nothing.
 */
export const importStudentsSchema = z.object({
  dryRun: z.boolean({ required_error: "Say whether this is a check or the import", invalid_type_error: "Say whether this is a check or the import" }),
  allowOverCapacity: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        row: z.number({ invalid_type_error: "A row number" }).int().min(1).max(1_000_000),
        admissionNumber: z.unknown().optional(),
        student: z.record(z.unknown(), { required_error: "The student's details", invalid_type_error: "The student's details" }),
      }),
      { required_error: "Add at least one row", invalid_type_error: "Add at least one row" }
    )
    .min(1, "Add at least one row")
    .max(MAX_IMPORT_ROWS_PER_REQUEST, `Send up to ${MAX_IMPORT_ROWS_PER_REQUEST} rows at a time`),
});

/** Which students an export holds: the list's search, class and section (every student of this year when none is given). */
export const exportStudentsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || undefined),
  classId: objectId.optional(),
  sectionId: z.union([objectId, z.literal("none")]).optional(),
});

// ---------------------------------------------------------------------------------------------------------------------------
// What a school needs (its own settings, set on Manage school > Students > Export).
// ---------------------------------------------------------------------------------------------------------------------------

type Issue = { path: (string | number)[]; message: string };
const RULE_MESSAGE = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, f.message])) as Record<FormFieldKey, string>;
/** Each part of the address and of the previous school, and the setting that says whether the school needs it. */
const ADDRESS_PARTS = { line1: "addressLine1", line2: "addressArea", city: "addressCity", state: "addressState", pincode: "addressPincode" } as const satisfies Record<string, FormFieldKey>;
const SCHOOL_PARTS = {
  name: "previousSchoolName",
  lastClass: "previousSchoolLastClass",
  tcNumber: "previousSchoolTcNumber",
  tcDate: "previousSchoolTcDate",
} as const satisfies Record<string, FormFieldKey>;
/** The setting behind a box's path ("address.city" -> addressCity), for the import's warnings. */
export const RULE_OF_PATH: Record<string, FormFieldKey> = {
  ...Object.fromEntries(Object.entries(ADDRESS_PARTS).map(([part, key]) => [`address.${part}`, key])),
  ...Object.fromEntries(Object.entries(SCHOOL_PARTS).map(([part, key]) => [`previousSchool.${part}`, key])),
};
/** The details that are one box of the student (the address and previous-school parts, and the parents, are checked on their own). */
const SINGLE_KEYS = ["admissionDate", "category", "bloodGroup", ...RECORD_KEYS] as const;
/** Not given: nothing, null or an empty box. (A box that was given but is wrong has its own message already.) */
const missing = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * What an admission lacks of what the school needs, box by box, in the words of the form. The bulk import says these as warnings (a
 * school's old sheets seldom hold everything); the admission form and POST /students refuse them (`admitSchemaFor`).
 */
export function missingForSchool(input: AdmitStudentInput, rules: FieldRules): Issue[] {
  const issues: Issue[] = [];
  const needs = (key: FormFieldKey) => rules[key] === "required";
  const box = input as unknown as Record<string, unknown>;
  for (const key of SINGLE_KEYS) if (needs(key) && missing(box[key])) issues.push({ path: [key], message: RULE_MESSAGE[key] });
  const home = (input.address ?? {}) as Record<string, unknown>;
  for (const [part, key] of Object.entries(ADDRESS_PARTS)) {
    if (needs(key) && missing(home[part])) issues.push({ path: ["address", part], message: RULE_MESSAGE[key] });
  }
  const before = (input.previousSchool ?? {}) as Record<string, unknown>;
  for (const [part, key] of Object.entries(SCHOOL_PARTS)) {
    if (needs(key) && missing(before[part])) issues.push({ path: ["previousSchool", part], message: RULE_MESSAGE[key] });
  }
  // Read from a refused body too (withSchoolNeeds), so nothing here may assume a shape: a guardian may be anything.
  const guardians = Array.isArray(input.guardians) ? input.guardians : [];
  if (needs("guardianOccupation")) {
    // Only for a parent whose details are typed here: a parent the school has, linked as saved, is not asked again.
    guardians.forEach((g, i) => {
      if (!g || typeof g !== "object") return;
      if ((!g.guardianId || g.updateDetails) && missing(g.occupation)) issues.push({ path: ["guardians", i, "occupation"], message: RULE_MESSAGE.guardianOccupation });
    });
  }
  if (needs("secondParent") && guardians.length > 0) {
    const relations = new Set(guardians.map((g) => (g && typeof g === "object" ? g.relation : undefined)));
    if (!relations.has("Father") || !relations.has("Mother")) issues.push({ path: ["guardians"], message: RULE_MESSAGE.secondParent });
  }
  return issues;
}

/** What a change would empty of what the school needs (a box that is not sent is not changed, so it is not asked for). */
function clearedForSchool(input: UpdateStudentInput, rules: FieldRules): Issue[] {
  const issues: Issue[] = [];
  const needs = (key: FormFieldKey) => rules[key] === "required";
  const box = input as unknown as Record<string, unknown>;
  for (const key of SINGLE_KEYS) if (needs(key) && key in box && box[key] === null) issues.push({ path: [key], message: RULE_MESSAGE[key] });
  if (input.address !== undefined) {
    const home = (input.address ?? {}) as Record<string, unknown>;
    for (const [part, key] of Object.entries(ADDRESS_PARTS)) {
      if (needs(key) && missing(home[part])) issues.push({ path: ["address", part], message: RULE_MESSAGE[key] });
    }
  }
  if (input.previousSchool !== undefined) {
    const before = (input.previousSchool ?? {}) as Record<string, unknown>;
    for (const [part, key] of Object.entries(SCHOOL_PARTS)) {
      if (needs(key) && missing(before[part])) issues.push({ path: ["previousSchool", part], message: RULE_MESSAGE[key] });
    }
  }
  return issues;
}

const addIssues = (ctx: z.RefinementCtx, issues: Issue[]) => issues.forEach((i) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: i.path, message: i.message }));

/** A day as the school's own date fields keep it: "2026-04-01", a real one, 1900 to 2100. */
function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value && day.getUTCFullYear() >= 1900 && day.getUTCFullYear() <= 2100;
}

/** What a needed field of the school's own says when it is missing (the form says the same). */
export const customNeedMessage = (field: CustomFieldDef) => `${field.type === "choice" || field.type === "date" ? "Choose" : "Enter"} the ${field.label}`;

/** What is wrong with one answer to a field of the school's own (given, not empty), or nothing. */
function customProblem(field: CustomFieldDef, value: unknown): string | undefined {
  switch (field.type) {
    case "text": {
      if (typeof value !== "string") return customNeedMessage(field);
      const text = value.trim().replace(/\s+/g, " ");
      if (text.length > MAX_CUSTOM_TEXT) return `Keep the ${field.label} under ${MAX_CUSTOM_TEXT} characters`;
      if (!NO_ANGLE_BRACKETS.test(text)) return `The ${field.label} cannot contain < or >`;
      return undefined;
    }
    case "number":
      // A number, as a number (the form sends one): what is kept is what is exported.
      return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12 ? undefined : `Enter a number for ${field.label}`;
    case "date":
      return typeof value === "string" && isCalendarDay(value.trim()) ? undefined : `Choose a valid date for ${field.label}`;
    case "yesNo":
      return typeof value === "boolean" ? undefined : "Say yes or no";
    case "choice":
      return typeof value === "string" && field.options.includes(value.trim()) ? undefined : `Choose the ${field.label} from the list`;
  }
}

/**
 * What is wrong with the answers to the school's own fields (`custom`, by key), in the form's words. An admission (`admit`) must answer
 * every needed one; a change (`change`) cannot clear a needed one (null), like the details of the list; a bulk upload row (`format`)
 * is only checked for what it gives (what it lacks is a warning). A yes / no is never needed.
 */
export function customIssues(answers: unknown, fields: CustomFieldDef[], kind: "admit" | "change" | "format"): Issue[] {
  const issues: Issue[] = [];
  const given = answers && typeof answers === "object" && !Array.isArray(answers) ? (answers as Record<string, unknown>) : {};
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const needed = (f: CustomFieldDef) => f.mode === "required" && f.type !== "yesNo";
  for (const [key, value] of Object.entries(given)) {
    const field = byKey.get(key);
    if (!field) {
      issues.push({ path: ["custom", key], message: "This is not one of your school's fields" });
      continue;
    }
    if (missing(value)) {
      if (kind === "change" && needed(field)) issues.push({ path: ["custom", key], message: customNeedMessage(field) });
      continue;
    }
    const problem = customProblem(field, value);
    if (problem) issues.push({ path: ["custom", key], message: problem });
  }
  if (kind === "admit") {
    for (const field of fields) if (needed(field) && missing(given[field.key])) issues.push({ path: ["custom", field.key], message: customNeedMessage(field) });
  }
  return issues;
}

/** One schema per way of keeping records (there are few), made once; a school that keeps changing its fields never grows it without end. */
function perNeeds<T extends z.ZodTypeAny>(make: (needs: SchoolNeeds) => T) {
  const made = new Map<string, T>();
  return (needs: SchoolNeeds): T => {
    const key = JSON.stringify(needs);
    let schema = made.get(key);
    if (!schema) {
      if (made.size >= 500) made.clear();
      schema = make(needs);
      made.set(key, schema);
    }
    return schema;
  };
}

/**
 * `base` and what the school needs, said together: a body with a wrong box (a missing gender) still hears what the school needs, in
 * one answer, as the form says it all at once (a refinement of `base` would not run once a box is refused). The school's needs are
 * read from the parsed body, or from the raw one when it was refused; a box that already has a message keeps only that one.
 */
function withSchoolNeeds<T extends z.ZodTypeAny>(base: T, lacks: (input: z.infer<T>) => Issue[]) {
  return z.unknown().transform((raw, ctx): z.infer<T> => {
    const parsed = base.safeParse(raw);
    const refused = parsed.success ? [] : parsed.error.issues;
    for (const issue of refused) ctx.addIssue(issue);
    const said = new Set(refused.map((i) => i.path.join(".")));
    const body = parsed.success ? parsed.data : ((raw && typeof raw === "object" ? raw : {}) as z.infer<T>);
    const school = lacks(body).filter((i) => !said.has(i.path.join(".")));
    addIssues(ctx, school);
    return parsed.success && school.length === 0 ? parsed.data : z.NEVER;
  });
}

/** An admission held to the school's needs: every needed detail (and needed field of its own) is asked for, with the form's words. */
export const admitSchemaFor = perNeeds((needs) =>
  withSchoolNeeds(admitStudentSchema, (input) => [...missingForSchool(input, needs.rules), ...customIssues(input.custom, needs.custom, "admit")])
);
/** A change held to the school's needs: a needed detail cannot be emptied. */
export const updateSchemaFor = perNeeds((needs) =>
  withSchoolNeeds(updateStudentSchema, (input) => [...clearedForSchool(input, needs.rules), ...customIssues(input.custom, needs.custom, "change")])
);
/** A guardian's change: when the school needs the occupation, it cannot be emptied. */
export const updateGuardianSchemaFor = perNeeds((needs) =>
  withSchoolNeeds(updateGuardianSchema, (input) =>
    needs.rules.guardianOccupation === "required" && input.occupation === null ? [{ path: ["occupation"], message: RULE_MESSAGE.guardianOccupation }] : []
  )
);

const EXPORT_KEYS = EXPORT_COLUMNS.map((c) => c.key) as [ExportColumnKey, ...ExportColumnKey[]];
const FORM_KEYS = new Set<string>(STUDENT_FORM_FIELDS.map((f) => f.key));
/** The names of the fields on the list (their headings and labels): a field of the school's own cannot take one of them. */
const LIST_NAMES = new Map<string, string>([
  ...EXPORT_COLUMNS.map((c) => [c.heading.toLowerCase(), c.heading] as [string, string]),
  ...STUDENT_FORM_FIELDS.map((f) => [f.label.toLowerCase(), f.label] as [string, string]),
]);
const tidyText = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * The school's own fields, the whole list as it should be (a field left out is deleted). Each entry is checked on its own, so one wrong
 * entry never hides another's message: a name (2 to 40 characters, not one of the list's, once), a kind, the choices of a list (1 to
 * 30, each once), and needed / optional / not asked (a yes / no is never needed). The service refuses a changed kind.
 */
const customFieldsSchema = z
  .array(z.object({ key: z.unknown(), label: z.unknown(), type: z.unknown(), options: z.unknown().optional(), mode: z.unknown() }), {
    invalid_type_error: "Choose your school's own fields",
  })
  .max(MAX_CUSTOM_FIELDS, `Up to ${MAX_CUSTOM_FIELDS} fields of your own`)
  .superRefine((fields, ctx) => {
    const say = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const keys = new Set<string>();
    const labels = new Set<string>();
    fields.forEach((f, i) => {
      if (typeof f.key !== "string" || !CUSTOM_KEY.test(f.key) || keys.has(f.key)) say([i, "key"], "This field cannot be saved: add it again");
      else keys.add(f.key);
      const label = tidyText(f.label);
      if (label.length < 2 || label.length > MAX_CUSTOM_LABEL) say([i, "label"], `The name is 2 to ${MAX_CUSTOM_LABEL} characters`);
      else if (!NO_ANGLE_BRACKETS.test(label)) say([i, "label"], "The name cannot contain < or >");
      else if (LIST_NAMES.has(label.toLowerCase())) say([i, "label"], `There is already a field called ${LIST_NAMES.get(label.toLowerCase())}: switch it on in the list`);
      else if (labels.has(label.toLowerCase())) say([i, "label"], "Two fields cannot have the same name");
      labels.add(label.toLowerCase());
      if (!(CUSTOM_FIELD_TYPES as readonly unknown[]).includes(f.type)) say([i, "type"], "Choose what kind of answer it takes");
      if (f.type === "choice") {
        const options = Array.isArray(f.options) ? f.options.map(tidyText) : [];
        const seen = new Set(options.map((o) => o.toLowerCase()));
        if (options.length === 0 || options.some((o) => !o)) say([i, "options"], "Add the choices, one per line");
        else if (options.length > MAX_CUSTOM_OPTIONS) say([i, "options"], `Up to ${MAX_CUSTOM_OPTIONS} choices`);
        else if (options.some((o) => o.length > MAX_CUSTOM_OPTION || !NO_ANGLE_BRACKETS.test(o))) say([i, "options"], `A choice is up to ${MAX_CUSTOM_OPTION} characters, without < or >`);
        else if (seen.size !== options.length) say([i, "options"], "Two choices cannot be the same");
      }
      if (!(FIELD_MODES as readonly unknown[]).includes(f.mode)) say([i, "mode"], "Choose needed, optional or not asked");
      else if (f.type === "yesNo" && f.mode === "required") say([i, "mode"], "A yes / no detail is a tick: it cannot be needed");
    });
  })
  .transform((fields): CustomFieldDef[] =>
    fields.map((f) => ({
      key: f.key as string,
      label: tidyText(f.label),
      type: f.type as CustomFieldType,
      options: f.type === "choice" && Array.isArray(f.options) ? f.options.map(tidyText) : [],
      mode: f.mode as FieldMode,
    }))
  );
const YES_NO_KEYS = new Set<string>(STUDENT_FORM_FIELDS.filter((f) => "yesNo" in f && f.yesNo).map((f) => f.key));
const LOCKED_HEADINGS = LOCKED_EXPORT_COLUMNS.map((k) => EXPORT_COLUMNS.find((c) => c.key === k)!.heading).join(" and ");

/**
 * The school's way of keeping records: what the admission form needs (`fields`: a detail and needed / optional / not asked; the
 * details not sent stay as they are), the school's own fields (`customFields`, the whole list), and the export's columns
 * (`exportColumns`, in order, each with its heading; null = back to the default). Student Name and Class are in every export; two
 * columns cannot share a heading (a sheet read back would not know which).
 */
export const updateStudentSettingsSchema = z
  .object({
    // Every entry is checked on its own, so one wrong entry never hides another's message.
    fields: z
      .record(z.string(), z.unknown(), { invalid_type_error: "Choose the details" })
      .superRefine((fields, ctx) => {
        for (const [key, mode] of Object.entries(fields)) {
          const say = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
          if (!FORM_KEYS.has(key)) say("This detail cannot be changed");
          else if (!(FIELD_MODES as readonly unknown[]).includes(mode)) say("Choose needed, optional or not asked");
          else if (YES_NO_KEYS.has(key) && mode === "required") say("A yes / no detail is a tick: it cannot be needed");
        }
      })
      .transform((fields) => fields as Partial<FieldRules>)
      .optional(),
    // Every column is checked on its own (a wrong one never hides the others' messages); the headings come out tidied.
    exportColumns: z
      .array(z.object({ key: z.unknown(), heading: z.unknown() }), { invalid_type_error: "Choose the columns" })
      .min(1, "Choose at least one column")
      .max(EXPORT_COLUMNS.length + MAX_CUSTOM_FIELDS, "A column is in the export once")
      .superRefine((columns, ctx) => {
        const say = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const keys = new Set<string>();
        const headings = new Set<string>();
        columns.forEach((c, i) => {
          // A field of the school's own is checked by the service against the fields it has.
          if (!(EXPORT_KEYS as readonly unknown[]).includes(c.key) && !(typeof c.key === "string" && CUSTOM_KEY.test(c.key))) say([i, "key"], "Choose a column from the list");
          else if (keys.has(c.key as string)) say([i, "key"], "This column is already in the export");
          else keys.add(c.key as string);
          const heading = typeof c.heading === "string" ? c.heading.trim().replace(/\s+/g, " ") : "";
          if (!heading) say([i, "heading"], "Enter the heading");
          else if (heading.length > MAX_EXPORT_HEADING) say([i, "heading"], `Keep the heading under ${MAX_EXPORT_HEADING} characters`);
          else if (!NO_ANGLE_BRACKETS.test(heading)) say([i, "heading"], "The heading cannot contain < or >");
          else if (headings.has(heading.toLowerCase())) say([i, "heading"], "Two columns cannot have the same heading");
          headings.add(heading.toLowerCase());
        });
        if (LOCKED_EXPORT_COLUMNS.some((k) => !keys.has(k))) say([], `${LOCKED_HEADINGS} are in every export`);
      })
      .transform((columns) => columns.map((c) => ({ key: c.key as string, heading: (c.heading as string).trim().replace(/\s+/g, " ") })))
      .nullable()
      .optional(),
    customFields: customFieldsSchema.optional(),
  })
  .refine(hasAChange, NOTHING_TO_CHANGE);

export type UpdateStudentSettingsInput = z.infer<typeof updateStudentSettingsSchema>;
export type AdmitStudentInput = z.infer<typeof admitStudentSchema>;
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
export type ExportStudentsQuery = z.infer<typeof exportStudentsQuerySchema>;
export type GuardianEntryInput = AdmitStudentInput["guardians"][number];
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type MoveStudentInput = z.infer<typeof moveStudentSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
export type LookupGuardianInput = z.infer<typeof lookupGuardianSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
