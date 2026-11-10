import { CLASS_LEVELS, MAX_SENIOR_STREAMS, MAX_STREAM_NAME, boardLabel, formatClassRange } from "../constants/schoolOptions";
import type { BoardDraft, BoardEntry, MediumPlan, MediumPlanDraft, PlanClass } from "../types";
import { DEFAULT_SETUP, daysLabel, describeDay, generateDay, setupFromSlots, setupProblems, slotProblems, type DaySetup } from "./timings";

/**
 * Onboarding asks each medium of each board for its own classes (with sections and seats, and a class per stream in 11 and 12) and its own
 * timing, which is what the school is built from when it is approved. The server checks the same things (onboarding/schemas/mediumPlan).
 */

const FIRST_DAYS = [1, 2, 3, 4, 5, 6];
const FIRST_SECTIONS = 1;
const FIRST_SEATS = 40;
/** A class starts with up to one section for each letter A to Z; a section holds up to 200 seats and a class up to 2000 in all (the server checks the same). */
export const MAX_SECTIONS = 26;
export const MAX_SEATS = 200;
export const MAX_CLASS_SEATS = 2000;

const levelIndex = (level: string) => CLASS_LEVELS.indexOf(level as (typeof CLASS_LEVELS)[number]);
const classNameOf = (level: string) => (Number.isNaN(Number(level)) ? level : `Class ${level}`);

/** The classes of a range, in teaching order; nothing until both ends are chosen, or for a range that runs backwards. */
export function plannedClassNames(lowest: string, highest: string, streams: readonly string[]): string[] {
  const from = levelIndex(lowest);
  const to = levelIndex(highest);
  if (from < 0 || to < from) return [];
  return CLASS_LEVELS.slice(from, to + 1).flatMap((level) => (streams.length > 0 && (level === "11" || level === "12") ? streams.map((s) => `${classNameOf(level)} ${s}`) : [classNameOf(level)]));
}

/** Streams only mean something for a range that reaches Class 11. */
export const hasSeniorClasses = (highest: string) => levelIndex(highest) >= levelIndex("11");

export const emptyPlan = (medium: string): MediumPlanDraft => ({ medium, lowestClass: "", highestClass: "", seniorStreams: [], classes: [], days: [...FIRST_DAYS], usual: { ...DEFAULT_SETUP }, saturday: null });

/** The rows of the plan's classes as they are now: what was typed for a class that is still there is kept. */
function withRows(plan: MediumPlanDraft): MediumPlanDraft {
  const typed = new Map(plan.classes.map((c) => [c.name, c]));
  return { ...plan, classes: plannedClassNames(plan.lowestClass, plan.highestClass, plan.seniorStreams).map((name) => typed.get(name) ?? { name, sections: FIRST_SECTIONS, seats: FIRST_SEATS }) };
}

export function setClassRange(plan: MediumPlanDraft, lowestClass: string, highestClass: string): MediumPlanDraft {
  return withRows({ ...plan, lowestClass, highestClass, seniorStreams: hasSeniorClasses(highestClass) ? plan.seniorStreams : [] });
}

export const setStreams = (plan: MediumPlanDraft, seniorStreams: string[]): MediumPlanDraft => withRows({ ...plan, seniorStreams });

/** A stream's name as it is kept: trimmed, one space between words. */
export const cleanStreamName = (name: string) => name.trim().replace(/\s+/g, " ");

/** Why a name cannot be added as a stream (the words under the box), or null when it can. `existing` are the streams the medium already has. */
export function streamProblem(name: string, existing: readonly string[]): string | null {
  const clean = cleanStreamName(name);
  if (clean.length < 2) return "Name the stream.";
  if (clean.length > MAX_STREAM_NAME) return `A stream's name is up to ${MAX_STREAM_NAME} letters.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 &.,'()/+-]*$/.test(clean)) return "Use letters and numbers in a stream's name.";
  const same = existing.find((s) => s.toLowerCase() === clean.toLowerCase());
  if (same) return `${same} is already there.`;
  if (existing.length >= MAX_SENIOR_STREAMS) return `A medium can run up to ${MAX_SENIOR_STREAMS} streams.`;
  return null;
}

/** One more stream, as a class of its own in 11 and 12. A name that cannot be added changes nothing (the plan itself comes back). */
export const addStream = (plan: MediumPlanDraft, name: string): MediumPlanDraft =>
  streamProblem(name, plan.seniorStreams) ? plan : setStreams(plan, [...plan.seniorStreams, cleanStreamName(name)]);

export const removeStream = (plan: MediumPlanDraft, name: string): MediumPlanDraft =>
  setStreams(plan, plan.seniorStreams.filter((s) => s.toLowerCase() !== name.toLowerCase()));

/** The seats of a class in all: its sections times their seats, or its own seats when it has no sections. */
export const classSeats = (row: PlanClass) => (row.sections > 0 ? row.sections * row.seats : row.seats);

/** The classes, the sections and the seats of a whole plan, added up. */
export const planTotals = (plan: MediumPlanDraft) => ({
  classes: plan.classes.length,
  sections: plan.classes.reduce((n, c) => n + c.sections, 0),
  seats: plan.classes.reduce((n, c) => n + classSeats(c), 0),
});

/** The same sections, or the same seats, for every class. */
export const setAllClasses = (plan: MediumPlanDraft, values: { sections?: number; seats?: number }): MediumPlanDraft => ({ ...plan, classes: plan.classes.map((c) => ({ ...c, ...values })) });

/** Another medium's answers, as a start to change from. A copy: changing one never changes the other. */
export const copyPlan = (from: MediumPlanDraft, medium: string): MediumPlanDraft => ({
  ...from,
  medium,
  seniorStreams: [...from.seniorStreams],
  classes: from.classes.map((c) => ({ ...c })),
  days: [...from.days],
  usual: { ...from.usual },
  saturday: from.saturday ? { ...from.saturday } : null,
});

/** One plan for each medium of the board, in the same order: the ones already filled in are kept, a new medium starts empty. */
export const syncPlans = (plans: readonly MediumPlanDraft[], mediums: readonly string[]): MediumPlanDraft[] => mediums.map((medium) => plans.find((p) => p.medium === medium) ?? emptyPlan(medium));

function dayProblem(setup: DaySetup): string | null {
  return setupProblems(setup)[0] ?? slotProblems(generateDay(setup).slots)[0]?.message ?? null;
}

/** What is wrong with a plan, by the name of the box it is about (`prefix` is "boards.0.plans.1"). */
export function planErrors(plan: MediumPlanDraft, prefix: string): Record<string, string> {
  const found: Record<string, string> = {};
  if (!plan.lowestClass) found[`${prefix}.lowestClass`] = "Choose the first class.";
  if (!plan.highestClass) found[`${prefix}.highestClass`] = "Choose the last class.";
  if (plan.lowestClass && plan.highestClass && levelIndex(plan.lowestClass) > levelIndex(plan.highestClass)) found[`${prefix}.highestClass`] = "The last class cannot be lower than the first class.";
  if (plan.seniorStreams.length > MAX_SENIOR_STREAMS) found[`${prefix}.seniorStreams`] = `A medium can run up to ${MAX_SENIOR_STREAMS} streams.`;
  plan.classes.forEach((c, i) => {
    if (!Number.isInteger(c.sections) || c.sections < 0 || c.sections > MAX_SECTIONS) found[`${prefix}.classes.${i}.sections`] = `Up to ${MAX_SECTIONS}`;
    const seats = `${prefix}.classes.${i}.seats`;
    if (!Number.isInteger(c.seats) || c.seats < 1) found[seats] = "Enter the seats";
    else if (c.sections === 0 && c.seats > MAX_CLASS_SEATS) found[seats] = `Up to ${MAX_CLASS_SEATS} seats`;
    else if (c.sections > 0 && c.seats > MAX_SEATS) found[seats] = `Up to ${MAX_SEATS} seats in a section`;
    else if (c.sections > 0 && c.sections * c.seats > MAX_CLASS_SEATS) found[seats] = `A class holds up to ${MAX_CLASS_SEATS} seats in all`;
  });
  if (plan.days.length === 0) found[`${prefix}.week.days`] = "Choose the days school is open.";
  const usual = dayProblem(plan.usual);
  if (usual) found[`${prefix}.week.usual`] = usual;
  if (plan.saturday && plan.days.includes(6)) {
    const saturday = dayProblem(plan.saturday);
    if (saturday) found[`${prefix}.week.saturday`] = saturday;
  }
  return found;
}

export const planToApi = (plan: MediumPlanDraft): MediumPlan => ({
  medium: plan.medium,
  lowestClass: plan.lowestClass,
  highestClass: plan.highestClass,
  seniorStreams: plan.seniorStreams,
  classes: plan.classes,
  week: { days: plan.days, usual: generateDay(plan.usual).slots, saturday: plan.saturday && plan.days.includes(6) ? generateDay(plan.saturday).slots : null },
});

export const planFromApi = (plan: MediumPlan): MediumPlanDraft => ({
  medium: plan.medium,
  lowestClass: plan.lowestClass,
  highestClass: plan.highestClass,
  seniorStreams: [...plan.seniorStreams],
  classes: plan.classes.map((c) => ({ ...c })),
  days: [...plan.week.days],
  usual: setupFromSlots(plan.week.usual),
  saturday: plan.week.saturday ? setupFromSlots(plan.week.saturday) : null,
});

/** A saved board as the form holds it. A board saved before plans existed starts with an empty plan for each medium. */
export const boardFromApi = (entry: BoardEntry): BoardDraft => ({ ...entry, plans: syncPlans((entry.plans ?? []).map(planFromApi), entry.mediums) });

export const boardToApi = (entry: BoardDraft): BoardEntry => ({ ...entry, plans: entry.plans.map(planToApi) });

/** "1 to 7 · 08:00 to 14:00 · Mon to Sat": a medium in one line, for the screens that read it back. */
export function planSummary(plan: MediumPlan): string {
  const { start, end } = describeDay(plan.week.usual);
  return [formatClassRange(plan.lowestClass, plan.highestClass), start && end ? `${start} to ${end}` : "", daysLabel(plan.week.days)].filter(Boolean).join(" · ");
}

/** Every medium of the school in one line each: what a screen that reads the form back shows. */
export function planLines(boards: readonly BoardEntry[]): { label: string; summary: string }[] {
  return boards.flatMap((entry) => (entry.plans ?? []).map((plan) => ({ label: `${boards.length > 1 ? `${boardLabel(entry)} · ` : ""}${plan.medium} Medium`, summary: planSummary(plan) })));
}
