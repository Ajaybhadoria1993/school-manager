import { z } from "zod";
import { clockToMinutes } from "../../timetable/time";
import { MAX_ROLL_NUMBER } from "../../students/constants";
import { EXAM_SCOPES, EXAM_TYPES, MAX_DURATION, MAX_DUTY_TEACHERS, MAX_EXAM_NAME, MAX_NOTE, MAX_PAPERS_AT_ONCE, MAX_ROLLS_AT_ONCE, MAX_ROOM, MAX_TOPIC, MIN_DURATION } from "../constants";

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

/** Whom the exam is for (2026-11-26): the whole school, or the departments or the classes it names (at least one). */
const scope = z.enum(EXAM_SCOPES, { errorMap: () => ({ message: "Choose whom the exam is for" }) });
const idList = (message: string) => z.array(z.string().regex(OBJECT_ID, message), { invalid_type_error: message }).max(200, message).transform((ids) => [...new Set(ids)]);
const departmentIds = idList("Choose departments of this school");
const examClassIds = idList("Choose classes of this school");
const namesWhom = (v: { scope?: string; departmentIds?: string[]; classIds?: string[] }, ctx: z.RefinementCtx) => {
  if (v.scope === "departments" && (v.departmentIds ?? []).length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["departmentIds"], message: "Choose the departments" });
  if (v.scope === "classes" && (v.classIds ?? []).length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["classIds"], message: "Choose the classes" });
};

export const createExamSchema = z
  .object({
    name,
    type,
    startDate: day("Choose the first day"),
    endDate: day("Choose the last day").nullable().optional(),
    schoolStart: clock("Enter the time school starts").nullable().optional(),
    schoolEnd: clock("Enter the time school ends").nullable().optional(),
    scope: scope.optional().default("school"),
    departmentIds: departmentIds.optional().default([]),
    classIds: examClassIds.optional().default([]),
    note: optionalText(MAX_NOTE, `The note is up to ${MAX_NOTE} letters`),
  })
  .superRefine(lastDayAfterFirst)
  .superRefine(namesWhom);
export type CreateExamInput = z.infer<typeof createExamSchema>;

/** A change of whom it is for sends the scope with its list (the list alone keeps the scope). */
export const updateExamSchema = z
  .object({
    name: name.optional(),
    type: type.optional(),
    startDate: day("Choose the first day").optional(),
    endDate: day("Choose the last day").optional(),
    schoolStart: clock("Enter the time school starts").nullable().optional(),
    schoolEnd: clock("Enter the time school ends").nullable().optional(),
    scope: scope.optional(),
    departmentIds: departmentIds.optional(),
    classIds: examClassIds.optional(),
    note: optionalText(MAX_NOTE, `The note is up to ${MAX_NOTE} letters`),
  })
  .superRefine(lastDayAfterFirst)
  .superRefine(namesWhom);
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

// ---- The children of an exam, their roll numbers and rooms (2026-11-27) ---------------------------------------------------------------
/** A class of the exam, and one of its sections (left out: every section). */
export const rosterQuerySchema = z.object({
  classId: z.string({ required_error: "Choose a class" }).regex(OBJECT_ID, "Choose a class"),
  sectionId: z.string().regex(OBJECT_ID, "Choose a section").optional(),
});
export type RosterQuery = z.infer<typeof rosterQuerySchema>;

const ROLL = `A roll number is 1 to ${MAX_ROLL_NUMBER}`;
const rollNumber = z.number({ invalid_type_error: ROLL }).int(ROLL).min(1, ROLL).max(MAX_ROLL_NUMBER, ROLL);

/** Roll numbers of some children at once (null clears one): each child's own in their class or section. */
export const rollNumbersSchema = z.object({
  rows: z
    .array(z.object({ studentId: z.string().regex(OBJECT_ID, "Invalid child"), rollNumber: rollNumber.nullable() }), { required_error: "Give at least one roll number" })
    .min(1, "Give at least one roll number")
    .max(MAX_ROLLS_AT_ONCE, `Up to ${MAX_ROLLS_AT_ONCE} roll numbers at a time`),
});
export type RollNumbersInput = z.infer<typeof rollNumbersSchema>;

/** A room and the run of roll numbers of a class (or one of its sections) that sit in it. */
export const roomSchema = z
  .object({
    room: z.string({ required_error: "Enter the room" }).trim().min(1, "Enter the room").max(MAX_ROOM, `The room is up to ${MAX_ROOM} letters`),
    classId: z.string({ required_error: "Choose the class" }).regex(OBJECT_ID, "Choose the class"),
    sectionId: z.string().regex(OBJECT_ID, "Choose the section").nullable().optional().default(null),
    fromRoll: rollNumber,
    toRoll: rollNumber,
  })
  .superRefine((v, ctx) => {
    if (v.toRoll < v.fromRoll) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toRoll"], message: "The last roll number cannot be before the first" });
  });
export type RoomInput = z.infer<typeof roomSchema>;
export const roomParamsSchema = z.object({ id: z.string().regex(OBJECT_ID, "Invalid id"), roomId: z.string().regex(OBJECT_ID, "Invalid id") });

/** The teachers on duty in a room for the whole exam (2026-11-27): one or two; none leaves the room with nobody. */
export const dutySchema = z.object({
  room: z.string({ required_error: "Choose the room" }).trim().min(1, "Choose the room").max(MAX_ROOM, "Choose the room"),
  teacherIds: z
    .array(z.string().regex(OBJECT_ID, "Choose teachers of this school"), { required_error: "Choose the teachers", invalid_type_error: "Choose the teachers" })
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.length <= MAX_DUTY_TEACHERS, `Up to ${MAX_DUTY_TEACHERS} teachers in a room`),
});
export type DutyInput = z.infer<typeof dutySchema>;

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
