import { Types } from "mongoose";
import { Subject } from "../../subjects/models/Subject";
import { minutesToClock } from "../../timetable/time";
import { Exam } from "../models/Exam";
import { ExamPaper } from "../models/ExamPaper";
import { EXAM_TYPE_INFO } from "../constants";
import { asId, fromDay, toDay } from "./dto";

/**
 * The class timetable gives way on exam days (2026-11-06). The timetable is a week of lessons that repeats; on a day the class has a
 * paper, that day is different. For one class and one week (Monday to Sunday) this says which days those are: a day of a **full exam**
 * (Half-yearly...) takes the place of the day's lessons and has the school's hours the exam gave; a **test** (Unit, Class test) goes on
 * top of a day that runs as usual. A day with no paper of the class is not listed: it is a day as usual.
 */

export interface ExamDayDto {
  date: string;
  /** Monday is 1, Sunday is 7. */
  day: number;
  /** True when a full exam has a paper that day: the lessons of the day are off. */
  replacesLessons: boolean;
  schoolHours: { start: string; end: string } | null;
  exams: { id: string; name: string; typeLabel: string; full: boolean }[];
  papers: { id: string; subject: { id: string; name: string }; startTime: string; endTime: string; durationMinutes: number; topic: string | null; maxMarks: number | null }[];
}

export interface ExamWeekDto {
  from: string;
  to: string;
  days: ExamDayDto[];
}

const addDays = (day: string, n: number) => {
  const d = fromDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
};

/** The Monday and the Sunday of the week that holds this day. */
export function weekOf(day: string): { from: string; to: string } {
  const dow = fromDay(day).getUTCDay() || 7;
  const from = addDays(day, 1 - dow);
  return { from, to: addDays(from, 6) };
}

/** The exam days of one class in the week that holds `date`. */
export async function examWeekOf(tenantId: string, yearId: Types.ObjectId, classId: string, date: string): Promise<ExamWeekDto> {
  const { from, to } = weekOf(date);
  const school = asId(tenantId);
  const papers = await ExamPaper.find({ tenantId: school, academicYearId: yearId, classIds: asId(classId), date: { $gte: fromDay(from), $lte: fromDay(to) } })
    .sort({ date: 1, start: 1 })
    .lean();
  if (papers.length === 0) return { from, to, days: [] };
  const [exams, subjects] = await Promise.all([
    Exam.find({ tenantId: school, _id: { $in: [...new Set(papers.map((p) => p.examId.toString()))].map(asId) } }).lean(),
    Subject.find({ tenantId: school, _id: { $in: papers.map((p) => p.subjectId) } }).select("name").lean(),
  ]);
  const examOf = new Map(exams.map((e) => [e._id.toString(), e]));
  const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));

  const days = new Map<string, ExamDayDto>();
  for (const p of papers) {
    const exam = examOf.get(p.examId.toString());
    if (!exam) continue;
    const date = toDay(p.date);
    const full = EXAM_TYPE_INFO[exam.type].full;
    const entry =
      days.get(date) ??
      ({ date, day: fromDay(date).getUTCDay() || 7, replacesLessons: false, schoolHours: null, exams: [], papers: [] } satisfies ExamDayDto);
    if (!entry.exams.some((e) => e.id === exam._id.toString())) entry.exams.push({ id: exam._id.toString(), name: exam.name, typeLabel: EXAM_TYPE_INFO[exam.type].label, full });
    if (full) {
      entry.replacesLessons = true;
      if (!entry.schoolHours && exam.schoolStart !== null && exam.schoolEnd !== null) entry.schoolHours = { start: minutesToClock(exam.schoolStart), end: minutesToClock(exam.schoolEnd) };
    }
    entry.papers.push({
      id: p._id.toString(),
      subject: { id: p.subjectId.toString(), name: subjectName.get(p.subjectId.toString()) ?? "A subject" },
      startTime: minutesToClock(p.start),
      endTime: minutesToClock(p.start + p.duration),
      durationMinutes: p.duration,
      topic: p.topic ?? null,
      maxMarks: p.maxMarks ?? null,
    });
    days.set(date, entry);
  }
  return { from, to, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
