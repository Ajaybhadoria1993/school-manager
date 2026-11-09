import { DEFAULT_SETUP, generateDay, setupFromSlots, setupProblems, slotProblems, type DaySetup } from "./timings";
import type { Schedule, SchoolDayInput, Slot } from "../types";

/**
 * The school's week as a head thinks of it: one usual day (when school starts, how long a period is, how many, the lunch) and, for each
 * day of the week, whether it is that usual day, a day of its own (a short Saturday) or a holiday. It is read from the school's timings
 * for all classes and sent back as the rows of every day that has school (`PUT /timetable/school-day`), where the days that are the same
 * become one timing again. Timings made for some classes only are not part of it.
 */

export type DayMode = "usual" | "own" | "off";

export interface DayPlan {
  mode: DayMode;
  /** The day's own numbers, used when `mode` is "own" (a day that becomes "own" starts from a copy of the usual day). */
  setup: DaySetup;
}

export interface WeekPlan {
  usual: DaySetup;
  /** 1 = Monday ... 7 = Sunday. */
  days: Record<number, DayPlan>;
}

export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const copy = (setup: DaySetup): DaySetup => ({ ...setup });
const sameRows = (a: readonly Slot[], b: readonly Slot[]) => a.length === b.length && a.every((s, i) => s.kind === b[i].kind && s.start === b[i].start && s.end === b[i].end);

const copyPlan = (plan: WeekPlan): WeekPlan => ({ usual: copy(plan.usual), days: Object.fromEntries(WEEK_DAYS.map((d) => [d, { mode: plan.days[d].mode, setup: copy(plan.days[d].setup) }])) });

/**
 * The week from the school's timings: of the whole school (no `departmentId`), or of one department. The timing with the most days is
 * the usual day; a day another one covers is a day of its own; a day none covers (or a department's holiday, a timing with no rows) is a
 * holiday. A school with no timing yet starts at the usual numbers, Monday to Saturday; a department with no timing of its own starts
 * from the school's week (`schoolPlan`), so only what differs has to be changed. `handMade` names the timings whose rows were changed by
 * hand (saving here makes them again from their numbers).
 */
export function readWeek(schedules: readonly Schedule[], departmentId: string | null = null, schoolPlan?: WeekPlan): { plan: WeekPlan; isNew: boolean; handMade: string[] } {
  const mine = schedules.filter((s) => (departmentId ? s.departmentId === departmentId : s.scope === "all"));
  const working = mine.filter((s) => s.slots.some((slot) => slot.kind === "period"));
  if (working.length === 0) {
    if (departmentId && schoolPlan) return { plan: copyPlan(schoolPlan), isNew: true, handMade: [] };
    const usual = copy(DEFAULT_SETUP);
    const days: Record<number, DayPlan> = {};
    for (const d of WEEK_DAYS) days[d] = { mode: d === 7 ? "off" : "usual", setup: copy(usual) };
    return { plan: { usual, days }, isNew: true, handMade: [] };
  }
  // The server lists the oldest first, so a tie keeps the oldest as the usual day.
  const main = working.reduce((best, s) => (s.days.length > best.days.length ? s : best), working[0]);
  const usual = setupFromSlots(main.slots);
  const days: Record<number, DayPlan> = {};
  for (const d of WEEK_DAYS) {
    const timing = working.find((s) => s.days.includes(d));
    if (!timing) days[d] = { mode: "off", setup: copy(usual) };
    else if (timing === main) days[d] = { mode: "usual", setup: copy(usual) };
    else days[d] = { mode: "own", setup: setupFromSlots(timing.slots) };
  }
  const handMade = working.filter((s) => !sameRows(generateDay(setupFromSlots(s.slots)).slots, s.slots)).map((s) => s.name);
  return { plan: { usual, days }, isNew: false, handMade };
}

/** The numbers a day of the week follows, or null for a holiday. */
export function setupOf(plan: WeekPlan, day: number): DaySetup | null {
  const d = plan.days[day];
  if (!d || d.mode === "off") return null;
  return d.mode === "usual" ? plan.usual : d.setup;
}

/**
 * What is sent: the rows of every day that has school, made from its numbers. For the whole school a holiday is left out; a department's
 * week names every day, a holiday with no rows (left out, the day would follow the school's timing).
 */
export function weekBody(plan: WeekPlan, departmentId: string | null = null): SchoolDayInput {
  const days = WEEK_DAYS.flatMap((day) => {
    const setup = setupOf(plan, day);
    if (setup) return [{ day, slots: generateDay(setup).slots }];
    return departmentId ? [{ day, slots: [] }] : [];
  });
  return departmentId ? { departmentId, days } : { days };
}

export interface WeekProblem {
  /** "usual" for the usual day, a day number for a day of its own, "week" for the week as a whole. */
  where: "usual" | "week" | number;
  message: string;
}

/** The first thing wrong with a day's numbers: the lunch and the short break first, then what the rows made from them would be refused for. */
const firstProblem = (setup: DaySetup): string | undefined => setupProblems(setup)[0] ?? slotProblems(generateDay(setup).slots)[0]?.message;

/** What the server would refuse, said before anything is sent: no day with school, or a day whose numbers do not make a day. */
export function weekProblems(plan: WeekPlan): WeekProblem[] {
  const found: WeekProblem[] = [];
  const modes = WEEK_DAYS.map((d) => plan.days[d]?.mode ?? "off");
  if (modes.every((m) => m === "off")) return [{ where: "week", message: "Keep at least one day with school" }];
  if (modes.includes("usual")) {
    const first = firstProblem(plan.usual);
    if (first) found.push({ where: "usual", message: first });
  }
  for (const d of WEEK_DAYS) {
    if (plan.days[d]?.mode !== "own") continue;
    const first = firstProblem(plan.days[d].setup);
    if (first) found.push({ where: d, message: first });
  }
  return found;
}

/** "08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00": a day in a few words. */
export function daySummary(setup: DaySetup): string {
  const { slots } = generateDay(setup);
  const periods = slots.filter((s) => s.kind === "period").length;
  const lunch = slots.find((s) => s.kind === "lunch");
  const rest = slots.find((s) => s.kind === "break" && s.label === "Short break" && s.start === setup.breakStart);
  if (slots.length === 0) return "No periods";
  return [
    `${slots[0].start} to ${slots[slots.length - 1].end}`,
    `${periods} period${periods === 1 ? "" : "s"}`,
    lunch ? `lunch ${lunch.start} to ${lunch.end}` : "no lunch",
    rest ? `short break ${rest.start} to ${rest.end}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
