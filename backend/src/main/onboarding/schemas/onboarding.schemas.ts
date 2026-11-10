import { z } from "zod";
import {
  BOARDS,
  CLASS_LEVELS,
  DESIGNATIONS,
  INDIAN_STATES,
  MAX_BOARDS,
  MEDIUMS,
  OTHER_CHOICE,
  SCHOOL_TYPES,
  STATE_BOARDS,
  STATE_BOARD_CHOICE,
} from "../../tenants/constants";
import { academicYearInputSchema } from "../../academics/schemas/academicYear.schemas";
import { INDIAN_MOBILE, optional, phoneNumber } from "../../../utils/formFields";
import { mediumPlanSchema } from "./mediumPlan.schemas";

const currentYear = new Date().getFullYear();

/** The ticked values of a multiple choice, each once, in the order the form lists them. */
const inFormOrder =
  <T extends string>(order: readonly T[]) =>
  (picked: T[]) =>
    order.filter((value) => picked.includes(value));

const classIndex = (c: (typeof CLASS_LEVELS)[number]) => CLASS_LEVELS.indexOf(c);

/** One board the school follows, with the medium(s) it is taught in and its own affiliation number. */
const boardEntrySchema = z
  .object({
    board: z.enum(BOARDS, { message: "Choose the board" }),
    // "" and null mean "none": only a "State Board" entry needs one, and only "Other" needs a name.
    stateBoard: optional(z.enum(STATE_BOARDS, { message: "Choose a state board from the list" })),
    otherBoard: optional(z.string().trim().min(2, "Enter the name of the board").max(80)),
    affiliationNumber: optional(z.string().trim().max(50)),
    mediums: z
      .array(z.enum(MEDIUMS, { message: "Choose a medium from the list" }), {
        required_error: "Choose at least one medium",
        invalid_type_error: "Choose at least one medium",
      })
      .min(1, "Choose at least one medium")
      .transform(inFormOrder(MEDIUMS)),
    // Each medium's classes and timing. An empty list is said as "fill them in", like a plan that is missing.
    plans: z.array(mediumPlanSchema).default([]),
  })
  .superRefine((entry, ctx) => {
    if (entry.board === STATE_BOARD_CHOICE && !entry.stateBoard) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stateBoard"], message: "Choose the state board" });
    }
    if (entry.board === OTHER_CHOICE && !entry.otherBoard) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["otherBoard"], message: "Enter the name of the board" });
    }
    // Exactly one plan for each medium the board is taught in.
    const planned = entry.plans.map((p) => p.medium);
    if (entry.mediums.length > 0 && (planned.length !== entry.mediums.length || entry.mediums.some((m) => !planned.includes(m)))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["plans"], message: "Fill in the classes and timing of every medium" });
    }
  })
  // A state board or a board name only means something for its own kind of entry.
  .transform((entry) => ({
    board: entry.board,
    ...(entry.board === STATE_BOARD_CHOICE && entry.stateBoard ? { stateBoard: entry.stateBoard } : {}),
    ...(entry.board === OTHER_CHOICE && entry.otherBoard ? { otherBoard: entry.otherBoard } : {}),
    ...(entry.affiliationNumber ? { affiliationNumber: entry.affiliationNumber } : {}),
    mediums: entry.mediums,
    plans: entry.mediums.flatMap((medium) => entry.plans.filter((p) => p.medium === medium)),
  }));

/** The school itself: what it is, how big, its numbers. */
const schoolShape = {
  schoolName: z.string().trim().min(2, "Enter the school name").max(150),
  schoolType: z.enum(SCHOOL_TYPES, { message: "Choose the type of school" }),
  approxStudents: z.coerce
    .number({ message: "Enter the number of students" })
    .int("Enter a whole number")
    .min(1, "Enter the number of students")
    .max(50000, "That looks too high"),
  udiseCode: optional(z.string().trim().regex(/^\d{11}$/, "UDISE+ code is 11 digits")),
  establishedYear: optional(
    z.coerce
      .number({ message: "Enter a valid year" })
      .int("Enter a valid year")
      .min(1800, "Enter a valid year")
      .max(currentYear, "The year cannot be in the future")
  ),
};

/** Where it is and how to reach it. */
const addressShape = {
  addressLine1: z.string().trim().min(3, "Enter the street address").max(200),
  addressLine2: optional(z.string().trim().max(200)),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.enum(INDIAN_STATES, { message: "Choose the state" }),
  // Not every state has divisions, so it is optional; every place has a district.
  division: optional(z.string().trim().max(80)),
  district: z.string().trim().min(2, "Enter the district").max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, "PIN code is 6 digits"),
  schoolPhone: phoneNumber("Enter a 10-digit phone number"),
  schoolEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  website: optional(z.string().trim().url("Enter a full web address, like https://school.in").max(200)),
};

/** Step 1: the school and where it is: its name, type, size and numbers, its address and how to reach it. */
export const step1Schema = z.object({ ...schoolShape, ...addressShape });

/**
 * Step 2: the academic year (name, first and last day: the school's own dates) and what the school runs in it: every board, with the
 * medium(s) it is taught in, and for each medium its classes, sections, seats and timing. The month the session starts in is read from the
 * year's start date, and the school's first and last class from its mediums, so none can disagree with what was typed.
 */
export const step2Schema = z
  .object({
    academicYear: academicYearInputSchema,
    boards: z
      .array(boardEntrySchema, { required_error: "Add at least one board", invalid_type_error: "Add at least one board" })
      .min(1, "Add at least one board")
      .max(MAX_BOARDS, `A school can list at most ${MAX_BOARDS} boards`),
    // Accepted from older clients but not used: the saved month always comes from the academic year's start date.
    sessionStartMonth: optional(z.coerce.number({ message: "Choose a month" }).int().min(1, "Choose a month").max(12, "Choose a month")),
  })
  .superRefine((d, ctx) => {
    // The same board (the same state board, the same "Other" board) twice is a slip, not a second answer.
    const seen = new Set<string>();
    d.boards.forEach((entry, index) => {
      const detail = entry.stateBoard ?? entry.otherBoard?.toLowerCase() ?? "";
      const key = `${entry.board}|${detail}`;
      if (seen.has(key)) {
        const part = entry.stateBoard ? "stateBoard" : entry.otherBoard ? "otherBoard" : "board";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["boards", index, part],
          message: entry.stateBoard ? "This state board is already added" : "This board is already added",
        });
      }
      seen.add(key);
    });
  })
  .transform((d) => {
    const plans = d.boards.flatMap((entry) => entry.plans);
    const lows = plans.map((p) => classIndex(p.lowestClass));
    const highs = plans.map((p) => classIndex(p.highestClass));
    return {
      ...d,
      sessionStartMonth: d.academicYear.startDate.getUTCMonth() + 1,
      lowestClass: CLASS_LEVELS[Math.min(...lows)],
      highestClass: CLASS_LEVELS[Math.max(...highs)],
    };
  });

/** Step 3: the person registering. They become the school's administrator; "role" is only what they are called in the school. */
export const step3Schema = z
  .object({
    adminName: z.string().trim().min(2, "Enter your full name").max(100),
    designation: z.enum(DESIGNATIONS, { message: "Choose your role in the school" }),
    designationOther: optional(z.string().trim().min(2, "Tell us your role").max(50)),
    mobile: phoneNumber("Enter a 10-digit mobile number", INDIAN_MOBILE),
    alternateMobile: optional(phoneNumber("Enter a 10-digit mobile number", INDIAN_MOBILE)),
  })
  .superRefine((d, ctx) => {
    if (d.designation === OTHER_CHOICE && !d.designationOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["designationOther"], message: "Tell us your role" });
    }
  })
  .transform((d) => ({ ...d, designationOther: d.designation === OTHER_CHOICE ? d.designationOther : undefined }));

/** Step 4: the declaration before submitting. */
export const step4Schema = z.object({
  confirmed: z.literal(true, { message: "Please confirm that the information is correct" }),
});

export const stepParamSchema = z.object({
  step: z.coerce.number().int().min(1).max(4),
});

export type Step1Input = z.infer<typeof step1Schema>;
export type Step2Input = z.infer<typeof step2Schema>;
export type Step3Input = z.infer<typeof step3Schema>;
