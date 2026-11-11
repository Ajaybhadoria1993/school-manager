import { MAX_SAME_SUBJECT_PER_DAY } from "../constants";
import { overlaps } from "../time";
import type { AllotmentInfo, Busy, CellIn, TeacherInfo } from "./checker";
import type { PeriodSpan } from "./scheduleRules";

/**
 * Fills the empty periods of a class's timetable from what the class studies: every subject gets its periods a week, spread over the
 * days, with no teacher in two places, no teacher on a day they do not come, double periods kept together and the subjects of a choice
 * side by side. It never moves or removes a lesson that is already there, and it never invents one: what cannot be placed is said, by
 * subject, with how many periods are missing. The same `seed` gives the same arrangement; another seed gives another.
 *
 * This is a careful rule of thumb, not a search for the best timetable: it places the hardest lessons first (choices, double periods,
 * the busiest teachers) and puts each where it scores best (a subject on a day it is not yet, away from itself, teachers not loaded).
 * It is a start for a person to adjust, which is why it is saved only when the person says so.
 */

export interface AutofillInput {
  /** The class's periods, for each day it has school. */
  days: { day: number; periods: PeriodSpan[] }[];
  /** The lessons already there: kept as they are. They must be lessons the checker accepts. */
  cells: CellIn[];
  allotments: Map<string, AllotmentInfo>;
  teachers: Map<string, TeacherInfo>;
  /** What other classes already take of the teachers' time. */
  busy: Busy[];
  seed: number;
}

export interface AutofillResult {
  /** The lessons already there and the ones added, by day and period. */
  cells: CellIn[];
  /** Subjects that could not get all their periods, and how many are missing. */
  unplaced: { subjectId: string; subjectName: string; missing: number }[];
}

/** A small seeded generator, so a seed always gives the same arrangement. */
function random(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Some subjects taught together (a choice, or one subject) in `size` periods in a row. */
interface Piece {
  subjects: AllotmentInfo[];
  size: number;
}

const keyOf = (day: number, period: number) => `${day}:${period}`;

export function autofill(input: AutofillInput): AutofillResult {
  const rng = random(input.seed);
  const spans = new Map(input.days.map((d) => [d.day, d.periods]));
  const filled = new Map<string, CellIn>();
  for (const cell of input.cells) filled.set(keyOf(cell.day, cell.period), { ...cell, lessons: cell.lessons.map((l) => ({ ...l })) });

  // ---- What each subject already has ---------------------------------------------------------------------------------------------

  const placedBySubject = new Map<string, number>();
  /** Where each subject is, by day: its periods. */
  const subjectPeriods = new Map<string, Map<number, number[]>>();
  const noteLesson = (subjectId: string, day: number, period: number) => {
    placedBySubject.set(subjectId, (placedBySubject.get(subjectId) ?? 0) + 1);
    const days = subjectPeriods.get(subjectId) ?? new Map<number, number[]>();
    days.set(day, [...(days.get(day) ?? []), period]);
    subjectPeriods.set(subjectId, days);
  };
  /** The periods each teacher has in this class, by day. */
  const teacherOwn = new Map<string, Set<string>>();
  const teacherDay = new Map<string, Map<number, number>>();
  const noteTeacher = (teacherId: string | null, day: number, period: number) => {
    if (!teacherId) return;
    const own = teacherOwn.get(teacherId) ?? new Set<string>();
    own.add(keyOf(day, period));
    teacherOwn.set(teacherId, own);
    const perDay = teacherDay.get(teacherId) ?? new Map<number, number>();
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    teacherDay.set(teacherId, perDay);
  };
  for (const cell of filled.values()) {
    for (const lesson of cell.lessons) {
      noteLesson(lesson.subjectId, cell.day, cell.period);
      noteTeacher(lesson.teacherId ?? input.allotments.get(lesson.subjectId)?.teacherId ?? null, cell.day, cell.period);
    }
  }

  /** The periods a teacher already has elsewhere, by day, and in the week. */
  const elsewhereDay = (teacherId: string, day: number) => input.busy.filter((b) => b.teacherId === teacherId && b.day === day).length;
  const elsewhereWeek = (teacherId: string) => input.busy.filter((b) => b.teacherId === teacherId).length;
  const weekOwn = (teacherId: string) => [...(teacherDay.get(teacherId)?.values() ?? [])].reduce((sum, n) => sum + n, 0);

  // ---- What is still to place ------------------------------------------------------------------------------------------------------

  const pieces: Piece[] = [];
  const groups = new Map<string, AllotmentInfo[]>();
  const alone: AllotmentInfo[] = [];
  for (const a of input.allotments.values()) {
    if (a.group) groups.set(a.group.toLowerCase(), [...(groups.get(a.group.toLowerCase()) ?? []), a]);
    else alone.push(a);
  }
  const pieceSizes = (remaining: number, block: number): number[] => {
    const sizes = Array.from({ length: Math.floor(remaining / block) }, () => block);
    if (remaining % block > 0) sizes.push(remaining % block);
    return sizes;
  };
  for (const members of groups.values()) {
    const placed = Math.max(...members.map((m) => placedBySubject.get(m.subjectId) ?? 0));
    for (const size of pieceSizes(Math.max(0, members[0].periodsPerWeek - placed), members[0].blockSize)) pieces.push({ subjects: members, size });
  }
  for (const a of alone) {
    for (const size of pieceSizes(Math.max(0, a.periodsPerWeek - (placedBySubject.get(a.subjectId) ?? 0)), a.blockSize)) pieces.push({ subjects: [a], size });
  }

  // The hardest first: choices, then blocks, then the subjects of the busiest teachers.
  const teacherWeight = new Map<string, number>();
  for (const a of input.allotments.values()) if (a.teacherId) teacherWeight.set(a.teacherId, (teacherWeight.get(a.teacherId) ?? 0) + a.periodsPerWeek);
  const rank = (p: Piece) => (p.subjects.length > 1 ? 0 : p.size > 1 ? 1 : 2);
  const weight = (p: Piece) => Math.max(0, ...p.subjects.map((s) => (s.teacherId ? (teacherWeight.get(s.teacherId) ?? 0) : 0)));
  const order = new Map([...input.allotments.keys()].map((id, i) => [id, i]));
  const queue = pieces
    .map((piece, index) => ({ piece, index }))
    .sort((a, b) => rank(a.piece) - rank(b.piece) || weight(b.piece) - weight(a.piece) || (order.get(a.piece.subjects[0].subjectId) ?? 0) - (order.get(b.piece.subjects[0].subjectId) ?? 0) || a.index - b.index)
    .map((x) => x.piece);

  // ---- Placing ---------------------------------------------------------------------------------------------------------------------

  const teacherFree = (subject: AllotmentInfo, day: number, span: PeriodSpan): boolean => {
    if (!subject.teacherId) return true;
    const teacher = input.teachers.get(subject.teacherId);
    if (!teacher || !teacher.isActive || teacher.offDays.includes(day)) return false;
    if (teacherOwn.get(subject.teacherId)?.has(keyOf(day, span.period))) return false;
    return !input.busy.some((b) => b.teacherId === subject.teacherId && b.day === day && overlaps(b, span));
  };

  /** The periods of a subject on a day, as runs of periods that follow each other without a break between. */
  const runsOn = (subjectId: string, day: number): number => {
    const periods = [...(subjectPeriods.get(subjectId)?.get(day) ?? [])].sort((a, b) => a - b);
    const list = spans.get(day) ?? [];
    let runs = 0;
    let previous: PeriodSpan | undefined;
    for (const p of periods) {
      const now = list.find((s) => s.period === p);
      if (!(previous && now && previous.period === p - 1 && previous.end === now.start)) runs += 1;
      previous = now;
    }
    return runs;
  };

  const lessonsOnDay = (day: number) => [...filled.values()].filter((c) => c.day === day).length;

  const place = (piece: Piece): boolean => {
    let best: { day: number; start: number; score: number } | null = null;
    for (const [day, list] of spans) {
      for (let i = 0; i + piece.size <= list.length; i += 1) {
        const run = list.slice(i, i + piece.size);
        // The periods follow each other with nothing between them (a block never goes across the lunch).
        if (run.some((span, k) => k > 0 && !(span.period === run[k - 1].period + 1 && span.start === run[k - 1].end))) continue;
        if (run.some((span) => filled.has(keyOf(day, span.period)))) continue;
        if (piece.subjects.some((s) => run.some((span) => !teacherFree(s, day, span)))) continue;

        // A class's day ends after its last lesson, so lessons are packed from the first period: a period that leaves a gap before it
        // costs more than any other choice here, and of the rest the earlier one wins.
        let score = 2 * lessonsOnDay(day) + rng() * 3 + 10 * Math.max(0, i - lessonsOnDay(day)) + 0.5 * i;
        for (const subject of piece.subjects) {
          const runs = runsOn(subject.subjectId, day);
          score += 100 * runs + (runs >= MAX_SAME_SUBJECT_PER_DAY ? 1000 : 0);
          const here = subjectPeriods.get(subject.subjectId)?.get(day) ?? [];
          if (piece.size === 1 && subject.blockSize === 1 && here.some((p) => Math.abs(p - run[0].period) === 1)) score += 60;
          for (const [otherDay, periods] of subjectPeriods.get(subject.subjectId) ?? []) if (otherDay !== day && periods.includes(run[0].period)) score += 4;
          if (subject.teacherId) {
            const teacher = input.teachers.get(subject.teacherId)!;
            const today = (teacherDay.get(subject.teacherId)?.get(day) ?? 0) + elsewhereDay(subject.teacherId, day);
            score += 8 * today;
            if (teacher.maxPerDay !== null && today + piece.size > teacher.maxPerDay) score += 500;
            if (teacher.maxPerWeek !== null && weekOwn(subject.teacherId) + elsewhereWeek(subject.teacherId) + piece.size > teacher.maxPerWeek) score += 300;
          }
        }
        if (!best || score < best.score) best = { day, start: i, score };
      }
    }
    if (!best) return false;
    const list = spans.get(best.day)!;
    for (const span of list.slice(best.start, best.start + piece.size)) {
      filled.set(keyOf(best.day, span.period), {
        day: best.day,
        period: span.period,
        lessons: piece.subjects.map((s) => ({ subjectId: s.subjectId, teacherId: null, room: null })),
      });
      for (const s of piece.subjects) {
        noteLesson(s.subjectId, best.day, span.period);
        noteTeacher(s.teacherId, best.day, span.period);
      }
    }
    return true;
  };

  // A block that finds no room in a row is given as single periods rather than not at all (the timetable then warns it is broken).
  for (let i = 0; i < queue.length; i += 1) {
    const piece = queue[i];
    if (place(piece)) continue;
    if (piece.size > 1) for (let k = 0; k < piece.size; k += 1) queue.push({ subjects: piece.subjects, size: 1 });
  }

  const unplaced: AutofillResult["unplaced"] = [];
  for (const a of input.allotments.values()) {
    const missing = a.periodsPerWeek - (placedBySubject.get(a.subjectId) ?? 0);
    if (missing > 0) unplaced.push({ subjectId: a.subjectId, subjectName: a.subjectName, missing });
  }
  const cells = [...filled.values()].sort((a, b) => a.day - b.day || a.period - b.period);
  return { cells, unplaced };
}
