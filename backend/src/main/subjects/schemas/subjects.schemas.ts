import { z } from "zod";
import {
  MAX_BLOCK_SIZE,
  MAX_GROUP_NAME,
  MAX_NEW_SUBJECTS,
  MAX_PERIODS_PER_WEEK,
  MAX_SUBJECT_CODE,
  MAX_SUBJECT_NAME,
  SUBJECT_CATEGORIES,
} from "../constants";

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const objectId = z.string().regex(OBJECT_ID, "Invalid id");

export const idParamSchema = z.object({ id: objectId });

/** A name typed by a person: trimmed, inner spaces collapsed, no angle brackets. The same words the screens show. */
export function label(what: string, max: number) {
  return z
    .string({ required_error: `Enter the ${what}` })
    .trim()
    .min(1, `Enter the ${what}`)
    .max(max, `Keep the ${what} under ${max} characters`)
    .regex(/^[^<>]*$/, `The ${what} cannot contain < or >`)
    .transform((value) => value.replace(/\s+/g, " "));
}

export const CODE_MESSAGE = `The code is letters and digits only, up to ${MAX_SUBJECT_CODE}`;

/** A short code: upper case, letters and digits; an empty box clears it. */
const code = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === "" || new RegExp(`^[A-Z0-9]{1,${MAX_SUBJECT_CODE}}$`).test(value), CODE_MESSAGE)
  .transform((value) => value || null);

const category = z.enum(SUBJECT_CATEGORIES, { errorMap: () => ({ message: "Choose the kind of subject" }) });

export const createSubjectSchema = z.object({
  name: label("subject name", MAX_SUBJECT_NAME),
  code: code.optional(),
  category: category.default("academic"),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z
  .object({
    name: label("subject name", MAX_SUBJECT_NAME),
    code,
    category,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to change" });
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const quickAddSchema = z.object({
  names: z.array(label("subject name", MAX_SUBJECT_NAME)).min(1, "Choose at least one subject").max(MAX_NEW_SUBJECTS, `You can add up to ${MAX_NEW_SUBJECTS} subjects at once`),
});
export type QuickAddInput = z.infer<typeof quickAddSchema>;

/**
 * `PUT /subjects/allotments/teacher`: the teacher of one subject of one unit (from a teacher's page or a class's page). A subject the unit
 * does not study yet is added, with `periodsPerWeek`; null takes the teacher off and keeps the subject.
 */
export const assignTeacherSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable(),
  subjectId: objectId,
  teacherId: objectId.nullable(),
  periodsPerWeek: z
    .number({ invalid_type_error: "Enter the periods a week as a number" })
    .int("Enter whole periods")
    .min(1, "At least 1 period a week")
    .max(MAX_PERIODS_PER_WEEK, `Up to ${MAX_PERIODS_PER_WEEK} periods a week`)
    .optional(),
});
export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>;

export const listSubjectsQuerySchema =z.object({ status: z.enum(["active", "archived", "all"]).default("active") });
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;

// ---- What each class studies (the unit's allotments) ---------------------------------------------------------------------------

export const periodsPerWeek = z
  .number({ invalid_type_error: "Periods a week must be a number" })
  .int("Periods a week must be a whole number")
  .min(1, "At least 1 period a week")
  .max(MAX_PERIODS_PER_WEEK, `Up to ${MAX_PERIODS_PER_WEEK} periods a week`);

export const blockSize = z
  .number({ invalid_type_error: "The block must be a number" })
  .int()
  .min(1, "A block is 1 to 3 periods")
  .max(MAX_BLOCK_SIZE, "A block is 1 to 3 periods");

/** A choice the subject is one of ("Third language"); an empty box means "everyone studies it". */
export const groupName = z
  .string()
  .trim()
  .max(MAX_GROUP_NAME, `Keep the choice's name under ${MAX_GROUP_NAME} characters`)
  .regex(/^[^<>]*$/, "The choice's name cannot contain < or >")
  .transform((value) => value.replace(/\s+/g, " ") || null);

export const allotmentRowSchema = z.object({
  subjectId: objectId,
  periodsPerWeek,
  blockSize: blockSize.default(1),
  teacherId: objectId.nullable().default(null),
  group: groupName.nullable().default(null),
});
export type AllotmentRowInput = z.infer<typeof allotmentRowSchema>;

/** The unit: one section, or a class that has no sections (`sectionId` null). */
export const unitQuerySchema = z.object({
  classId: objectId,
  sectionId: z.union([objectId, z.literal("none")]).default("none"),
});
export type UnitQuery = z.infer<typeof unitQuerySchema>;

/**
 * Everything one class (or section) studies, replaced as a whole. `alsoSections` gives the same subjects, periods and choices to the
 * other sections of the class in the same request (the teachers only with `withTeachers`: a teacher is usually one section's).
 */
export const saveAllotmentsSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable().default(null),
  rows: z.array(allotmentRowSchema).max(40, "Up to 40 subjects for a class"),
  alsoSections: z.array(objectId).max(30).default([]),
  withTeachers: z.boolean().default(false),
});
export type SaveAllotmentsInput = z.infer<typeof saveAllotmentsSchema>;
