export type ExamStatus = "upcoming" | "running" | "over";

/** Whether an exam has come: before its first day it is upcoming, from the first to the last day it is running, after it it is over. Days are "2026-09-15". */
export const examStatus = (startDate: string, endDate: string, today: string): ExamStatus => (today < startDate ? "upcoming" : today > endDate ? "over" : "running");

const RANK: Record<ExamStatus, number> = { running: 0, upcoming: 1, over: 2 };

/** The one that is on first, then the next ones in the order they come, then the ones that are over, the latest first. */
export function sortExams<T extends { status: ExamStatus; startDate: string }>(exams: T[]): T[] {
  return exams.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.status === "over" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)));
}
