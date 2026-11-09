import { z } from "zod";
import { dayText, objectId } from "../../classroom/schemas/classroom.schemas";
import { clockToMinutes } from "../../timetable/time";
import { MAX_RANGE_DAYS } from "../constants";
import { MAX_NOTE, TEACHER_MARKS } from "../models/TeacherAttendance";

/** The request shapes of attendance for the school. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Two real days, the first not after the last, a year at most apart. */
const inOrder = (v: { from: string; to: string }, ctx: z.RefinementCtx) => {
  const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "The last day cannot be before the first day" });
  else if (days > MAX_RANGE_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Choose a year or less" });
};

export const rangeQuerySchema = z.object({ from: dayText("first day"), to: dayText("last day") }).superRefine(inOrder);
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

/** A class, a section of it, "all" (every section of the class) or "none" (a class that is not split). */
export const studentsQuerySchema = z
  .object({
    classId: objectId,
    sectionId: z.union([z.literal("all"), z.literal("none"), objectId]).optional().default("all"),
    from: dayText("first day"),
    to: dayText("last day"),
  })
  .superRefine(inOrder);
export type StudentsQuery = z.infer<typeof studentsQuerySchema>;

export const myDayQuerySchema = z.object({ date: dayText("day").optional() });
export type MyDayQuery = z.infer<typeof myDayQuerySchema>;

export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Write the month as YYYY-MM").optional() });
export type MonthQuery = z.infer<typeof monthQuerySchema>;

export const teacherIdParamSchema = z.object({ teacherId: objectId });

/** The school marks a teacher's day: Present (with the time they came, now or the start of school when left out), Absent or Leave, with a note. */
export const setTeacherDaySchema = z.object({
  date: dayText("day"),
  status: z.enum(TEACHER_MARKS, { errorMap: () => ({ message: "Present, absent or leave" }) }),
  time: z
    .string({ invalid_type_error: "Enter the time as 09:30" })
    .refine((v) => clockToMinutes(v) !== null, "Enter the time as 09:30")
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  note: z
    .string({ invalid_type_error: "The note must be text" })
    .trim()
    .max(MAX_NOTE, `The note is up to ${MAX_NOTE} letters`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type SetTeacherDayInput = z.infer<typeof setTeacherDaySchema>;
