import { DAY_NAMES, MAX_SAME_SUBJECT_PER_DAY } from "../constants";
import { overlaps } from "../time";
import type { PeriodSpan } from "./scheduleRules";

/**
 * Whether a class's weekly timetable is allowed, and what is worth a second look. No database in it: the service hands it the class's
 * periods, its lessons, what the class studies, the teachers, and what other classes already take of the teachers' and rooms' time.
 *
 *  - an ERROR is something that cannot be (a teacher in two places, a lesson in a period that does not exist): the timetable is not saved;
 *  - a WARNING is something a person should look at but may well mean (a subject with fewer periods than allotted, no teacher yet): it is
 *    saved and shown.
 * Times are compared by the clock, not by the period number: another class may have its periods at other times.
 */

export interface LessonIn {
  subjectId: string;
  /** Null: the teacher the class's subject list names. */
  teacherId: string | null;
  room: string | null;
}

export interface CellIn {
  day: number;
  period: number;
  lessons: LessonIn[];
}

export interface AllotmentInfo {
  subjectId: string;
  subjectName: string;
  periodsPerWeek: number;
  blockSize: number;
  teacherId: string | null;
  /** The choice the subject is one of; null for a subject everyone studies. */
  group: string | null;
}

export interface TeacherInfo {
  id: string;
  name: string;
  isActive: boolean;
  offDays: number[];
  maxPerDay: number | null;
  maxPerWeek: number | null;
}

/** A lesson another class already has: who teaches it and where, on which day, from when to when. */
export interface Busy {
  teacherId: string | null;
  room: string | null;
  day: number;
  start: number;
  end: number;
  /** "Class 7 - B", for the message. */
  where: string;
  subjectName: string;
}

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
  day?: number;
  period?: number;
  subjectId?: string;
  teacherId?: string;
}

export interface CheckInput {
  /** The class's periods, for each day it has school. */
  days: { day: number; periods: PeriodSpan[] }[];
  cells: CellIn[];
  allotments: Map<string, AllotmentInfo>;
  teachers: Map<string, TeacherInfo>;
  busy: Busy[];
}

export interface CheckResult {
  issues: Issue[];
  /** How many periods each subject has in the timetable (a choice's subjects each count the shared period). */
  placed: Map<string, number>;
  /** The periods of the week, and how many have no lesson. */
  total: number;
  free: number;
}

const roomKey = (room: string) => room.trim().toLowerCase().replace(/\s+/g, " ");
const WORDS: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function analyse(input: CheckInput): CheckResult {
  const found: (Issue & { order: number })[] = [];
  const add = (issue: Issue) => found.push({ ...issue, order: found.length });
  const dayPeriods = new Map(input.days.map((d) => [d.day, new Map(d.periods.map((p) => [p.period, p]))]));
  const total = input.days.reduce((sum, d) => sum + d.periods.length, 0);

  const placed = new Map<string, number>();
  /** The effective teacher's lessons here, by teacher and day, for the limits. */
  const teacherDays = new Map<string, Map<number, number>>();
  /** The periods each subject has on each day, for back-to-back and blocks. */
  const subjectDays = new Map<string, Map<number, number[]>>();
  const noTeacher = new Map<string, number>();
  const seen = new Set<string>();
  let filled = 0;

  for (const cell of input.cells) {
    const periods = dayPeriods.get(cell.day);
    const span = periods?.get(cell.period);
    if (!periods) {
      add({ level: "error", code: "CELL_OUTSIDE", message: `This class has no school on ${DAY_NAMES[cell.day]}`, day: cell.day, period: cell.period });
      continue;
    }
    if (!span) {
      add({ level: "error", code: "CELL_OUTSIDE", message: `${DAY_NAMES[cell.day]} has no period ${cell.period} in this class's timing`, day: cell.day, period: cell.period });
      continue;
    }
    const key = `${cell.day}:${cell.period}`;
    if (seen.has(key)) {
      add({ level: "error", code: "CELL_TWICE", message: `${DAY_NAMES[cell.day]} period ${cell.period} is given twice`, day: cell.day, period: cell.period });
      continue;
    }
    seen.add(key);
    filled += 1;

    const where = { day: cell.day, period: cell.period };
    const subjectsHere = new Set<string>();
    const teachersHere = new Map<string, string>();
    const roomsHere = new Set<string>();
    let allKnown = true;

    for (const lesson of cell.lessons) {
      const allotment = input.allotments.get(lesson.subjectId);
      if (subjectsHere.has(lesson.subjectId)) {
        add({ level: "error", code: "LESSON_TWICE", message: `${allotment?.subjectName ?? "A subject"} is twice in this period`, subjectId: lesson.subjectId, ...where });
        continue;
      }
      subjectsHere.add(lesson.subjectId);
      if (!allotment) {
        allKnown = false;
        add({ level: "error", code: "SUBJECT_NOT_STUDIED", message: "This class does not study this subject", subjectId: lesson.subjectId, ...where });
        continue;
      }
      placed.set(lesson.subjectId, (placed.get(lesson.subjectId) ?? 0) + 1);
      const days = subjectDays.get(lesson.subjectId) ?? new Map<number, number[]>();
      days.set(cell.day, [...(days.get(cell.day) ?? []), cell.period]);
      subjectDays.set(lesson.subjectId, days);

      const teacherId = lesson.teacherId ?? allotment.teacherId;
      if (!teacherId) noTeacher.set(lesson.subjectId, (noTeacher.get(lesson.subjectId) ?? 0) + 1);
      else {
        const teacher = input.teachers.get(teacherId);
        if (!teacher || !teacher.isActive) {
          add({ level: "error", code: "TEACHER_GONE", message: `${teacher?.name ?? "This teacher"} is no longer teaching here`, teacherId, subjectId: lesson.subjectId, ...where });
        } else {
          if (teacher.offDays.includes(cell.day)) {
            add({ level: "error", code: "TEACHER_OFF", message: `${teacher.name} does not come on ${DAY_NAMES[cell.day]}`, teacherId, subjectId: lesson.subjectId, ...where });
          }
          if (teachersHere.has(teacherId)) {
            add({ level: "error", code: "TEACHER_TWICE", message: `${teacher.name} cannot teach two subjects in one period`, teacherId, subjectId: lesson.subjectId, ...where });
          }
          teachersHere.set(teacherId, lesson.subjectId);
          const clash = input.busy.find((b) => b.teacherId === teacherId && b.day === cell.day && overlaps(b, span));
          if (clash) {
            add({ level: "error", code: "TEACHER_BUSY", message: `${teacher.name} is teaching ${clash.where} (${clash.subjectName}) at the same time`, teacherId, subjectId: lesson.subjectId, ...where });
          }
          const perDay = teacherDays.get(teacherId) ?? new Map<number, number>();
          perDay.set(cell.day, (perDay.get(cell.day) ?? 0) + 1);
          teacherDays.set(teacherId, perDay);
        }
      }

      if (lesson.room) {
        const room = roomKey(lesson.room);
        if (roomsHere.has(room)) {
          add({ level: "error", code: "ROOM_TWICE", message: `${lesson.room} cannot be used by two lessons in one period`, subjectId: lesson.subjectId, ...where });
        }
        roomsHere.add(room);
        const clash = input.busy.find((b) => b.room && roomKey(b.room) === room && b.day === cell.day && overlaps(b, span));
        if (clash) {
          add({ level: "error", code: "ROOM_BUSY", message: `${lesson.room} is being used by ${clash.where} (${clash.subjectName}) at the same time`, subjectId: lesson.subjectId, ...where });
        }
      }
    }

    // Subjects share a period only when they are the subjects of one choice.
    if (subjectsHere.size > 1 && allKnown) {
      const groups = [...subjectsHere].map((id) => input.allotments.get(id)?.group?.toLowerCase() ?? null);
      if (groups.some((g) => g === null) || new Set(groups).size > 1) {
        add({ level: "error", code: "NOT_A_CHOICE", message: "Only the subjects of one choice can share a period", ...where });
      }
    }
    // A period with some of a choice's subjects but not all leaves the others' students without a lesson.
    const inCell = new Set(cell.lessons.map((l) => l.subjectId));
    for (const group of new Set(cell.lessons.map((l) => input.allotments.get(l.subjectId)?.group).filter((g): g is string => !!g))) {
      const missing = [...input.allotments.values()].filter((a) => a.group?.toLowerCase() === group.toLowerCase() && !inCell.has(a.subjectId));
      if (missing.length > 0) {
        add({ level: "warning", code: "CHOICE_INCOMPLETE", message: `In this period the choice '${group}' has no lesson for ${missing.map((m) => m.subjectName).join(", ")}`, ...where });
      }
    }
  }

  // ---- The week as a whole (warnings) ------------------------------------------------------------------------------------------

  for (const [subjectId, allotment] of input.allotments) {
    const count = placed.get(subjectId) ?? 0;
    if (count === allotment.periodsPerWeek) continue;
    if (count === 0) add({ level: "warning", code: "TOO_FEW", message: `${allotment.subjectName} has none of its ${allotment.periodsPerWeek} periods`, subjectId });
    else if (count < allotment.periodsPerWeek) add({ level: "warning", code: "TOO_FEW", message: `${allotment.subjectName} has ${count} of its ${allotment.periodsPerWeek} periods`, subjectId });
    else add({ level: "warning", code: "TOO_MANY", message: `${allotment.subjectName} has ${count} periods but ${allotment.periodsPerWeek} are allotted`, subjectId });
  }
  for (const [subjectId, count] of noTeacher) {
    add({ level: "warning", code: "NO_TEACHER", message: `${input.allotments.get(subjectId)?.subjectName ?? "A subject"} has no teacher in ${plural(count, "period")}`, subjectId });
  }

  for (const [subjectId, days] of subjectDays) {
    const allotment = input.allotments.get(subjectId);
    if (!allotment) continue;
    for (const [day, periodNumbers] of days) {
      const spans = dayPeriods.get(day);
      const runs = runsOf([...periodNumbers].sort((a, b) => a - b), spans);
      if (runs.length > MAX_SAME_SUBJECT_PER_DAY) {
        add({ level: "warning", code: "TOO_OFTEN", message: `${allotment.subjectName} is ${runs.length} times on ${DAY_NAMES[day]}`, subjectId, day, period: runs[0][0] });
      }
      for (const run of runs) {
        if (allotment.blockSize > 1 && run.length % allotment.blockSize !== 0) {
          add({
            level: "warning",
            code: "BLOCK_BROKEN",
            message: `${allotment.subjectName} is meant for ${allotment.blockSize} periods in a row: there ${run.length === 1 ? "is" : "are"} ${run.length} on ${DAY_NAMES[day]}`,
            subjectId,
            day,
            period: run[0],
          });
        } else if (allotment.blockSize === 1 && run.length > 1) {
          add({ level: "warning", code: "BACK_TO_BACK", message: `${allotment.subjectName} is in ${WORDS[run.length] ?? run.length} periods in a row on ${DAY_NAMES[day]}`, subjectId, day, period: run[0] });
        }
      }
    }
  }

  for (const [teacherId, perDay] of teacherDays) {
    const teacher = input.teachers.get(teacherId);
    if (!teacher) continue;
    const elsewhereOn = (day: number) => input.busy.filter((b) => b.teacherId === teacherId && b.day === day).length;
    let week = input.busy.filter((b) => b.teacherId === teacherId).length;
    for (const [day, here] of perDay) {
      week += here;
      const total = here + elsewhereOn(day);
      if (teacher.maxPerDay !== null && total > teacher.maxPerDay) {
        add({ level: "warning", code: "TEACHER_DAY_FULL", message: `${teacher.name} has ${total} periods on ${DAY_NAMES[day]}: the most is ${teacher.maxPerDay}`, teacherId, day });
      }
    }
    if (teacher.maxPerWeek !== null && week > teacher.maxPerWeek) {
      add({ level: "warning", code: "TEACHER_WEEK_FULL", message: `${teacher.name} has ${week} periods this week: the most is ${teacher.maxPerWeek}`, teacherId });
    }
  }

  const rank = (i: Issue) => (i.level === "error" ? 0 : 1);
  const issues = found
    .sort((a, b) => rank(a) - rank(b) || (a.day ?? 99) - (b.day ?? 99) || (a.period ?? 99) - (b.period ?? 99) || a.order - b.order)
    .map(({ order: _order, ...issue }) => issue);
  return { issues, placed, total, free: total - filled };
}

/**
 * The periods of one subject on one day, in runs of periods that follow each other without a gap: periods 2, 3 and 5 are the runs [2, 3]
 * and [5]; periods 3 and 4 with a lunch between them are two runs.
 */
function runsOf(periods: number[], spans: Map<number, PeriodSpan> | undefined): number[][] {
  const runs: number[][] = [];
  for (const period of periods) {
    const last = runs[runs.length - 1];
    const before = last ? spans?.get(last[last.length - 1]) : undefined;
    const now = spans?.get(period);
    if (last && last[last.length - 1] === period - 1 && before && now && before.end === now.start) last.push(period);
    else runs.push([period]);
  }
  return runs;
}
