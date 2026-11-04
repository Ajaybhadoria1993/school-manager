import { z } from "zod";
import { INDIAN_MOBILE, nationalNumber } from "../../../utils/formFields";
import { passwordSchema, usernameSchema } from "../../auth/schemas/auth.schemas";
import { idParamSchema, label, objectId } from "../../subjects/schemas/subjects.schemas";
import { ageOn, todayInIndia } from "../../students/schemas/students.schemas";
import { INDIAN_STATES } from "../../tenants/constants";
import {
  EMPLOYMENT_TYPES,
  MAX_DAYS_BEFORE_JOINING,
  MAX_DESIGNATION,
  MAX_EMPLOYEE_CODE,
  MAX_EXPERIENCE_YEARS,
  MAX_PERIODS_PER_DAY,
  MAX_PERIODS_PER_WEEK,
  MAX_QUALIFICATION,
  MAX_TEACHER_AGE,
  MAX_TEACHER_NAME,
  MAX_TEACHER_SUBJECTS,
  MIN_TEACHER_AGE,
  MOBILE_MESSAGE,
  TEACHER_GENDERS,
} from "../constants";

export { idParamSchema };

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

/** `PUT /staff/class-teachers`: the class teacher of a section (or of a class without sections); null takes it away. */
export const setClassTeacherSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable(),
  teacherId: objectId.nullable(),
});
export type SetClassTeacherInput = z.infer<typeof setClassTeacherSchema>;

/** `PATCH /staff/teachers/:id/login`: another username for a teacher's login (the password stays). */
export const changeUsernameSchema = z.object({ username: usernameSchema });
export type ChangeUsernameInput = z.infer<typeof changeUsernameSchema>;
