import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Subject } from "../../subjects/models/Subject";
import type { ExamFacts } from "../../notifications/services/events";
import { clockToMinutes, minutesToClock } from "../../timetable/time";
import { EXAM_TYPE_INFO, type ExamType } from "../constants";
import type { IExam } from "../models/Exam";
import type { IExamPaper } from "../models/ExamPaper";
import { ExamMark } from "../models/ExamMark";
import { examStatus, type ExamStatus } from "./status";
import { clock12 } from "./text";

/** The shapes that leave the API: ids are strings, days are "2026-09-15", times are "09:00". */

export interface ExamDto {
  id: string;
  name: string;
  type: ExamType;
  typeLabel: string;
  /** A full exam takes over the school day (it has school hours); a test fits into a day that goes on as usual. */
  full: boolean;
  startDate: string;
  endDate: string;
  schoolHours: { start: string; end: string } | null;
  note: string | null;
  status: ExamStatus;
  paperCount: number;
  classCount: number;
}

export interface PaperDto {
  id: string;
  examId: string;
  classIds: string[];
  /** In the school's class order; `order` lets a page put classes from different papers in that order. */
  classes: { id: string; name: string; order: number }[];
  subject: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  maxMarks: number | null;
  topic: string | null;
  /** How many children have a result (marks or absent) in this paper, in all its classes. */
  marked: number;
  /** The name of the holiday that is on this paper's day now (declared after the paper was set), or null. */
  holiday: string | null;
}

export interface ExamDetailDto extends ExamDto {
  papers: PaperDto[];
}

export const toDay = (d: Date) => d.toISOString().slice(0, 10);
export const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);
export const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

export const EXAM_NOT_FOUND = () => ApiError.notFound("This exam is not on the school's list any more", "EXAM_NOT_FOUND");
export const PAPER_NOT_FOUND = () => ApiError.notFound("This paper is not in the exam any more", "PAPER_NOT_FOUND");

export interface Counts {
  papers: number;
  classes: Set<string>;
}

export const toExamDto = (e: IExam, counts: Counts | undefined, today: string): ExamDto => {
  const startDate = toDay(e.startDate);
  const endDate = toDay(e.endDate);
  return {
    id: e._id.toString(),
    name: e.name,
    type: e.type,
    typeLabel: EXAM_TYPE_INFO[e.type].label,
    full: EXAM_TYPE_INFO[e.type].full,
    startDate,
    endDate,
    schoolHours: e.schoolStart !== null && e.schoolEnd !== null ? { start: minutesToClock(e.schoolStart), end: minutesToClock(e.schoolEnd) } : null,
    note: e.note ?? null,
    status: examStatus(startDate, endDate, today),
    paperCount: counts?.papers ?? 0,
    classCount: counts?.classes.size ?? 0,
  };
};

/** How many papers and how many different classes an exam has. */
export function countPapers(papers: Pick<IExamPaper, "examId" | "classIds">[]): Map<string, Counts> {
  const counts = new Map<string, Counts>();
  for (const p of papers) {
    const entry = counts.get(p.examId.toString()) ?? { papers: 0, classes: new Set<string>() };
    entry.papers += 1;
    for (const id of p.classIds) entry.classes.add(id.toString());
    counts.set(p.examId.toString(), entry);
  }
  return counts;
}

/** How many children have a result in each of these papers (one read, grouped by paper). */
export async function markedCounts(school: Types.ObjectId, paperIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (paperIds.length === 0) return new Map();
  const rows = await ExamMark.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { tenantId: school, paperId: { $in: paperIds } } }, { $group: { _id: "$paperId", n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id.toString(), r.n]));
}

/** Papers as they leave the API, in date and time order, with their classes (in the school's class order) and subject named. */
export async function describePapers(tenantId: string | Types.ObjectId, papers: IExamPaper[]): Promise<PaperDto[]> {
  if (papers.length === 0) return [];
  const school = asId(tenantId);
  const [classes, subjects, marked] = await Promise.all([
    SchoolClass.find({ tenantId: school, _id: { $in: papers.flatMap((p) => p.classIds) } }).select("name order").lean(),
    Subject.find({ tenantId: school, _id: { $in: papers.map((p) => p.subjectId) } }).select("name").lean(),
    markedCounts(school, papers.map((p) => p._id)),
  ]);
  const classOf = new Map(classes.map((c) => [c._id.toString(), c]));
  const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
  return papers
    .map((p) => ({
      id: p._id.toString(),
      examId: p.examId.toString(),
      classIds: p.classIds.map((c) => c.toString()),
      classes: p.classIds
        .map((c) => classOf.get(c.toString()))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map((c) => ({ id: c._id.toString(), name: c.name, order: c.order })),
      subject: { id: p.subjectId.toString(), name: subjectName.get(p.subjectId.toString()) ?? "A subject" },
      date: toDay(p.date),
      startTime: minutesToClock(p.start),
      endTime: minutesToClock(p.start + p.duration),
      durationMinutes: p.duration,
      maxMarks: p.maxMarks ?? null,
      topic: p.topic ?? null,
      marked: marked.get(p._id.toString()) ?? 0,
      holiday: null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.subject.name.localeCompare(b.subject.name));
}

/** An exam as the bell words it: its name, its days and "School 8:00 AM to 12:30 PM" when it keeps school hours. */
export const factsOf = (e: Pick<ExamDto, "id" | "name" | "startDate" | "endDate" | "schoolHours">): ExamFacts => ({
  id: e.id,
  name: e.name,
  startDate: e.startDate,
  endDate: e.endDate,
  hours: e.schoolHours ? `School ${clock12(clockToMinutes(e.schoolHours.start) ?? 0)} to ${clock12(clockToMinutes(e.schoolHours.end) ?? 0)}` : null,
});
