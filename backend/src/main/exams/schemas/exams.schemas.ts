import { z } from "zod";
import { clockToMinutes } from "../../timetable/time";
import { EXAM_TYPES, MAX_DURATION, MAX_EXAM_NAME, MAX_NOTE, MAX_PAPERS_AT_ONCE, MAX_TOPIC, MIN_DURATION } from "../constants";

/** The request shapes of Test & Exam. The rules that need the school's records (inside the year, clashes) are the service's, in the same words. */

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const examIdParamSchema = z.object({ id: z.string().regex(OBJECT_ID, "Invalid id") });
export const paperParamsSchema = z.object({ id: z.string().regex(OBJECT_ID, "Invalid id"), paperId: z.string().regex(OBJECT_ID, "Invalid id") });

/** A calendar day as "2026-09-15" (a real day, not "2026-02-31"). */
const day = (message: string) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .refine((v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const parsed = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
    }, message);

/** A time of day as "09:30". */
const clock = (message: string) => z.string({ required_error: message, invalid_type_error: message }).refine((v) => clockToMinutes(v) !== null, message);

/** Left out stays left out (a change that does not mention it keeps it); an empty one, or null, clears it. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

const name = z.string({ required_error: "Enter the exam name", invalid_type_error: "Enter the exam name" }).trim().min(1, "Enter the exam name").max(MAX_EXAM_NAME, `The name is up to ${MAX_EXAM_NAME} letters`);
const type = z.enum(EXAM_TYPES, { errorMap: () => ({ message: "Choose what it is" }) });

const lastDayAfterFirst = (v: { startDate?: string; endDate?: string | null }, ctx: z.RefinementCtx) => {
  if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "The last day cannot be before the first day" });
};

export const createExamSchema = z
  .object({
    name,
    type,
    startDate: day("Choose the first day"),
    endDate: day("Choose the last day").nullable().optional(),
    schoolStart: clock("Enter the time school starts").nullable().optional(),
    schoolEnd: clock("Enter the time school ends").nullable().optional(),
    note: optionalText(MAX_NOTE, `The note is up to ${MAX_NOTE} letters`),
  })
  .superRefine(lastDayAfterFirst);
export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = z
  .object({
    name: name.optional(),
    type: type.optional(),
    startDate: day("Choose the first day").optional(),
    endDate: day("Choose the last day").optional(),
    schoolStart: clock("Enter the time school starts").nullable().optional(),
    schoolEnd: clock("Enter the time school ends").nullable().optional(),
    note: optionalText(MAX_NOTE, `The note is up to ${MAX_NOTE} letters`),
  })
  .superRefine(lastDayAfterFirst);
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

export const listExamsQuerySchema = z.object({ status: z.enum(["upcoming", "running", "over"]).optional() });
export type ListExamsQuery = z.infer<typeof listExamsQuerySchema>;

// ---- Papers ----------------------------------------------------------------------------------------------------------------------------
const classId = z.string({ required_error: "Choose classes of this school", invalid_type_error: "Choose classes of this school" }).regex(OBJECT_ID, "Choose classes of this school");
const subjectId = z.string({ required_error: "Choose a subject of this school", invalid_type_error: "Choose a subject of this school" }).regex(OBJECT_ID, "Choose a subject of this school");
const DURATION = `The time is ${MIN_DURATION} minutes to ${MAX_DURATION / 60} hours`;
const duration = z.number({ required_error: DURATION, invalid_type_error: DURATION }).int(DURATION).min(MIN_DURATION, DURATION).max(MAX_DURATION, DURATION);
const MARKS = "The marks are 1 to 1000";
const maxMarks = z.number({ invalid_type_error: MARKS }).int(MARKS).min(1, MARKS).max(1000, MARKS).nullable().optional();
const topic = optionalText(MAX_TOPIC, `The topic is up to ${MAX_TOPIC} letters`);

const paperRow = z.object({
  subjectId,
  date: day("Choose the day"),
  startTime: clock("Enter the start time"),
  durationMinutes: duration,
  maxMarks,
  topic,
});

/** Several rows for the same classes at once: "set the timetable of these classes". */
export const addPapersSchema = z.object({
  classIds: z.array(classId, { required_error: "Choose at least one class" }).min(1, "Choose at least one class").transform((ids) => [...new Set(ids)]),
  papers: z.array(paperRow, { required_error: "Add at least one paper" }).min(1, "Add at least one paper").max(MAX_PAPERS_AT_ONCE, `Add up to ${MAX_PAPERS_AT_ONCE} papers at a time`),
});
export type AddPapersInput = z.infer<typeof addPapersSchema>;

export const updatePaperSchema = z.object({
  classIds: z.array(classId).min(1, "Choose at least one class").transform((ids) => [...new Set(ids)]).optional(),
  subjectId: subjectId.optional(),
  date: day("Choose the day").optional(),
  startTime: clock("Enter the start time").optional(),
  durationMinutes: duration.optional(),
  maxMarks,
  topic,
});
export type UpdatePaperInput = z.infer<typeof updatePaperSchema>;

// ---- What a class's teachers and the school see, and the marks -------------------------------------------------------------------------
/** A class, and one of its sections ("none" for a class that is not split), and a day whose week is wanted (today's when left out). */
export const classExamsQuerySchema = z.object({
  classId: z.string({ required_error: "Choose a class" }).regex(OBJECT_ID, "Choose a class"),
  sectionId: z.union([z.literal("none"), z.string().regex(OBJECT_ID, "Choose a section")]).optional().default("none"),
  date: day("Choose a day").optional(),
});
export type ClassExamsQuery = z.infer<typeof classExamsQuerySchema>;

/** A parent's read of a child's exams: the day whose week is wanted (today's when left out). */
export const childExamsQuerySchema = z.object({ date: day("Choose a day").optional() });
export type ChildExamsQuery = z.infer<typeof childExamsQuerySchema>;

export const paperIdParamSchema = z.object({ paperId: z.string().regex(OBJECT_ID, "Invalid id") });
export const marksSheetQuerySchema = classExamsQuerySchema.pick({ classId: true, sectionId: true });
export type MarksSheetQuery = z.infer<typeof marksSheetQuerySchema>;

const MARK_STEP = "Marks are whole or half marks";
/** Marks of the children of one class or section in one paper: a number, or absent. A child left out keeps what they had; marks and no absence, or neither, clears them. */
export const saveExamMarksSchema = z.object({
  classId,
  sectionId: z.string().regex(OBJECT_ID, "Choose a section").nullable().optional(),
  marks: z
    .array(
      z.object({
        studentId: z.string().regex(OBJECT_ID, "Invalid child"),
        marks: z.number({ invalid_type_error: "Enter the marks" }).min(0, "Marks cannot be below 0").multipleOf(0.5, MARK_STEP).nullable(),
        absent: z.boolean().optional().default(false),
      })
    )
    .max(500, "Too many children"),
});
export type SaveExamMarksInput = z.infer<typeof saveExamMarksSchema>;
