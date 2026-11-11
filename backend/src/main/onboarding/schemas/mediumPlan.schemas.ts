import { z } from "zod";
import { MAX_CLASS_CAPACITY, MAX_SECTION_CAPACITY, plannedClasses } from "../../academics/constants";
import { CLASS_LEVELS, MAX_SENIOR_STREAMS, MAX_STREAM_NAME, MEDIUMS } from "../../tenants/constants";
import { MAX_SLOTS } from "../../timetable/constants";
import { slotSchema } from "../../timetable/schemas/timetable.schemas";
import { slotProblems } from "../../timetable/services/scheduleRules";

const DAYS_MESSAGE = "Choose the days school is open";

/** A class starts with up to one section for each letter A to Z (the sections are named A, B, C...). */
export const MAX_PLAN_SECTIONS = 26;

/** A stream's name: letters and numbers, with a few marks a name can have, one space between words. */
const streamNameSchema = z
  .string({ invalid_type_error: "Name the stream" })
  .trim()
  .min(2, "Name the stream")
  .max(MAX_STREAM_NAME, `A stream's name is up to ${MAX_STREAM_NAME} letters`)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 &.,'()/+-]*$/, "Use letters and numbers in a stream's name")
  .transform((name) => name.replace(/\s+/g, " "));

/** Each stream once, whatever the case, in the order given. */
const eachOnce = (names: string[]) => names.filter((name, i) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === i);

/** A class of a medium: how many sections it starts with (none is fine) and the seats of each (of the class itself when it has none). */
const classRowSchema = z.object({
  name: z.string({ required_error: "Enter the class" }).trim().min(1, "Enter the class").max(40),
  sections: z.coerce
    .number({ message: "Enter the sections" })
    .int("Enter a whole number")
    .min(0, "Enter the sections")
    .max(MAX_PLAN_SECTIONS, `A class can start with up to ${MAX_PLAN_SECTIONS} sections`),
  seats: z.coerce
    .number({ message: "Enter the seats" })
    .int("Enter a whole number")
    .min(1, "Enter the seats")
    // Of one section, or of the whole class when it has no sections: the rows below say which limit applies.
    .max(MAX_CLASS_CAPACITY, `Up to ${MAX_CLASS_CAPACITY} seats`),
});

const rowsOfDay = z.array(slotSchema, { required_error: "Add at least one period", invalid_type_error: "Add at least one period" }).max(MAX_SLOTS, `Up to ${MAX_SLOTS} rows in a day`);

/** When a medium has school: the days, the rows of its usual day, and Saturday's own rows if Saturday is different. */
const weekSchema = z.object({
  days: z
    .array(z.number({ invalid_type_error: DAYS_MESSAGE }).int().min(1, DAYS_MESSAGE).max(7, DAYS_MESSAGE), { required_error: DAYS_MESSAGE, invalid_type_error: DAYS_MESSAGE })
    .min(1, DAYS_MESSAGE)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  usual: rowsOfDay,
  saturday: rowsOfDay
    .nullable()
    .optional()
    .transform((rows) => (rows && rows.length > 0 ? rows : null)),
});

/**
 * One medium of a board, run as its own side of the school: the classes it has (with their sections and seats, and a class per stream in 11
 * and 12) and its timing. What approval builds the school from, so its Classes page and School timings do not start empty.
 */
export const mediumPlanSchema = z
  .object({
    medium: z.enum(MEDIUMS, { message: "Choose a medium from the list" }),
    lowestClass: z.enum(CLASS_LEVELS, { message: "Choose the first class" }),
    highestClass: z.enum(CLASS_LEVELS, { message: "Choose the last class" }),
    seniorStreams: z
      .array(streamNameSchema)
      .max(MAX_SENIOR_STREAMS, `A medium can run up to ${MAX_SENIOR_STREAMS} streams`)
      .default([])
      .transform(eachOnce),
    classes: z.array(classRowSchema, { required_error: "Fill in the sections and seats of every class", invalid_type_error: "Fill in the sections and seats of every class" }),
    week: weekSchema,
  })
  // Streams are only classes in 11 and 12: a medium that stops earlier has none.
  .transform((plan) => ({ ...plan, seniorStreams: CLASS_LEVELS.indexOf(plan.highestClass) >= CLASS_LEVELS.indexOf("11") ? plan.seniorStreams : [] }))
  .superRefine((plan, ctx) => {
    const from = CLASS_LEVELS.indexOf(plan.lowestClass);
    const to = CLASS_LEVELS.indexOf(plan.highestClass);
    if (from > to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["highestClass"], message: "The last class cannot be lower than the first class" });
      return;
    }
    const wanted = plannedClasses(plan.lowestClass, plan.highestClass, plan.seniorStreams).map((c) => c.name);
    const given = plan.classes.map((c) => c.name);
    if (wanted.length !== given.length || wanted.some((name, i) => name !== given[i])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["classes"], message: "Fill in the sections and seats of every class" });
    }
    // The seats of a class add up from its sections: the most a class can hold in all (the same limit the school meets when it edits the class).
    plan.classes.forEach((c, i) => {
      if (c.sections === 0) return;
      if (c.seats > MAX_SECTION_CAPACITY) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["classes", i, "seats"], message: `Up to ${MAX_SECTION_CAPACITY} seats in a section` });
      } else if (c.sections * c.seats > MAX_CLASS_CAPACITY) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["classes", i, "seats"], message: `A class holds up to ${MAX_CLASS_CAPACITY} seats in all` });
      }
    });
    const [usual] = slotProblems(plan.week.usual);
    if (usual) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["week", "usual"], message: usual.message });
    if (plan.week.saturday && plan.week.days.includes(6)) {
      const [saturday] = slotProblems(plan.week.saturday);
      if (saturday) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["week", "saturday"], message: saturday.message });
    }
  })
  // Saturday's own timing only means something when Saturday is a school day.
  .transform((plan) => ({ ...plan, week: { ...plan.week, saturday: plan.week.days.includes(6) ? plan.week.saturday : null } }));

export type MediumPlanInput = z.infer<typeof mediumPlanSchema>;
