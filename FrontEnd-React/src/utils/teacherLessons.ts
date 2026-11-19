import type { TeacherWeek } from "../types";

/** One stretch of a teacher's day in one class: the periods that follow each other in the same class and subject. */
export interface LessonRun {
  day: number;
  start: string;
  end: string;
  label: string;
  subjectName: string;
  /** The first and the last period of the run (the same number for a single period). */
  periods: [number, number];
}

/**
 * The lessons of a teacher's week as short lines, by day and time: the periods that follow each other in one class and subject are one line
 * ("Mon 10:10–12:25 Nursery - A, Fun activity"). Assign class shows it so a person sees where the teacher already is, hour by hour.
 */
export function lessonRuns(lessons: TeacherWeek["lessons"]): LessonRun[] {
  const sorted = [...lessons].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const runs: (LessonRun & { key: string })[] = [];
  for (const l of sorted) {
    const key = `${l.classId}:${l.sectionId ?? "-"}:${l.subjectId}`;
    const last = runs[runs.length - 1];
    if (last && last.day === l.day && last.key === key && last.periods[1] + 1 === l.period) {
      last.end = l.end;
      last.periods = [last.periods[0], l.period];
    } else {
      runs.push({ key, day: l.day, start: l.start, end: l.end, label: l.label, subjectName: l.subjectName, periods: [l.period, l.period] });
    }
  }
  return runs.map(({ key: _key, ...run }) => run);
}
