import { z } from "zod";
import { MAX_LABEL, MAX_LESSONS_PER_CELL, MAX_PERIODS, MAX_ROOM, MAX_SCHEDULE_NAME, SCHEDULE_SCOPES, SLOT_KINDS } from "../constants";
import { clockToMinutes } from "../time";
import { idParamSchema, label, objectId } from "../../subjects/schemas/subjects.schemas";

export { idParamSchema, objectId };

export const TIME_MESSAGE = "Enter a time like 08:30";

/** "08:30" -> 510. */
const clock = z
  .string({ required_error: TIME_MESSAGE, invalid_type_error: TIME_MESSAGE })
  .trim()
  .transform((value, ctx) => {
    const minutes = clockToMinutes(value);
    if (minutes === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: TIME_MESSAGE });
      return z.NEVER;
    }
    return minutes;
  });

const slotLabel = z
  .string()
  .trim()
  .max(MAX_LABEL, `Keep the name under ${MAX_LABEL} characters`)
  .regex(/^[^<>]*$/, "The name cannot contain < or >")
  .transform((value) => value.replace(/\s+/g, " "))
  .default("");

export const slotSchema = z
  .object({
    kind: z.enum(SLOT_KINDS, { errorMap: () => ({ message: "Choose period, lunch or break" }) }),
    label: slotLabel,
    start: clock,
    end: clock,
  })
  // A lunch and a break are always called something.
  .transform((slot) => ({ ...slot, label: slot.label || (slot.kind === "lunch" ? "Lunch" : slot.kind === "break" ? "Break" : "") }));

export const DAYS_MESSAGE = "Choose the days this timing runs on";
const days = z
  .array(z.number({ invalid_type_error: DAYS_MESSAGE }).int().min(1, DAYS_MESSAGE).max(7, DAYS_MESSAGE))
  .min(1, DAYS_MESSAGE)
  .refine((value) => new Set(value).size === value.length, "Choose each day once")
  .transform((value) => [...value].sort((a, b) => a - b));

const fields = {
  name: label("name of the timing", MAX_SCHEDULE_NAME),
  days,
  scope: z.enum(SCHEDULE_SCOPES, { errorMap: () => ({ message: "Choose which classes it is for" }) }),
  classIds: z.array(objectId).max(60).transform((ids) => [...new Set(ids)]),
  slots: z.array(slotSchema).max(60, "Too many rows"),
};

/** "Only these classes" needs classes; "all" has none; "all but none" is "all". */
const normaliseScope = <T extends { scope: "all" | "only" | "except"; classIds: string[] }>(value: T): T => ({
  ...value,
  scope: value.scope === "except" && value.classIds.length === 0 ? "all" : value.scope,
  classIds: value.scope === "all" ? [] : value.classIds,
});

export const createScheduleSchema = z
  .object({ name: fields.name, days: fields.days, scope: fields.scope.default("all"), classIds: fields.classIds.default([]), slots: fields.slots })
  .refine((value) => value.scope !== "only" || value.classIds.length > 0, { message: "Choose the classes it is for", path: ["classIds"] })
  .transform(normaliseScope);
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z
  .object(fields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to change" })
  .refine((value) => value.scope !== "only" || (value.classIds?.length ?? 0) > 0, { message: "Choose the classes it is for", path: ["classIds"] });
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

/**
 * The whole week of the school in one save (`PUT /timetable/school-day`): the rows of each day that has school. A day that is not sent is
 * a holiday. The server makes one timing of the days whose rows are the same.
 */
const DAY_MESSAGE = "Choose a day from Monday to Sunday";
export const schoolDaySchema = z.object({
  /** A department's own week; left out (or null) for the whole school. */
  departmentId: objectId.nullable().optional(),
  days: z
    .array(
      z.object({
        day: z.number({ required_error: DAY_MESSAGE, invalid_type_error: DAY_MESSAGE }).int(DAY_MESSAGE).min(1, DAY_MESSAGE).max(7, DAY_MESSAGE),
        slots: fields.slots,
      })
    )
    .min(1, "Keep at least one day with school")
    .max(7, "A week has seven days")
    .refine((value) => new Set(value.map((d) => d.day)).size === value.length, "Choose each day once"),
});
export type SchoolDayInput = z.infer<typeof schoolDaySchema>;

/**
 * A class's own days in one save (`PUT /timetable/class-day`): the rows of each day that is its own (a different number of periods, a
 * holiday sent with no rows); every other day follows the school's (or the department's) timing. No days: the class follows it every day.
 * `removeLessons` agrees to take the lessons out of the periods the class will no longer have; without it they are refused.
 */
export const classDaySchema = z.object({
  classId: objectId,
  days: z
    .array(
      z.object({
        day: z.number({ required_error: DAY_MESSAGE, invalid_type_error: DAY_MESSAGE }).int(DAY_MESSAGE).min(1, DAY_MESSAGE).max(7, DAY_MESSAGE),
        slots: fields.slots,
      })
    )
    .max(7, "A week has seven days")
    .refine((value) => new Set(value.map((d) => d.day)).size === value.length, "Choose each day once"),
  removeLessons: z.boolean().default(false),
});
export type ClassDayInput = z.infer<typeof classDaySchema>;

// ---- A class's weekly timetable ------------------------------------------------------------------------------------------------

const room = z
  .string()
  .trim()
  .max(MAX_ROOM, `Keep the room under ${MAX_ROOM} characters`)
  .regex(/^[^<>]*$/, "The room cannot contain < or >")
  .transform((value) => value.replace(/\s+/g, " ") || null);

export const lessonSchema = z.object({
  subjectId: objectId,
  teacherId: objectId.nullable().default(null),
  room: room.nullable().default(null),
});

export const cellSchema = z.object({
  day: z.number().int().min(1, "Choose a day from 1 to 7").max(7, "Choose a day from 1 to 7"),
  period: z.number().int().min(1, "The first period is 1").max(MAX_PERIODS, `A day has up to ${MAX_PERIODS} periods`),
  lessons: z.array(lessonSchema).min(1, "A period holds at least one lesson").max(MAX_LESSONS_PER_CELL, `A period holds up to ${MAX_LESSONS_PER_CELL} lessons`),
});
export type CellInput = z.infer<typeof cellSchema>;

/** The unit a request is about: a section, or a class that has none (`sectionId` null). */
const unit = { classId: objectId, sectionId: objectId.nullable().default(null) };

export const saveGridSchema = z.object({ ...unit, cells: z.array(cellSchema).max(7 * MAX_PERIODS, "Too many periods") });
export type SaveGridInput = z.infer<typeof saveGridSchema>;

export const unitBodySchema = z.object(unit);
export type UnitBody = z.infer<typeof unitBodySchema>;

/** The grid as it stands on the screen (kept as it is), to be filled; the same seed gives the same arrangement. */
export const autofillSchema = z.object({
  ...unit,
  cells: z.array(cellSchema).max(7 * MAX_PERIODS, "Too many periods"),
  seed: z.number().int().min(0).max(1_000_000_000).optional(),
});
export type AutofillBody = z.infer<typeof autofillSchema>;

/** One section's saved timetable, given to these sections of the same class. */
export const copySchema = z.object({
  ...unit,
  toSections: z.array(objectId).min(1, "Choose the sections to copy to").max(30, "Up to 30 sections"),
  replace: z.boolean().default(false),
});
export type CopyBody = z.infer<typeof copySchema>;

/** Gives one teacher's classes and lessons to another. */
export const replaceTeacherSchema = z.object({ withTeacherId: objectId, deactivate: z.boolean().default(false) });
export type ReplaceTeacherBody = z.infer<typeof replaceTeacherSchema>;

/** What the overview's class list can be asked: by name, and by where the timetable stands. The server does it, so a screen never downloads more than it shows. */
export const overviewQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => value || undefined),
  status: z.enum(["all", "none", "draft", "published"]).default("all"),
});
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
