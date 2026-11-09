import { z } from "zod";
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
export const attendanceQuerySchema = z.object({ classId: objectId, sectionId: sectionOrNone.optional().default("none"), date: dayText("day") });
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

export const childAttendanceQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Write the month as YYYY-MM").optional() });
export type ChildAttendanceQuery = z.infer<typeof childAttendanceQuerySchema>;

// ---- Diary and tests -----------------------------------------------------------------------------------------------------------------
export const unitQuerySchema = z.object({ classId: objectId, sectionId: sectionOrNone.optional().default("none") });
export type UnitQuery = z.infer<typeof unitQuerySchema>;
export const unitDayQuerySchema = unitQuerySchema.extend({ date: dayText("day") });
export type UnitDayQuery = z.infer<typeof unitDayQuerySchema>;

const text500 = (what: string) => z.string().trim().max(500, `${what} is up to 500 letters`).optional().default("");
export const saveDiarySchema = z
  .object({ classId: objectId, sectionId: objectId.nullable().optional(), date: dayText("day"), subjectId: objectId, taught: text500("What was taught"), homework: text500("The homework") })
  .superRefine((v, ctx) => {
    if (!v.taught && !v.homework) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taught"], message: "Write what was taught or the homework" });
  });
export type SaveDiaryInput = z.infer<typeof saveDiarySchema>;

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
