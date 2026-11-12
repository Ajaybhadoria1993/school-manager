import { z } from "zod";
import {
  APPLIES_TO,
  CONCESSION_BASES,
  CONCESSION_MODES,
  FEE_FREQUENCIES,
  FEE_KINDS,
  LATE_FINE_MODES,
  MAX_AMOUNT,
  MAX_CLASSES_AT_ONCE,
  MAX_HEADS_AT_ONCE,
  MAX_NAME,
  MAX_NOTE,
  MONTHS_OF,
  type AppliesTo,
  type FeeFrequency,
} from "../constants";

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const objectId = z.string().regex(OBJECT_ID, "Invalid id");
export const idParamSchema = z.object({ id: objectId });

/** A name typed by a person: trimmed, inner spaces collapsed, no angle brackets. */
const label = (what: string, max = MAX_NAME) =>
  z
    .string({ required_error: `Enter the ${what}`, invalid_type_error: `Enter the ${what}` })
    .trim()
    .min(1, `Enter the ${what}`)
    .max(max, `Keep the ${what} under ${max} characters`)
    .regex(/^[^<>]*$/, `The ${what} cannot contain < or >`)
    .transform((v) => v.replace(/\s+/g, " "));

/** An optional note: empty means none. */
const note = z
  .string({ invalid_type_error: "The note must be text" })
  .trim()
  .max(MAX_NOTE, `Keep the note under ${MAX_NOTE} characters`)
  .regex(/^[^<>]*$/, "The note cannot contain < or >")
  .nullish()
  .transform((v) => (v ? v.replace(/\s+/g, " ") : null));

/** Rupees, up to two decimals, above zero and no more than ten lakh (an extra zero typed by mistake is caught). */
export const rupees = z
  .number({ required_error: "Enter the amount", invalid_type_error: "Enter the amount" })
  .positive("Enter an amount above 0")
  .max(MAX_AMOUNT, `The amount cannot be more than ${MAX_AMOUNT.toLocaleString("en-IN")}`)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most two decimals (paise)");

const months = z
  .array(z.number({ invalid_type_error: "Choose the months" }).int("Choose the months").min(1, "Choose the months").max(12, "Choose the months"), { invalid_type_error: "Choose the months" })
  .max(12, "Choose the months");

/** What is wrong with a frequency and the months it falls due in, in words; nothing when it fits. */
export function monthsProblem(frequency: FeeFrequency, dueMonths: readonly number[]): string | null {
  if (new Set(dueMonths).size !== dueMonths.length) return "A month is chosen once";
  const { min, max } = MONTHS_OF[frequency];
  if (frequency === "one_time") return dueMonths.length === 0 ? null : "A one-time fee has no months: it is paid when the child joins";
  if (dueMonths.length >= min && dueMonths.length <= max) return null;
  if (frequency === "monthly") return "Choose the months the fee is charged in (1 to 12)";
  const count: Record<string, string> = { yearly: "1 month", half_yearly: "2 months", quarterly: "4 months" };
  return `Choose ${count[frequency]}: the fee is charged ${frequency === "yearly" ? "once" : frequency === "half_yearly" ? "twice" : "four times"} a year`;
}

/** A one-time fee is only for a child who joins; any other fee is for everyone unless the school said otherwise. */
export function appliesProblem(frequency: FeeFrequency, appliesTo: AppliesTo): string | null {
  return frequency === "one_time" && appliesTo !== "new" ? "A one-time fee is for new students only" : null;
}

const classIds = z
  .array(objectId, { required_error: "Choose at least one class", invalid_type_error: "Choose the classes" })
  .min(1, "Choose at least one class")
  .max(MAX_CLASSES_AT_ONCE, `Choose up to ${MAX_CLASSES_AT_ONCE} classes at a time`)
  .transform((ids) => [...new Set(ids)]);

const status = z.enum(["active", "inactive", "all"]).default("active");

// ---- fee heads ------------------------------------------------------------------------------------------------------------------

const headShape = {
  name: label("name of the fee"),
  kind: z.enum(FEE_KINDS, { message: "Choose what the fee is about" }),
  refundable: z.boolean({ invalid_type_error: "Say yes or no" }).optional(),
  defaultFrequency: z.enum(FEE_FREQUENCIES, { message: "Choose how often it is charged" }).optional(),
  defaultAppliesTo: z.enum(APPLIES_TO, { message: "Choose who pays it" }).optional(),
  defaultOptional: z.boolean({ invalid_type_error: "Say yes or no" }).optional(),
  notes: note,
};

/** A head with the boxes the form leaves out filled in: a one-time fee is for new students, a deposit is refundable. */
function withHeadDefaults<T extends { kind: string; refundable?: boolean; defaultFrequency?: FeeFrequency; defaultAppliesTo?: AppliesTo; defaultOptional?: boolean }>(head: T) {
  const defaultFrequency = head.defaultFrequency ?? (head.kind === "tuition" || head.kind === "transport" || head.kind === "hostel" ? "monthly" : head.kind === "admission" || head.kind === "deposit" ? "one_time" : "yearly");
  return {
    ...head,
    refundable: head.refundable ?? head.kind === "deposit",
    defaultFrequency,
    defaultAppliesTo: defaultFrequency === "one_time" ? ("new" as const) : (head.defaultAppliesTo ?? "all"),
    defaultOptional: head.defaultOptional ?? (head.kind === "transport" || head.kind === "hostel" || head.kind === "supplies"),
  };
}

const oneHead = z
  .object(headShape)
  .superRefine((head, ctx) => {
    const problem = head.defaultFrequency && head.defaultAppliesTo ? appliesProblem(head.defaultFrequency, head.defaultAppliesTo) : null;
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultAppliesTo"], message: problem });
  })
  .transform(withHeadDefaults);
export const createHeadSchema = oneHead;
export type HeadInput = z.output<typeof oneHead>;

export const createHeadsSchema = z.object({
  heads: z
    .array(oneHead, { required_error: "Choose the fees to add", invalid_type_error: "Choose the fees to add" })
    .min(1, "Choose the fees to add")
    .max(MAX_HEADS_AT_ONCE, `Add up to ${MAX_HEADS_AT_ONCE} fees at a time`),
});

export const updateHeadSchema = z
  .object({
    name: headShape.name.optional(),
    kind: headShape.kind.optional(),
    refundable: headShape.refundable,
    defaultFrequency: headShape.defaultFrequency,
    defaultAppliesTo: headShape.defaultAppliesTo,
    defaultOptional: headShape.defaultOptional,
    notes: z.string().trim().max(MAX_NOTE).regex(/^[^<>]*$/, "The note cannot contain < or >").nullish().transform((v) => (v === undefined ? undefined : v ? v.replace(/\s+/g, " ") : null)),
    isActive: z.boolean({ invalid_type_error: "Say yes or no" }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Send something to change");
export type HeadUpdate = z.output<typeof updateHeadSchema>;

export const listHeadsQuerySchema = z.object({ status });

// ---- the fee chart --------------------------------------------------------------------------------------------------------------

/** The session a screen means: the running one when it says nothing, or the school's upcoming (not started yet) one. */
const yearId = objectId.optional();

export const structureQuerySchema = z.object({ yearId });

const lineShape = {
  amount: rupees,
  frequency: z.enum(FEE_FREQUENCIES, { message: "Choose how often it is charged" }),
  dueMonths: months.optional(),
  appliesTo: z.enum(APPLIES_TO, { message: "Choose who pays it" }).optional(),
  optional: z.boolean({ invalid_type_error: "Say yes or no" }).optional(),
  notes: note,
};

export const createLinesSchema = z
  .object({ yearId, classIds, headId: objectId, ...lineShape })
  .superRefine((line, ctx) => {
    const applies = line.appliesTo ?? (line.frequency === "one_time" ? "new" : "all");
    const problem = appliesProblem(line.frequency, applies);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["appliesTo"], message: problem });
    if (line.dueMonths) {
      const months = monthsProblem(line.frequency, line.dueMonths);
      if (months) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueMonths"], message: months });
    }
  })
  .transform((line) => ({ ...line, appliesTo: line.appliesTo ?? (line.frequency === "one_time" ? ("new" as const) : ("all" as const)), optional: line.optional ?? false }));
export type CreateLinesInput = z.output<typeof createLinesSchema>;

export const updateLineSchema = z
  .object({
    amount: lineShape.amount.optional(),
    frequency: lineShape.frequency.optional(),
    dueMonths: lineShape.dueMonths,
    appliesTo: lineShape.appliesTo,
    optional: lineShape.optional,
    notes: z.string().trim().max(MAX_NOTE).regex(/^[^<>]*$/, "The note cannot contain < or >").nullish().transform((v) => (v === undefined ? undefined : v ? v.replace(/\s+/g, " ") : null)),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Send something to change");
export type UpdateLineInput = z.output<typeof updateLineSchema>;

export const copyClassSchema = z.object({
  yearId,
  fromClassId: objectId,
  toClassIds: classIds,
  /** A fee the other class already has is changed to this class's (otherwise it is left as it is). */
  replace: z.boolean({ invalid_type_error: "Say yes or no" }).default(false),
});
export type CopyClassInput = z.output<typeof copyClassSchema>;

export const copyYearSchema = z.object({
  yearId,
  /** Added to every amount copied (0 = the same fees). */
  raisePercent: z.number({ invalid_type_error: "Enter the percentage" }).min(0, "The percentage cannot be below 0").max(100, "The percentage cannot be above 100").default(0),
});
export type CopyYearInput = z.output<typeof copyYearSchema>;

// ---- concessions ----------------------------------------------------------------------------------------------------------------

const concessionShape = {
  name: label("name of the concession"),
  basis: z.enum(CONCESSION_BASES, { message: "Choose why it is given" }),
  mode: z.enum(CONCESSION_MODES, { message: "Choose a percentage or an amount" }),
  value: z.number({ required_error: "Enter the value", invalid_type_error: "Enter the value" }).positive("Enter a value above 0").max(MAX_AMOUNT, "That is too much"),
  appliesTo: z.enum(["all", "selected"], { message: "Choose the fees it takes off" }).default("all"),
  headIds: z.array(objectId, { invalid_type_error: "Choose the fees" }).max(MAX_HEADS_AT_ONCE).default([]),
  needsApproval: z.boolean({ invalid_type_error: "Say yes or no" }).default(true),
  notes: note,
};

type ConcessionShape = { mode: "percent" | "flat"; value: number; appliesTo: "all" | "selected"; headIds: string[] };
const concessionProblems = (c: ConcessionShape, ctx: z.RefinementCtx) => {
  if (c.mode === "percent" && c.value > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "A percentage cannot be more than 100" });
  if (c.mode === "percent" && Math.abs(c.value * 100 - Math.round(c.value * 100)) > 1e-6) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Use at most two decimals" });
  if (c.appliesTo === "selected" && c.headIds.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headIds"], message: "Choose the fees it takes off" });
};

export const createConcessionSchema = z.object(concessionShape).superRefine(concessionProblems).transform((c) => ({ ...c, headIds: c.appliesTo === "selected" ? [...new Set(c.headIds)] : [] }));
export type ConcessionInput = z.output<typeof createConcessionSchema>;

export const updateConcessionSchema = z
  .object({
    name: concessionShape.name.optional(),
    basis: concessionShape.basis.optional(),
    mode: concessionShape.mode.optional(),
    value: concessionShape.value.optional(),
    appliesTo: z.enum(["all", "selected"], { message: "Choose the fees it takes off" }).optional(),
    headIds: z.array(objectId, { invalid_type_error: "Choose the fees" }).max(MAX_HEADS_AT_ONCE).optional(),
    needsApproval: z.boolean({ invalid_type_error: "Say yes or no" }).optional(),
    notes: z.string().trim().max(MAX_NOTE).regex(/^[^<>]*$/, "The note cannot contain < or >").nullish().transform((v) => (v === undefined ? undefined : v ? v.replace(/\s+/g, " ") : null)),
    isActive: z.boolean({ invalid_type_error: "Say yes or no" }).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Send something to change");
export type ConcessionUpdate = z.output<typeof updateConcessionSchema>;
export const listConcessionsQuerySchema = z.object({ status });

// ---- rules ----------------------------------------------------------------------------------------------------------------------

export const feeRulesSchema = z
  .object({
    dueDay: z.number({ required_error: "Enter the due day", invalid_type_error: "Enter the due day" }).int("Enter a whole day").min(1, "The due day is 1 to 28").max(28, "The due day is 1 to 28"),
    graceDays: z.number({ invalid_type_error: "Enter the days" }).int("Enter whole days").min(0, "Enter 0 or more days").max(30, "Grace is up to 30 days"),
    lateFine: z.object({
      mode: z.enum(LATE_FINE_MODES, { message: "Choose how a late payment is charged" }),
      amount: z.number({ invalid_type_error: "Enter the amount" }).min(0, "The amount cannot be below 0").max(MAX_AMOUNT, "That is too much"),
      maxAmount: z.number({ invalid_type_error: "Enter the most a family pays" }).min(0, "The limit cannot be below 0").max(MAX_AMOUNT, "That is too much").nullable(),
    }),
    allowPartial: z.boolean({ invalid_type_error: "Say yes or no" }),
    holdReportCard: z.boolean({ invalid_type_error: "Say yes or no" }),
    holdCertificate: z.boolean({ invalid_type_error: "Say yes or no" }),
  })
  .superRefine((rules, ctx) => {
    const fine = rules.lateFine;
    if (fine.mode !== "none" && fine.amount <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lateFine", "amount"], message: fine.mode === "percent_per_month" ? "Enter the percentage" : "Enter the fine" });
    if (fine.mode === "percent_per_month" && fine.amount > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lateFine", "amount"], message: "A percentage cannot be more than 100" });
  })
  .transform((rules) => ({ ...rules, lateFine: rules.lateFine.mode === "none" ? { mode: "none" as const, amount: 0, maxAmount: null } : rules.lateFine }));
export type FeeRulesInput = z.output<typeof feeRulesSchema>;
