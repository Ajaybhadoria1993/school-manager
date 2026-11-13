import { z } from "zod";
import { INDIAN_MOBILE, nationalNumber } from "../../../utils/formFields";
import { passwordSchema, usernameSchema } from "../../auth/schemas/auth.schemas";
import { idParamSchema, label, objectId } from "../../subjects/schemas/subjects.schemas";
import { CUSTOM_KEY, FIELD_MODES, MAX_CUSTOM_FIELDS, MAX_EXPORT_HEADING } from "../../students/constants";
import { ageOn, customFieldListSchema, todayInIndia } from "../../students/schemas/students.schemas";
import { INDIAN_STATES } from "../../tenants/constants";
import {
  LOCKED_TEACHER_COLUMNS,
  TEACHER_COLUMN_KEYS,
  TEACHER_DETAIL_KEYS,
  TEACHER_EXPORT_COLUMNS,
  type TeacherFieldRules,
  EMPLOYMENT_TYPES,
  MAX_DAYS_BEFORE_JOINING,
  MAX_DESIGNATION,
  MAX_EMPLOYEE_CODE,
  MAX_EXPERIENCE_YEARS,
  MAX_PERIODS_PER_DAY,
  MAX_PERIODS_PER_WEEK,
  MAX_QUALIFICATION,
  MAX_ROLE_OTHER,
  MAX_TEACHER_IMPORT_ROWS_PER_REQUEST,
  STAFF_MEMBER_ROLE_KEYS,
  MAX_TEACHER_AGE,
  MAX_TEACHER_NAME,
  MAX_TEACHER_SUBJECTS,
  MIN_TEACHER_AGE,
  MOBILE_MESSAGE,
  TEACHER_FIELD_NAMES,
  TEACHER_GENDERS,
} from "../constants";

export { idParamSchema };

/** Which medium of the school to add a teacher to. */
export const addTeacherMediumSchema = z.object({ mediumId: objectId });

/** An empty box means "not given". */
const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

const mobile = z.preprocess((value) => (value === undefined ? undefined : blankToNull(nationalNumber(blankToNull(value)))), z.string().regex(INDIAN_MOBILE, MOBILE_MESSAGE).nullable());

const email = z.preprocess(blankToNull, z.string().trim().toLowerCase().max(254, "Keep the email under 254 characters").email("Enter a valid email address").nullable());

export const CODE_MESSAGE = `The employee code is letters, digits and - only, up to ${MAX_EMPLOYEE_CODE}`;
const employeeCode = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => new RegExp(`^[A-Z0-9-]{1,${MAX_EMPLOYEE_CODE}}$`).test(value), CODE_MESSAGE)
    .nullable()
);

const limit = (max: number, message: string) =>
  z.number({ invalid_type_error: message }).int(message).min(1, message).max(max, message).nullable();

export const DAY_MESSAGE = "Days are 1 (Monday) to 7 (Sunday)";
const offDays = z
  .array(z.number({ invalid_type_error: DAY_MESSAGE }).int(DAY_MESSAGE).min(1, DAY_MESSAGE).max(7, DAY_MESSAGE))
  .refine((days) => new Set(days).size === days.length, "Choose each day once")
  .refine((days) => new Set(days).size < 7, "A teacher cannot be off on every day")
  .transform((days) => [...days].sort((a, b) => a - b));

const subjectIds = z
  .array(objectId)
  .max(MAX_TEACHER_SUBJECTS, `Up to ${MAX_TEACHER_SUBJECTS} subjects`)
  .transform((ids) => [...new Set(ids)]);

// ---- Who they are and their job (all optional; a filled box must be right) ----------------------------------------------------------

/** A text box that may be left empty (null); a filled one is trimmed, kept to its length and free of angle brackets. */
const textOrNull = (what: string, max: number) =>
  z.preprocess(
    blankToNull,
    z
      .string({ invalid_type_error: `Enter the ${what}` })
      .trim()
      .max(max, `Keep the ${what} under ${max} characters`)
      .regex(/^[^<>]*$/, `The ${what} cannot contain < or >`)
      .transform((value) => value.replace(/\s+/g, " "))
      .nullable()
  );

const gender = z.preprocess(blankToNull, z.enum(TEACHER_GENDERS, { errorMap: () => ({ message: "Choose the gender" }) }).nullable());
const employmentType = z.preprocess(blankToNull, z.enum(EMPLOYMENT_TYPES, { errorMap: () => ({ message: "Choose full time, part time or contract" }) }).nullable());

const experienceYears = z.preprocess(
  (value) => (value === "" ? null : value),
  z.number({ invalid_type_error: "Enter the years of experience as a number" }).int("Enter whole years").min(0, "Experience cannot be below 0").max(MAX_EXPERIENCE_YEARS, `Experience is at most ${MAX_EXPERIENCE_YEARS} years`).nullable()
);

/** A calendar day typed as 2019-06-17: a real day, kept as midnight UTC. An empty box is null. */
const day = (what: string) =>
  z.preprocess(
    blankToNull,
    z
      .string({ invalid_type_error: `Choose a valid ${what}` })
      .trim()
      .transform((raw, ctx) => {
        const date = new Date(`${raw}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw || date.getUTCFullYear() < 1900) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Choose a valid ${what}` });
          return z.NEVER;
        }
        return date;
      })
      .nullable()
  );

const AGE_MESSAGE = `A teacher must be ${MIN_TEACHER_AGE} to ${MAX_TEACHER_AGE} years old`;
// A day that failed to read was already reported by `day`: only a real day is measured here.
const dateOfBirth = day("date of birth").refine((value) => {
  if (!(value instanceof Date)) return true;
  const age = ageOn(value, new Date(`${todayInIndia()}T00:00:00.000Z`));
  return age >= MIN_TEACHER_AGE && age <= MAX_TEACHER_AGE;
}, AGE_MESSAGE);

const joiningDate = day("joining date").refine((value) => {
  if (!(value instanceof Date)) return true;
  const furthest = new Date(`${todayInIndia()}T00:00:00.000Z`).getTime() + MAX_DAYS_BEFORE_JOINING * 86400000;
  return value.getTime() <= furthest;
}, "The joining date cannot be more than a year ahead");

/** Where they live. Every part may be left empty; a filled one must be right. */
const address = z.object({
  line1: textOrNull("address", 200),
  city: textOrNull("city", 80),
  state: z.preprocess(blankToNull, z.enum(INDIAN_STATES, { errorMap: () => ({ message: "Choose the state" }) }).nullable()),
  pincode: z.preprocess(blankToNull, z.string({ invalid_type_error: "PIN code is 6 digits" }).trim().regex(/^\d{6}$/, "PIN code is 6 digits").nullable()),
}).partial();

/**
 * The answers to the school's own fields, by their `c_` key (a change: null clears one). Only the shape is checked here; each answer is
 * checked against the school's field (`TeacherSettingsService.check`), which only the school's settings know.
 */
const customAnswers = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]), { invalid_type_error: "Answer your school's own fields" });

const fields = {
  name: label("teacher's name", MAX_TEACHER_NAME),
  mobile,
  email,
  employeeCode,
  subjectIds,
  maxPeriodsPerDay: limit(MAX_PERIODS_PER_DAY, `A teacher can take 1 to ${MAX_PERIODS_PER_DAY} periods a day`),
  maxPeriodsPerWeek: limit(MAX_PERIODS_PER_WEEK, `A teacher can take 1 to ${MAX_PERIODS_PER_WEEK} periods a week`),
  offDays,
  gender,
  dateOfBirth,
  address,
  designation: textOrNull("designation", MAX_DESIGNATION),
  qualification: textOrNull("qualification", MAX_QUALIFICATION),
  experienceYears,
  joiningDate,
  employmentType,
  custom: customAnswers,
};

// ---- The login ------------------------------------------------------------------------------------------------------------------------

/** What a teacher signs in with. The password is the school's first one for them; it follows the platform's password rules. */
export const loginAccountSchema = z.object({ username: usernameSchema, password: passwordSchema });

/** `GET /staff/usernames/check?username=`: only a username that could be one is looked up. */
export const usernameCheckQuerySchema = z.object({ username: usernameSchema });
export type UsernameCheckQuery = z.infer<typeof usernameCheckQuerySchema>;
export type LoginAccountInput = z.infer<typeof loginAccountSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const NEEDS_MOBILE_MESSAGE = "Enter the teacher's mobile number: their login needs it";

export const createTeacherSchema = z
  .object({
    name: fields.name,
    mobile: fields.mobile.optional(),
    email: fields.email.optional(),
    employeeCode: fields.employeeCode.optional(),
    subjectIds: fields.subjectIds.default([]),
    maxPeriodsPerDay: fields.maxPeriodsPerDay.optional(),
    maxPeriodsPerWeek: fields.maxPeriodsPerWeek.optional(),
    offDays: fields.offDays.default([]),
    gender: fields.gender.optional(),
    dateOfBirth: fields.dateOfBirth.optional(),
    address: fields.address.optional(),
    designation: fields.designation.optional(),
    qualification: fields.qualification.optional(),
    experienceYears: fields.experienceYears.optional(),
    joiningDate: fields.joiningDate.optional(),
    employmentType: fields.employmentType.optional(),
    custom: fields.custom.optional(),
    /** Gives the teacher a login in the same step. */
    login: loginAccountSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.login && !value.mobile) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mobile"], message: NEEDS_MOBILE_MESSAGE });
  });
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const updateTeacherSchema = z
  .object({ ...fields, isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to change" });
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/**
 * What the teacher list can be asked; every filter is applied by the server. `login`: with = a login that works, closed = one that is
 * switched off (the teacher left), without = none. `classId`: teaches a subject of the class or is the class teacher of one of its units
 * (this year and the next). `classTeacher`: is (or is not) the class teacher of some unit.
 */
export const listTeachersQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
  search: optionalText(40),
  subjectId: objectId.optional(),
  designation: optionalText(MAX_DESIGNATION),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  gender: z.enum(TEACHER_GENDERS).optional(),
  login: z.enum(["with", "without", "closed"]).optional(),
  classId: objectId.optional(),
  classTeacher: z.enum(["yes", "no"]).optional(),
});
export type ListTeachersQuery = z.infer<typeof listTeachersQuerySchema>;

/**
 * `PUT /staff/class-teachers`: the class teacher of a section (or of a class without sections); null takes it away. `releaseOthers` (2026-11-13, a
 * class's page "make them the class teacher here": the teacher moves) also takes this teacher off every other class they are the class teacher of in
 * the same year; without it a teacher keeps all their classes (a small school).
 */
export const setClassTeacherSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable(),
  teacherId: objectId.nullable(),
  releaseOthers: z.boolean().optional(),
});
export type SetClassTeacherInput = z.infer<typeof setClassTeacherSchema>;

/** `PATCH /staff/teachers/:id/login`: another username for a teacher's login (the password stays). */
export const changeUsernameSchema = z.object({ username: usernameSchema });
export type ChangeUsernameInput = z.infer<typeof changeUsernameSchema>;

// ---- Bringing many teachers in from a file -----------------------------------------------------------------------------------------------

/**
 * `POST /staff/teachers/import`: a part of a file (up to MAX_TEACHER_IMPORT_ROWS_PER_REQUEST rows). Each row is a teacher as Add teacher
 * takes one (its boxes, kept loose here: a wrong box refuses that row, never the whole part), the subjects by their names, and the
 * username and password when the file gives them (left out, they are made up). The boxes are judged row by row by the same schema as
 * Add teacher (TeacherImportService), so a refusal says the same words.
 */
export const importTeachersSchema = z.object({
  rows: z
    .array(
      z.object({
        /** The row's number in the file, to say which row is meant in the answer. */
        row: z.number().int().min(1),
        teacher: z.record(z.string(), z.unknown()),
        subjectNames: z.array(z.string().max(300)).max(200).default([]),
        username: z.string().max(100).optional(),
        password: z.string().max(200).optional(),
      })
    )
    .min(1, "Send at least one teacher")
    .max(MAX_TEACHER_IMPORT_ROWS_PER_REQUEST, `Send up to ${MAX_TEACHER_IMPORT_ROWS_PER_REQUEST} teachers at a time`),
});
export type ImportTeachersInput = z.infer<typeof importTeachersSchema>;

/** "Name and Mobile": the columns that are in every export, as a sentence. */
const LOCKED_TEACHER_HEADINGS = (() => {
  const names = LOCKED_TEACHER_COLUMNS.map((k) => TEACHER_EXPORT_COLUMNS.find((c) => c.key === k)!.heading);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
})();

/**
 * `PUT /staff/teachers/settings`: how the school keeps its teachers' details, as the students' settings do. Any of three, each judged
 * on its own (one wrong entry never hides another's message): `fields` (a usual detail and needed / optional / not asked; the details not
 * sent stay as they are), `customFields` (the school's own fields, the whole list as it should be: a field left out is deleted; a name may
 * not be one of the usual details') and `exportColumns` (the Excel's columns, in order, each with its heading; null = the usual layout;
 * the Name and the Mobile are in every export and two columns cannot share a heading: a sheet read back would not know which).
 */
export const updateTeacherSettingsSchema = z
  .object({
    fields: z
      .record(z.string(), z.unknown(), { invalid_type_error: "Choose the details" })
      .superRefine((fields, ctx) => {
        for (const [key, mode] of Object.entries(fields)) {
          const say = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
          if (!TEACHER_DETAIL_KEYS.includes(key)) say("This detail cannot be changed");
          else if (!(FIELD_MODES as readonly unknown[]).includes(mode)) say("Choose needed, optional or not asked");
        }
      })
      .transform((fields) => fields as Partial<TeacherFieldRules>)
      .optional(),
    customFields: customFieldListSchema(new Map(TEACHER_FIELD_NAMES.map((n) => [n.toLowerCase(), n] as [string, string])), (listed) => `There is already a field called ${listed}`).optional(),
    exportColumns: z
      .array(z.object({ key: z.unknown(), heading: z.unknown() }), { invalid_type_error: "Choose the columns" })
      .min(1, "Choose at least one column")
      .max(TEACHER_EXPORT_COLUMNS.length + MAX_CUSTOM_FIELDS, "A column is in the export once")
      .superRefine((columns, ctx) => {
        const say = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const keys = new Set<string>();
        const headings = new Set<string>();
        columns.forEach((c, i) => {
          // A field of the school's own is checked by the service against the fields it has.
          if (typeof c.key !== "string" || !(TEACHER_COLUMN_KEYS.has(c.key) || CUSTOM_KEY.test(c.key))) say([i, "key"], "Choose a column from the list");
          else if (keys.has(c.key)) say([i, "key"], "This column is already in the export");
          else keys.add(c.key);
          const heading = typeof c.heading === "string" ? c.heading.trim().replace(/\s+/g, " ") : "";
          if (!heading) say([i, "heading"], "Enter the heading");
          else if (heading.length > MAX_EXPORT_HEADING) say([i, "heading"], `Keep the heading under ${MAX_EXPORT_HEADING} characters`);
          else if (/[<>]/.test(heading)) say([i, "heading"], "The heading cannot contain < or >");
          else if (headings.has(heading.toLowerCase())) say([i, "heading"], "Two columns cannot have the same heading");
          headings.add(heading.toLowerCase());
        });
        if (LOCKED_TEACHER_COLUMNS.some((k) => !keys.has(k))) say([], `${LOCKED_TEACHER_HEADINGS} are in every export`);
      })
      .transform((columns) => columns.map((c) => ({ key: c.key as string, heading: (c.heading as string).trim().replace(/\s+/g, " ") })))
      .nullable()
      .optional(),
  })
  .refine((value) => value.fields !== undefined || value.customFields !== undefined || value.exportColumns !== undefined, { message: "Nothing to change" });
export type UpdateTeacherSettingsInput = z.infer<typeof updateTeacherSettingsSchema>;

/** `GET /staff/teachers/export/preview`: the list's own filters, as the export takes them. */
export const exportPreviewQuerySchema = listTeachersQuerySchema;

// ---- Staff: the people who work for the school without teaching ---------------------------------------------------------------------------

const staffRole = z.enum(STAFF_MEMBER_ROLE_KEYS, { errorMap: () => ({ message: "Choose the role" }) });
const STAFF_AGE_MESSAGE = `A staff member must be ${MIN_TEACHER_AGE} to ${MAX_TEACHER_AGE} years old`;
const staffBirthday = day("date of birth").refine((value) => {
  if (!(value instanceof Date)) return true;
  const age = ageOn(value, new Date(`${todayInIndia()}T00:00:00.000Z`));
  return age >= MIN_TEACHER_AGE && age <= MAX_TEACHER_AGE;
}, STAFF_AGE_MESSAGE);

/** The role's name the school writes for Other (kept only for Other: the service drops it for any other role). */
const roleOther = textOrNull("role's name", MAX_ROLE_OTHER);
export const ROLE_OTHER_MESSAGE = "Enter the role's name";

/**
 * `POST /staff/members`: a name, the role and the **login** the school makes (username and password, like a teacher's); an email and the rest
 * of the details may be left out. `roleOther` is needed for the role Other. `alsoTeacher` makes the person a teacher of the school too
 * (with `subjectIds`, what they can teach).
 */
export const createStaffMemberSchema = z
  .object({
    name: label("name", MAX_TEACHER_NAME),
    role: staffRole,
    roleOther: roleOther.optional(),
    email: fields.email.optional(),
    login: loginAccountSchema,
    mobile: fields.mobile.optional(),
    gender: fields.gender.optional(),
    dateOfBirth: staffBirthday.optional(),
    address: fields.address.optional(),
    designation: fields.designation.optional(),
    employeeCode: fields.employeeCode.optional(),
    joiningDate: fields.joiningDate.optional(),
    alsoTeacher: z.boolean().optional(),
    subjectIds: fields.subjectIds.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "other" && !value.roleOther) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["roleOther"], message: ROLE_OTHER_MESSAGE });
  });
export type CreateStaffMemberInput = z.infer<typeof createStaffMemberSchema>;

/**
 * `PATCH /staff/members/:id`: some details (the email too: it is only a contact and a second way in), the role, who also teaches, and (for a
 * person with a login) on or off. Whether Other has a name is judged by the service, which knows the role the person has now.
 */
export const updateStaffMemberSchema = z
  .object({
    name: label("name", MAX_TEACHER_NAME),
    role: staffRole,
    roleOther,
    email: fields.email,
    mobile: fields.mobile,
    gender: fields.gender,
    dateOfBirth: staffBirthday,
    address: fields.address,
    designation: fields.designation,
    employeeCode: fields.employeeCode,
    joiningDate: fields.joiningDate,
    alsoTeacher: z.boolean(),
    subjectIds: fields.subjectIds,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to change" });
export type UpdateStaffMemberInput = z.infer<typeof updateStaffMemberSchema>;

export const listStaffMembersQuerySchema = z.object({
  status: z.enum(["active", "invited", "inactive", "all"]).default("all"),
  role: staffRole.optional(),
  search: optionalText(40),
});
export type ListStaffMembersQuery = z.infer<typeof listStaffMembersQuerySchema>;
