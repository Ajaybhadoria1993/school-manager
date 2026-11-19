/**
 * A subject has periods a week (5 of English, say). Each one becomes a lesson of the class's timetable only when a person puts it on a day
 * and time; until then it is in nobody's week, the teacher's included. These words say how far that is (a teacher's Classes card and their
 * Week page use the same ones).
 */
export function placementText(placed: number, periodsPerWeek: number): string {
  if (placed <= 0) return "Not in timetable yet";
  if (placed >= periodsPerWeek) return `All ${periodsPerWeek} in timetable`;
  return `${placed} of ${periodsPerWeek} in timetable`;
}

/** The periods of these subjects that are not in the timetable yet (a subject with more lessons than periods is not counted below zero). */
export function missingPeriods(subjects: readonly { periodsPerWeek: number; placedPeriods: number }[]): number {
  return subjects.reduce((sum, s) => sum + Math.max(0, s.periodsPerWeek - s.placedPeriods), 0);
}
