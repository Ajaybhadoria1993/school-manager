import { z } from "zod";
import { MAX_CHAPTER_NAME, MAX_CHAPTERS } from "../models/ClassWork";
import { ATTENDANCE_STATUSES, MAX_REASON } from "../models/AttendanceDay";
import { CALENDAR_KINDS } from "../models/CalendarEvent";

/** The request shapes of the daily flow of parents and teachers (docs/parent-teacher-flow.md). */

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
export const idParamSchema = z.object({ id: objectId });

/** A calendar day as "2026-11-08" (a real day, not "2026-02-31"). */
export const dayText = (what: string) =>
  z
    .string({ required_error: `Enter the ${what}`, invalid_type_error: `Enter the ${what}` })
    .refine((v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const parsed = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
    }, `Write the ${what} as a real day, YYYY-MM-DD`);

/** Left out stays left out (a change that does not mention it keeps it); an empty one, or null, clears it. */
const optionalNote = z
  .string()
  .trim()
  .max(300, "The note is up to 300 letters")
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

const title = z.string({ required_error: "Enter the name" }).trim().min(1, "Enter the name").max(80, "The name is up to 80 letters");
const kind = z.enum(CALENDAR_KINDS, { errorMap: () => ({ message: "Choose Holiday or Event" }) });

const lastDayAfterFirst = (v: { startDate?: string; endDate?: string | null }, ctx: z.RefinementCtx) => {
  if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "The last day cannot be before the first day" });
};

export const createEventSchema = z
  .object({ title, kind, startDate: dayText("first day"), endDate: dayText("last day").nullable().optional(), note: optionalNote })
  .superRefine(lastDayAfterFirst);
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({ title: title.optional(), kind: kind.optional(), startDate: dayText("first day").optional(), endDate: dayText("last day").optional(), note: optionalNote })
  .superRefine(lastDayAfterFirst);
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const calendarQuerySchema = z.object({ from: dayText("first day").optional(), to: dayText("last day").optional() });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

/** A standard holiday by its key ("2026-11-08-diwali"); a key the list does not know is answered in words (404), not refused here. */
export const standardKeyParamSchema = z.object({ key: z.string().trim().min(1).max(100) });
export const setStandardShownSchema = z.object({ shown: z.boolean({ required_error: "Say whether it is on the calendar", invalid_type_error: "Say whether it is on the calendar" }) });
export type SetStandardShownInput = z.infer<typeof setStandardShownSchema>;

// ---- Leave -------------------------------------------------------------------------------------------------------------------------
const MAX_LEAVE_DAYS = 31;
/** The most letters a search box on a sheet takes (the frontend's boxes stop at 60 too). */
const MAX_SEARCH = 60;
export const applyLeaveSchema = z
  .object({
    fromDate: dayText("first day"),
    toDate: dayText("last day").nullable().optional(),
    reason: z.string({ required_error: "Write why the child will not come" }).trim().min(1, "Write why the child will not come").max(300, "The reason is up to 300 letters"),
  })
  .superRefine((v, ctx) => {
    if (!v.toDate) return;
    if (v.toDate < v.fromDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toDate"], message: "The last day cannot be before the first day" });
    else if ((Date.parse(v.toDate) - Date.parse(v.fromDate)) / 86_400_000 + 1 > MAX_LEAVE_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toDate"], message: `A leave is up to ${MAX_LEAVE_DAYS} days` });
  });
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

export const decideLeaveSchema = z.object({
  status: z.enum(["approved", "declined"], { errorMap: () => ({ message: "Approve or decline" }) }),
  note: optionalNote,
});
export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>;

export const leaveQuerySchema = z.object({ status: z.enum(["pending", "all"]).optional() });
export type LeaveQuery = z.infer<typeof leaveQuerySchema>;

export const childLeaveParamsSchema = z.object({ id: objectId, leaveId: objectId });

// ---- Attendance ----------------------------------------------------------------------------------------------------------------------
const sectionOrNone = z.union([objectId, z.literal("none")]);
export const attendanceQuerySchema = z.object({
  classId: objectId,
  sectionId: sectionOrNone.optional().default("none"),
  date: dayText("day"),
  // The words typed in the school's search box (2026-11-22): the sheet then lists only the children whose name, admission number or roll number holds them.
  search: z.string().trim().max(MAX_SEARCH, `The search is up to ${MAX_SEARCH} letters`).optional(),
});
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;

export const saveAttendanceSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable().optional(),
  date: dayText("day"),
  marks: z
    .array(
      z.object({
        studentId: objectId,
        status: z.enum(ATTENDANCE_STATUSES, { errorMap: () => ({ message: "Present, absent, late or leave" }) }),
        // Why the child was absent or late (optional); empty is none.
        reason: z
          .string({ invalid_type_error: "The reason must be text" })
          .trim()
          .max(MAX_REASON, `The reason is up to ${MAX_REASON} letters`)
          .nullable()
          .optional()
          .transform((v) => (v ? v : null)),
      })
    )
    .max(500, "Too many children"),
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;

/** The school marks one child on one day (a cell of the register): there or not there, nothing else. */
export const markStudentSchema = z.object({
  studentId: objectId,
  date: dayText("day"),
  status: z.enum(["present", "absent"], { errorMap: () => ({ message: "Present or absent" }) }),
});
export type MarkStudentInput = z.infer<typeof markStudentSchema>;

export const childAttendanceQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Write the month as YYYY-MM").optional() });
export type ChildAttendanceQuery = z.infer<typeof childAttendanceQuerySchema>;

// ---- Diary and tests -----------------------------------------------------------------------------------------------------------------
export const unitQuerySchema = z.object({ classId: objectId, sectionId: sectionOrNone.optional().default("none") });
export type UnitQuery = z.infer<typeof unitQuerySchema>;
export const unitDayQuerySchema = unitQuerySchema.extend({ date: dayText("day") });
export type UnitDayQuery = z.infer<typeof unitDayQuerySchema>;

const text500 = (what: string) => z.string().trim().max(500, `${what} is up to 500 letters`).optional().default("");
export const saveDiarySchema = z
  .object({
    classId: objectId,
    sectionId: objectId.nullable().optional(),
    date: dayText("day"),
    subjectId: objectId,
    taught: text500("What was taught"),
    homework: text500("The homework"),
    // The chapter taught: left out, the day keeps the one it has; null takes it away.
    chapterId: objectId.nullable().optional(),
    // Whether that chapter is finished now; left out, it stays as it is.
    chapterDone: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.taught && !v.homework && !v.chapterId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taught"], message: "Write what was taught or the homework" });
  });
export type SaveDiaryInput = z.infer<typeof saveDiarySchema>;

export const saveSyllabusSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable().optional(),
  subjectId: objectId,
  chapters: z
    .array(
      z.object({
        id: objectId.optional(),
        name: z.string({ required_error: "Write the chapter's name" }).trim().min(1, "Write the chapter's name").max(MAX_CHAPTER_NAME, `A chapter's name is up to ${MAX_CHAPTER_NAME} letters`),
        done: z.boolean().optional(),
        // The day it is to be finished by: left out, the chapter keeps its own; null takes it away.
        plannedOn: dayText("planned day").nullable().optional(),
      })
    )
    .max(MAX_CHAPTERS, `A subject has up to ${MAX_CHAPTERS} chapters`)
    .refine((list) => new Set(list.flatMap((c) => c.id ?? [])).size === list.filter((c) => c.id).length, "A chapter is written once"),
});
export type SaveSyllabusInput = z.infer<typeof saveSyllabusSchema>;

/** The class subject a list of chapters is wanted for (copying). */
export const syllabusSourcesQuerySchema = unitQuerySchema.extend({ subjectId: objectId });
export type SyllabusSourcesQuery = z.infer<typeof syllabusSourcesQuerySchema>;

// ---- The daily class work reminder ----------------------------------------------------------------------------------------------------
/** Noon to 9 PM: a reminder is about a school day that is over, and nobody is rung at night. */
export const REMINDER_HOURS = { from: "12:00", to: "21:00" };
export const reminderSchema = z.object({
  enabled: z.boolean({ required_error: "Say whether teachers are reminded" }),
  time: z
    .string({ required_error: "Choose the time" })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose the time")
    .refine((t) => t >= REMINDER_HOURS.from && t <= REMINDER_HOURS.to, "Choose a time from 12 PM to 9 PM"),
});
export type ReminderInput = z.infer<typeof reminderSchema>;

// ---- Teaching progress ---------------------------------------------------------------------------------------------------------------
/** Up to a year of days at a time. */
const MAX_PROGRESS_DAYS = 366;
const progressShape = z.object({
  from: dayText("first day"),
  to: dayText("last day"),
  classId: objectId.optional(),
  sectionId: sectionOrNone.optional(),
  subjectId: objectId.optional(),
  teacherId: objectId.optional(),
});
const checkDays = (v: { from: string; to: string }, ctx: z.RefinementCtx) => {
  if (v.from > v.to) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "The last day is not before the first" });
  else if ((Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 >= MAX_PROGRESS_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Choose up to a year of days" });
};
export const progressQuerySchema = progressShape.superRefine(checkDays);
export type ProgressQuery = z.infer<typeof progressQuerySchema>;
export const progressLogQuerySchema = progressShape
  .extend({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) })
  .superRefine(checkDays);
export type ProgressLogQuery = z.infer<typeof progressLogQuerySchema>;

export const addTestSchema = z.object({
  classId: objectId,
  sectionId: objectId.nullable().optional(),
  subjectId: objectId,
  date: dayText("test day"),
  topic: z.string({ required_error: "Write the topic" }).trim().min(1, "Write the topic").max(200, "The topic is up to 200 letters"),
  maxMarks: z.number({ required_error: "Enter the marks it is out of", invalid_type_error: "Enter the marks it is out of" }).int("Whole marks").min(1, "1 to 1000").max(1000, "1 to 1000"),
});
export type AddTestInput = z.infer<typeof addTestSchema>;

export const saveMarksSchema = z.object({
  marks: z
    .array(z.object({ studentId: objectId, marks: z.number().min(0, "Marks cannot be below 0").nullable(), absent: z.boolean().optional().default(false) }))
    .max(500, "Too many children"),
});
export type SaveMarksInput = z.infer<typeof saveMarksSchema>;

export const childDiaryQuerySchema = z.object({ date: dayText("day").optional() });
