import { DAY_NAMES, SUBJECT_COLORS } from "../constants/timetable";
import type { GridAllotment, GridCell, GridDay, GridTeacher, GridView, Lesson } from "../types";

/**
 * A class's weekly timetable as the screen works on it: the grid as lessons by day and period, the placing of a subject (a double
 * period takes two periods in a row, a choice puts all its subjects side by side) and what is wrong with a period that can be said
 * without asking the server (a teacher who does not come that day, a teacher or room busy in another class). The server checks all of it
 * again when the timetable is saved (backend checker.ts): this is only so a mistake shows the moment it is made.
 */

export const cellKey = (day: number, period: number) => `${day}:${period}`;

/** How far a subject picked in a Pre-Primary class goes: that period of every day, half of that day, or the whole of that day. */
export type Spread = "week" | "half" | "day";

/** A department called Pre-Primary, however it is written: its classes have a mother teacher and may give a whole day to one subject. */
export const isPrePrimaryName = (name: string): boolean => name.toLowerCase().replace(/[^a-z]/g, "") === "preprimary";

/** What the screen knows of the class and the school, indexed. */
export interface GridModel {
  days: GridDay[];
  allotments: Map<string, GridAllotment>;
  teachers: Map<string, GridTeacher>;
  busy: GridView["busy"];
  load: Map<string, { perDay: Record<string, number>; week: number }>;
}

export function buildModel(view: GridView): GridModel {
  return {
    days: view.days,
    allotments: new Map(view.allotments.map((a) => [a.subjectId, a])),
    teachers: new Map(view.teachers.map((t) => [t.id, t])),
    busy: view.busy,
    load: new Map(view.load.map((l) => [l.teacherId, { perDay: l.perDay, week: l.week }])),
  };
}

/** The teacher of a lesson: the one it names, or the one the class's subject list names. */
export function teacherOf(model: GridModel, lesson: Lesson): string | null {
  return lesson.teacherId ?? model.allotments.get(lesson.subjectId)?.teacherId ?? null;
}

const sorted = (cells: GridCell[]) => [...cells].sort((a, b) => a.day - b.day || a.period - b.period);

/** How many periods each subject has in the grid. */
export function placedCounts(cells: readonly GridCell[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cell of cells) for (const lesson of cell.lessons) counts.set(lesson.subjectId, (counts.get(lesson.subjectId) ?? 0) + 1);
  return counts;
}

export const cellAt = (cells: readonly GridCell[], day: number, period: number) => cells.find((c) => c.day === day && c.period === period);

/**
 * When the class's day ends, day by day: the end of the last period that has a lesson (the class is there for as many periods as it has
 * lessons that day, nobody sets an end time). Null for a day with no lesson. It reads the lessons given now, so it follows a change before
 * it is saved; a lesson in a period the day does not have counts for nothing.
 */
export function dayEnds(view: Pick<GridView, "days">, cells: readonly GridCell[]): Map<number, string | null> {
  const ends = new Map<number, string | null>();
  for (const day of view.days) {
    let last: { period: number; end: string } | null = null;
    for (const cell of cells) {
      if (cell.day !== day.day || cell.lessons.length === 0) continue;
      const slot = day.slots.find((s) => s.period === cell.period);
      if (slot?.period != null && (!last || slot.period > last.period)) last = { period: slot.period, end: slot.end };
    }
    ends.set(day.day, last?.end ?? null);
  }
  return ends;
}

/** The periods of a day, in order, with where each is in the day's rows. */
function periodRows(day: GridDay | undefined) {
  const out: { period: number; index: number }[] = [];
  day?.slots.forEach((slot, index) => {
    if (slot.period !== null) out.push({ period: slot.period, index });
  });
  return out;
}

/**
 * The `size` periods in a row from `period` on one day: each starting where the one before ends (a break or the lunch between two
 * periods ends the row). Fewer than `size` when the row ends early; none when the day has no such period.
 */
export function periodsInARow(model: GridModel, day: number, period: number, size: number): number[] {
  const view = model.days.find((d) => d.day === day);
  const rows = periodRows(view);
  const start = rows.findIndex((r) => r.period === period);
  if (!view || start < 0) return [];
  const run = [rows[start].period];
  for (let i = start + 1; i < rows.length && run.length < size; i += 1) {
    const before = view.slots[rows[i - 1].index];
    const now = view.slots[rows[i].index];
    if (before.end !== now.start) break;
    run.push(rows[i].period);
  }
  return run;
}

/** The subjects taught side by side with this one (a choice), this one included; just this one when it is not part of a choice. */
export function choiceOf(model: GridModel, subjectId: string): GridAllotment[] {
  const subject = model.allotments.get(subjectId);
  if (!subject) return [];
  if (!subject.group) return [subject];
  const group = subject.group.toLowerCase();
  return [...model.allotments.values()].filter((a) => a.group?.toLowerCase() === group);
}

/** The lessons of a period for these subjects: each with no teacher of its own, or the mother teacher when the subject has no usual one. */
const lessonsOf = (members: readonly GridAllotment[], mother: string | null): Lesson[] => members.map((m) => ({ subjectId: m.subjectId, teacherId: m.teacherId ? null : mother, room: null }));

export interface Placing {
  cells: GridCell[];
  /** How many periods were filled. */
  placed: number;
  /** Said to the person when the subject did not get all the periods it asked for. */
  note: string | null;
}

/**
 * Puts a subject in a period: and, for a subject given in double (or triple) periods, in the periods in a row after it; for a choice,
 * every subject of the choice together. A lesson already in a period is replaced. A subject put on a period that already has exactly
 * that subject takes it off again (a second click undoes the first). With a `mother` teacher (a Pre-Primary class), a subject that has no
 * usual teacher of its own gets her.
 */
export function placeSubject(model: GridModel, cells: readonly GridCell[], subjectId: string, day: number, period: number, mother: string | null = null): Placing {
  const subject = model.allotments.get(subjectId);
  if (!subject) return { cells: [...cells], placed: 0, note: null };
  const here = cellAt(cells, day, period);
  if (here && here.lessons.length === 1 && here.lessons[0].subjectId === subjectId) {
    return { cells: sorted(cells.filter((c) => c !== here)), placed: 0, note: null };
  }
  const members = choiceOf(model, subjectId);
  const targets = periodsInARow(model, day, period, subject.blockSize);
  if (targets.length === 0) return { cells: [...cells], placed: 0, note: null };

  const next = cells.filter((c) => !(c.day === day && targets.includes(c.period)));
  for (const p of targets) next.push({ day, period: p, lessons: lessonsOf(members, mother) });
  const note = targets.length < subject.blockSize ? `${subject.subjectName} is meant for ${subject.blockSize} periods in a row, but only ${targets.length} fit here.` : null;
  return { cells: sorted(next), placed: targets.length, note };
}

/**
 * A subject picked for a period (2026-11-10): an empty period gets it, and so does that period of every other day that is still empty, so
 * a subject taught daily at one time is one click; a day is then changed by clicking it. A period that already has a lesson changes alone.
 * Nothing is overwritten and no clash is made: a day whose usual teacher cannot take the period (does not come, or is in another class
 * then) stays empty and is named in `note`, a day without that period is passed over, and double periods need all their periods free.
 */
export function placeAcrossWeek(model: GridModel, cells: readonly GridCell[], subjectId: string, day: number, period: number, mother: string | null = null): Placing {
  const first = placeSubject(model, cells, subjectId, day, period, mother);
  const subject = model.allotments.get(subjectId);
  if (!subject || first.placed === 0 || cellAt(cells, day, period)) return first;
  const members = choiceOf(model, subjectId);
  let next = first.cells;
  let placed = first.placed;
  const leftOut: string[] = [];
  for (const other of model.days) {
    if (other.day === day) continue;
    const targets = periodsInARow(model, other.day, period, subject.blockSize);
    if (targets.length < subject.blockSize || targets.some((p) => cellAt(next, other.day, p))) continue;
    if (targets.some((p) => members.some((m) => teacherTrouble(model, m.teacherId ?? mother, other.day, p)))) {
      leftOut.push(DAY_NAMES[other.day]);
      continue;
    }
    const placing = placeSubject(model, next, subjectId, other.day, period, mother);
    next = placing.cells;
    placed += placing.placed;
  }
  const left = leftOut.length > 0 ? `${subject.subjectName} is not on ${leftOut.join(", ")}: its teacher cannot take that period.` : null;
  return { cells: next, placed, note: [first.note, left].filter(Boolean).join(" ") || null };
}

/**
 * A whole day of one subject (a Pre-Primary class, 2026-11-10: "ek din me ek hi cheez"): every period of that day gets it, in place of
 * what was there; the other days are left as they are. A choice puts all its subjects; the mother teacher goes on a subject with no usual
 * teacher of its own.
 */
export function placeWholeDay(model: GridModel, cells: readonly GridCell[], subjectId: string, day: number, mother: string | null): Placing {
  const subject = model.allotments.get(subjectId);
  const periods = periodRows(model.days.find((d) => d.day === day)).map((r) => r.period);
  if (!subject || periods.length === 0) return { cells: [...cells], placed: 0, note: null };
  const members = choiceOf(model, subjectId);
  const next = cells.filter((c) => c.day !== day);
  for (const p of periods) next.push({ day, period: p, lessons: lessonsOf(members, mother) });
  return { cells: sorted(next), placed: periods.length, note: null };
}

/**
 * The periods on the same side of the lunch as `period` on that day (a Pre-Primary day may be two things: one before the lunch, one after).
 * A day with no lunch is cut in the middle, the bigger half first. None for a day or a period the class does not have.
 */
export function halfOf(model: GridModel, day: number, period: number): number[] {
  const view = model.days.find((d) => d.day === day);
  const rows = periodRows(view);
  const at = rows.findIndex((r) => r.period === period);
  if (!view || at < 0) return [];
  const lunch = view.slots.findIndex((s) => s.kind === "lunch");
  if (lunch >= 0) {
    const before = rows[at].index < lunch;
    return rows.filter((r) => r.index < lunch === before).map((r) => r.period);
  }
  const first = Math.ceil(rows.length / 2);
  return (at < first ? rows.slice(0, first) : rows.slice(first)).map((r) => r.period);
}

/**
 * Half a day of one subject (a Pre-Primary class, 2026-11-13: a day may be one thing, or two, one before the lunch and one after): every
 * period of that half gets it, in place of what was there; the other half and the other days are left as they are. A choice puts all its
 * subjects; the mother teacher goes on a subject with no usual teacher of its own.
 */
export function placeHalfDay(model: GridModel, cells: readonly GridCell[], subjectId: string, day: number, period: number, mother: string | null): Placing {
  const subject = model.allotments.get(subjectId);
  const periods = halfOf(model, day, period);
  if (!subject || periods.length === 0) return { cells: [...cells], placed: 0, note: null };
  const members = choiceOf(model, subjectId);
  const next = cells.filter((c) => !(c.day === day && periods.includes(c.period)));
  for (const p of periods) next.push({ day, period: p, lessons: lessonsOf(members, mother) });
  return { cells: sorted(next), placed: periods.length, note: null };
}

/**
 * A teacher chosen in the box of a period for the subject there (null: no teacher): for that period only (`period`), for that subject's
 * periods in the same half of the day (`half`) or in the whole day (`day`). Other subjects and other days are left as they are.
 */
export function teacherOnRange(model: GridModel, cells: readonly GridCell[], day: number, period: number, subjectId: string, teacherId: string | null, range: "period" | "half" | "day"): GridCell[] {
  const periods = range === "period" ? [period] : range === "half" ? halfOf(model, day, period) : null;
  return cells.map((c) => {
    if (c.day !== day || (periods && !periods.includes(c.period))) return c;
    return { ...c, lessons: c.lessons.map((l) => (l.subjectId === subjectId ? { ...l, teacherId } : l)) };
  });
}

/**
 * A mother teacher chosen for a class (or taken away): she goes on every lesson that has no teacher (none of its own, none usual for the
 * subject) and in place of the mother teacher before; a lesson given to another teacher on purpose keeps them.
 */
export function applyMotherTeacher(model: GridModel, cells: readonly GridCell[], next: string | null, previous: string | null): GridCell[] {
  return cells.map((c) => ({
    ...c,
    lessons: c.lessons.map((l) => {
      const usual = model.allotments.get(l.subjectId)?.teacherId ?? null;
      if (l.teacherId === null && usual === null) return { ...l, teacherId: next };
      if (previous !== null && l.teacherId === previous) return { ...l, teacherId: next };
      return l;
    }),
  }));
}

/** Takes the lesson out of a period. */
export const clearCell = (cells: readonly GridCell[], day: number, period: number): GridCell[] => cells.filter((c) => !(c.day === day && c.period === period));

/** Changes one lesson of a period (its teacher or its room). */
export function changeLesson(cells: readonly GridCell[], day: number, period: number, subjectId: string, change: Partial<Pick<Lesson, "teacherId" | "room">>): GridCell[] {
  return cells.map((c) => (c.day === day && c.period === period ? { ...c, lessons: c.lessons.map((l) => (l.subjectId === subjectId ? { ...l, ...change } : l)) } : c));
}

const roomKey = (room: string) => room.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What is wrong with a period that can be said without asking the server: a teacher who does not come that day, a teacher or a room that
 * another class has then, a teacher in two lessons of one period, and subjects together that are not one choice. Keyed by the period.
 */
export function localProblems(model: GridModel, cells: readonly GridCell[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (day: number, period: number, message: string) => found.set(cellKey(day, period), [...(found.get(cellKey(day, period)) ?? []), message]);

  for (const cell of cells) {
    const teachers = new Set<string>();
    const rooms = new Set<string>();
    for (const lesson of cell.lessons) {
      const teacherId = teacherOf(model, lesson);
      const teacher = teacherId ? model.teachers.get(teacherId) : undefined;
      if (teacherId) {
        if (!teacher || !teacher.isActive) add(cell.day, cell.period, `${teacher?.name ?? "This teacher"} is no longer teaching here`);
        else {
          if (teacher.offDays.includes(cell.day)) add(cell.day, cell.period, `${teacher.name} does not come on ${DAY_NAMES[cell.day]}`);
          const clash = model.busy.find((b) => b.teacherId === teacherId && b.day === cell.day && b.period === cell.period);
          if (clash) add(cell.day, cell.period, `${teacher.name} is teaching ${clash.where} (${clash.subjectName}) at the same time`);
          if (teachers.has(teacherId)) add(cell.day, cell.period, `${teacher.name} cannot teach two subjects in one period`);
          teachers.add(teacherId);
        }
      }
      if (lesson.room) {
        const key = roomKey(lesson.room);
        const clash = model.busy.find((b) => b.room && roomKey(b.room) === key && b.day === cell.day && b.period === cell.period);
        if (clash) add(cell.day, cell.period, `${lesson.room} is being used by ${clash.where} (${clash.subjectName}) at the same time`);
        if (rooms.has(key)) add(cell.day, cell.period, `${lesson.room} cannot be used by two lessons in one period`);
        rooms.add(key);
      }
    }
    if (cell.lessons.length > 1) {
      const groups = cell.lessons.map((l) => model.allotments.get(l.subjectId)?.group?.toLowerCase() ?? null);
      if (groups.some((g) => g === null) || new Set(groups).size > 1) add(cell.day, cell.period, "Only the subjects of one choice can share a period");
    }
  }
  return found;
}

/** The periods a subject still needs (negative: it has more than it was given). */
export function missingPeriods(model: GridModel, cells: readonly GridCell[], subjectId: string): number {
  return (model.allotments.get(subjectId)?.periodsPerWeek ?? 0) - (placedCounts(cells).get(subjectId) ?? 0);
}

/** The same lessons in the same periods: whether the grid on the screen is what was saved. */
export function sameGrid(a: readonly GridCell[], b: readonly GridCell[]): boolean {
  const key = (cells: readonly GridCell[]) =>
    JSON.stringify(sorted([...cells]).map((c) => [c.day, c.period, c.lessons.map((l) => [l.subjectId, l.teacherId, l.room ?? null])]));
  return key(a) === key(b);
}

/**
 * Why a teacher should not be given a period, in words (they do not come that day, or another class has them then), or null when
 * nothing is wrong or there is no (known) teacher. It is only said, never refused: the server has the last word when the week is saved.
 */
export function teacherTrouble(model: GridModel, teacherId: string | null, day: number, period: number): string | null {
  const teacher = teacherId ? model.teachers.get(teacherId) : undefined;
  if (!teacher) return null;
  if (teacher.offDays.includes(day)) return `${teacher.name} does not come on ${DAY_NAMES[day]}`;
  const clash = model.busy.find((b) => b.teacherId === teacher.id && b.day === day && b.period === period);
  return clash ? `${teacher.name} is teaching ${clash.where} (${clash.subjectName}) then` : null;
}

/** A teacher who can be chosen for one period, or (`value` null) the subject's usual teacher / no teacher. */
export interface TeacherChoice {
  value: string | null;
  label: string;
  /** Said under the name: "Usual teacher", or why they cannot take the period. */
  note: string | null;
  /** The note says something is wrong. */
  bad: boolean;
  /** Cannot be picked: they cannot take the period and the period does not have them already. */
  disabled: boolean;
  selected: boolean;
}

/**
 * The teachers a period can be given, for the box of the period: the subject's usual teacher (or No teacher) first, then the school's
 * other teachers, those who teach this subject before the rest. Who cannot take the period is listed with the reason and cannot be picked,
 * unless the period has them already. Empty when the school has no teacher at all, which the box says.
 */
export function teacherChoices(model: GridModel, subjectId: string, day: number, period: number, current: string | null, mother: string | null = null): TeacherChoice[] {
  const usualId = model.allotments.get(subjectId)?.teacherId ?? null;
  const usual = usualId ? model.teachers.get(usualId) : undefined;
  const others = [...model.teachers.values()].filter((t) => t.id !== usualId && (t.isActive || t.id === current));
  if (!usual && others.length === 0) return [];
  const usualTrouble = teacherTrouble(model, usualId, day, period);
  const first: TeacherChoice = {
    value: null,
    label: usual?.name ?? "No teacher",
    note: usualTrouble ?? (usual ? "Usual teacher" : null),
    bad: !!usualTrouble,
    disabled: false,
    selected: current === null || current === usualId,
  };
  const teachesIt = (t: GridTeacher) => t.subjectIds.includes(subjectId);
  const rest = others.filter((t) => t.id !== mother);
  const ordered = [...others.filter((t) => t.id === mother), ...rest.filter(teachesIt), ...rest.filter((t) => !teachesIt(t))];
  return [
    first,
    ...ordered.map((t): TeacherChoice => {
      const trouble = teacherTrouble(model, t.id, day, period);
      return { value: t.id, label: t.name, note: trouble ?? (t.id === mother ? "Mother teacher" : null), bad: !!trouble, disabled: !!trouble && t.id !== current, selected: t.id === current };
    }),
  ];
}

/** A subject that can be put in a period, with what the class wants of it. */
export interface SubjectChoice {
  /** The subject's id; `preset:Name` for a usual subject the school does not have yet (it is added to the school when picked). */
  value: string;
  label: string;
  /** Where it comes from: the class's own list, the school's other subjects, or the usual subjects of a school. */
  kind: "class" | "school" | "preset";
  /** Periods of it already in the grid, of the periods a week the class gave it (0 when the class has not given any). */
  placed: number;
  periodsPerWeek: number;
  teacherId: string | null;
}

/** The value of a usual subject the school does not have yet, in the list of choices. */
export const PRESET_PREFIX = "preset:";

/**
 * Every subject that can go in a period, in the order they are offered: the class's own subjects (as the class lists them), then the
 * school's other active subjects, then the usual subjects of a school that the school does not have yet. An archived subject is not
 * offered, and a usual subject the school already has (by name, whatever its capitals) is not offered twice.
 */
export function subjectChoices({
  allotments,
  school,
  presets,
  placed,
}: {
  allotments: readonly GridAllotment[];
  school: readonly { id: string; name: string; isActive: boolean }[];
  presets: readonly string[];
  placed: ReadonlyMap<string, number>;
}): SubjectChoice[] {
  const inClass = new Set(allotments.map((a) => a.subjectId));
  const schoolNames = new Set(school.map((s) => s.name.toLowerCase()));
  return [
    ...allotments.map((a): SubjectChoice => ({ value: a.subjectId, label: a.subjectName, kind: "class", placed: placed.get(a.subjectId) ?? 0, periodsPerWeek: a.periodsPerWeek, teacherId: a.teacherId })),
    ...school
      .filter((s) => s.isActive && !inClass.has(s.id))
      .map((s): SubjectChoice => ({ value: s.id, label: s.name, kind: "school", placed: placed.get(s.id) ?? 0, periodsPerWeek: 0, teacherId: null })),
    ...presets
      .filter((name) => !schoolNames.has(name.toLowerCase()))
      .map((name): SubjectChoice => ({ value: `${PRESET_PREFIX}${name}`, label: name, kind: "preset", placed: 0, periodsPerWeek: 0, teacherId: null })),
  ];
}

/**
 * The choices that fit what is typed: all of them when nothing is. A name that starts with the letters comes first, then one with a word
 * that starts with them ("lab" finds "Computer Lab"), then one that only has them inside; each group keeps the order of the list.
 */
export function matchChoices(choices: readonly SubjectChoice[], typed: string): SubjectChoice[] {
  const text = typed.trim().toLowerCase();
  if (!text) return [...choices];
  const rank = (label: string) => {
    const name = label.toLowerCase();
    if (name.startsWith(text)) return 0;
    if (name.split(/[\s&/(),-]+/).some((word) => word.startsWith(text))) return 1;
    return name.includes(text) ? 2 : 3;
  };
  return choices
    .map((choice, order) => ({ choice, order, rank: rank(choice.label) }))
    .filter((x) => x.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((x) => x.choice);
}

/** A soft colour for each subject of the class, in the order the class lists them, so a subject keeps its colour on the whole page. */
export function subjectColors(view: GridView): Map<string, string> {
  return new Map(view.allotments.map((a, i) => [a.subjectId, SUBJECT_COLORS[i % SUBJECT_COLORS.length]]));
}

/** One kind of school day of a class: which days, from when to when, how many periods and its breaks ("Lunch 10:30 to 11:00"). */
export interface TimingGroup {
  days: string;
  start: string;
  end: string;
  periods: number;
  breaks: string[];
}

/** "Monday to Friday", "Monday, Wednesday", "Monday to Friday, Sunday": runs of three days or more are a range. */
function dayRange(days: number[]): string {
  const runs: number[][] = [];
  for (const d of [...days].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${DAY_NAMES[r[0]]} to ${DAY_NAMES[r[r.length - 1]]}` : r.map((d) => DAY_NAMES[d]).join(", "))).join(", ");
}

/** A class's week as its kinds of day: the days whose rows are the same go together (a short Saturday is its own). */
export function timingGroups(days: readonly GridDay[]): TimingGroup[] {
  const groups: { key: string; days: number[]; slots: GridDay["slots"] }[] = [];
  for (const d of days) {
    if (d.slots.length === 0) continue;
    const key = d.slots.map((s) => `${s.kind}@${s.start}-${s.end}`).join("|");
    const same = groups.find((g) => g.key === key);
    if (same) same.days.push(d.day);
    else groups.push({ key, days: [d.day], slots: d.slots });
  }
  return groups.map((g) => ({
    days: dayRange(g.days),
    start: g.slots[0].start,
    end: g.slots[g.slots.length - 1].end,
    periods: g.slots.filter((s) => s.period !== null).length,
    breaks: g.slots.filter((s) => s.period === null).map((s) => `${s.label} ${s.start} to ${s.end}`),
  }));
}

/** Where a class's (or section's) timetable is, and where what it studies is set. `sectionId` null is a class that has no sections. */
export const unitPath = (unit: { classId: string; sectionId: string | null }) => `/school/timetable?class=${unit.classId}&section=${unit.sectionId ?? "none"}`;
