import { z } from "zod";
import { dayText, objectId } from "../../classroom/schemas/classroom.schemas";
import { STAFF_MEMBER_ROLE_KEYS } from "../../staff/constants";
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

/** The most letters a search box of these sheets takes (the frontend's boxes stop at 60 too). */
const MAX_SEARCH = 60;
const searchText = z.string().trim().max(MAX_SEARCH, `The search is up to ${MAX_SEARCH} letters`).optional();
const rangeShape = { from: dayText("first day"), to: dayText("last day") };

export const rangeQuerySchema = z.object(rangeShape).superRefine(inOrder);
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

/** The teachers' sheet (2026-11-22): with a class, only the teachers of that class this year; with a search, only those whose name, code or post holds it. */
export const teacherSheetQuerySchema = z.object({ ...rangeShape, classId: objectId.optional(), search: searchText }).superRefine(inOrder);
export type TeacherSheetQuery = z.infer<typeof teacherSheetQuerySchema>;

/** The staff's sheet (2026-11-22): with a department (the staff member's role), only that department; with a search, only those it finds. */
export const staffSheetQuerySchema = z
  .object({ ...rangeShape, role: z.enum(STAFF_MEMBER_ROLE_KEYS, { errorMap: () => ({ message: "Choose a department of the list" }) }).optional(), search: searchText })
  .superRefine(inOrder);
export type StaffSheetQuery = z.infer<typeof staffSheetQuerySchema>;

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

/**
 * The day of every class (2026-11-22): one day; with a class, only that class (with a section of it, only that section; "none" for a class that is
 * not split); with a search, only the children whose name, admission number or roll number holds the words.
 */
export const dayQuerySchema = z
  .object({
    date: dayText("day"),
    classId: objectId.optional(),
    sectionId: z.union([z.literal("none"), objectId]).optional(),
    search: searchText,
  })
  .superRefine((v, ctx) => {
    if (v.sectionId && !v.classId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["classId"], message: "Choose the class of the section" });
  });
export type DayQuery = z.infer<typeof dayQuerySchema>;

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

// ---- Leave of the teachers and the staff (2026-11-24) ----------------------------------------------------------------------------------

const MAX_LEAVE_REASON_LETTERS = 300;
const MAX_LEAVE_RANGE = 60;

/** A teacher or staff member applies: the first day, the last (left out: one day) and why. Today or a day to come is the server's check (it knows today). */
export const applyStaffLeaveSchema = z
  .object({
    fromDate: dayText("first day"),
    toDate: dayText("last day").nullable().optional(),
    reason: z
      .string({ required_error: "Write why you need the leave", invalid_type_error: "Write why you need the leave" })
      .trim()
      .min(1, "Write why you need the leave")
      .max(MAX_LEAVE_REASON_LETTERS, `The reason is up to ${MAX_LEAVE_REASON_LETTERS} letters`),
  })
  .superRefine((v, ctx) => {
    if (!v.toDate) return;
    if (v.toDate < v.fromDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toDate"], message: "The last day cannot be before the first day" });
    else if ((Date.parse(`${v.toDate}T00:00:00Z`) - Date.parse(`${v.fromDate}T00:00:00Z`)) / DAY_MS + 1 > MAX_LEAVE_RANGE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toDate"], message: `A leave is up to ${MAX_LEAVE_RANGE} days` });
    }
  });
export type ApplyStaffLeaveInput = z.infer<typeof applyStaffLeaveSchema>;

/** The school's list of applications: the waiting ones (the default) or all, of everyone or only teachers or only staff. */
export const staffLeaveQuerySchema = z.object({
  status: z.enum(["pending", "all"]).default("pending"),
  who: z.enum(["all", "teacher", "staff"]).default("all"),
});
export type StaffLeaveQuery = z.infer<typeof staffLeaveQuerySchema>;

export const decideStaffLeaveSchema = z.object({
  status: z.enum(["approved", "declined"], { errorMap: () => ({ message: "Approve or decline" }) }),
  note: z
    .string({ invalid_type_error: "The note must be text" })
    .trim()
    .max(MAX_LEAVE_REASON_LETTERS, `The note is up to ${MAX_LEAVE_REASON_LETTERS} letters`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type DecideStaffLeaveInput = z.infer<typeof decideStaffLeaveSchema>;

export const leaveIdParamSchema = z.object({ id: objectId });
