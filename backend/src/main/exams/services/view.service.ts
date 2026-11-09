import { Types } from "mongoose";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { accessTo } from "../../classroom/services/access";
import { childrenOf } from "../../classroom/services/children";
import type { Caller } from "../../classroom/services/leave.service";
import { ParentService } from "../../parents/services/parent.service";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { placesOf } from "../../students/services/shared";
import { Subject } from "../../subjects/models/Subject";
import { resolveUnit } from "../../timetable/services/unit";
import { minutesToClock } from "../../timetable/time";
import { Exam, type IExam } from "../models/Exam";
import { ExamMark } from "../models/ExamMark";
import { ExamPaper, type IExamPaper } from "../models/ExamPaper";
import type { ChildExamsQuery, ClassExamsQuery } from "../schemas/exams.schemas";
import { examWeekOf, weekOf, type ExamWeekDto } from "./days";
import { asId, toDay, toExamDto, type ExamDto } from "./dto";
import { holidayNamesOn } from "./holidays";
import { sortExams } from "./status";

/** What a paper is, as a class's teacher or a child's parent reads it. */
interface PaperBase {
  id: string;
  subject: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  topic: string | null;
  maxMarks: number | null;
}

export interface ClassPaperDto extends PaperBase {
  /** The paper's day has come: marks can be entered. */
  held: boolean;
  canWrite: boolean;
  /** Children of this class (section) with a result in it, and how many children it has. */
  marked: number;
  children: number;
  /** The holiday that is on its day now (declared after the paper was set), or null. */
  holiday: string | null;
}
export interface ClassExamDto extends ExamDto {
  papers: ClassPaperDto[];
}

export interface ChildPaperDto extends PaperBase {
  result: { marks: number | null; absent: boolean; percent: number | null } | null;
}
export interface ChildExamDto extends ExamDto {
  papers: ChildPaperDto[];
  /** The marks of the papers with a result (not absent), out of what those papers are out of; null when there is none. */
  summary: { marks: number; outOf: number; percent: number; papers: number } | null;
}

const percentOf = (marks: number, max: number) => Math.round((marks / max) * 100);

async function subjectNames(school: Types.ObjectId, ids: Types.ObjectId[]) {
  const subjects = await Subject.find({ tenantId: school, _id: { $in: ids } }).select("name").lean();
  return new Map(subjects.map((s) => [s._id.toString(), s.name]));
}

const baseOf = (p: IExamPaper, names: Map<string, string>): PaperBase => ({
  id: p._id.toString(),
  subject: { id: p.subjectId.toString(), name: names.get(p.subjectId.toString()) ?? "A subject" },
  date: toDay(p.date),
  startTime: minutesToClock(p.start),
  endTime: minutesToClock(p.start + p.duration),
  durationMinutes: p.duration,
  topic: p.topic ?? null,
  maxMarks: p.maxMarks ?? null,
});

const byTime = (a: PaperBase, b: PaperBase) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.subject.name.localeCompare(b.subject.name);

/** Every exam of the year as a list item, with the papers of one reader (a class, a child) under it. Exams that are on come first. */
function examsWith<P extends PaperBase>(exams: IExam[], papers: Map<string, P[]>, today: string): (ExamDto & { papers: P[] })[] {
  return sortExams(
    exams.map((e) => {
      const list = (papers.get(e._id.toString()) ?? []).sort(byTime);
      // Seen by one class (or child), an exam has that many papers and, if any, that one class.
      return { ...toExamDto(e, list.length > 0 ? { papers: list.length, classes: new Set(["this class"]) } : undefined, today), papers: list };
    })
  );
}

const groupByExam = <T extends { examId: Types.ObjectId }, P>(papers: T[], make: (p: T) => P) => {
  const map = new Map<string, P[]>();
  for (const p of papers) map.set(p.examId.toString(), [...(map.get(p.examId.toString()) ?? []), make(p)]);
  return map;
};

/** The exams of a class (section) for the people who teach it and the people who run the school, and the exam days of its week. */
export class ClassExamsService {
  static async get(tenantId: string, caller: Caller, query: ClassExamsQuery): Promise<{ label: string; items: ClassExamDto[]; week: ExamWeekDto }> {
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    const access = await accessTo(tenantId, caller, unit);
    const school = asId(tenantId);
    const place = { classId: asId(unit.classId), sectionId: unit.sectionId ? asId(unit.sectionId) : null };
    const [exams, papers, children, marked] = await Promise.all([
      Exam.find({ tenantId: school, academicYearId: unit.yearId }).lean(),
      ExamPaper.find({ tenantId: school, academicYearId: unit.yearId, classIds: place.classId }).lean(),
      childrenOf(tenantId, unit),
      ExamMark.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { tenantId: school, academicYearId: unit.yearId, ...place } }, { $group: { _id: "$paperId", n: { $sum: 1 } } }]),
    ]);
    const [names, holidays] = await Promise.all([subjectNames(school, papers.map((p) => p.subjectId)), holidayNamesOn(tenantId, [...new Set(papers.map((p) => toDay(p.date)))])]);
    const markedBy = new Map(marked.map((m) => [m._id.toString(), m.n]));
    const today = todayInIndia();
    const items = examsWith<ClassPaperDto>(
      exams,
      groupByExam(papers, (p) => ({
        ...baseOf(p, names),
        held: toDay(p.date) <= today,
        canWrite: access.all || access.subjects.has(p.subjectId.toString()),
        marked: markedBy.get(p._id.toString()) ?? 0,
        children: children.length,
        holiday: holidays.get(toDay(p.date)) ?? null,
      })),
      today
    );
    return { label: unit.label, items, week: await examWeekOf(tenantId, unit.yearId, unit.classId, query.date ?? today) };
  }
}

/** The exams of one child for their parent: the papers of the child's class, the child's own results, and the exam days of the week. */
export class ChildExamsService {
  static async get(tenantId: string, userId: string, studentId: string, query: ChildExamsQuery): Promise<{ items: ChildExamDto[]; week: ExamWeekDto }> {
    const { student } = await ParentService.childOf(tenantId, userId, studentId);
    const school = asId(tenantId);
    const today = todayInIndia();
    const yearId = await AcademicYearService.activeYearId(school);
    if (!yearId) return { items: [], week: { ...weekOf(query.date ?? today), days: [] } };
    const place = (await placesOf(school, yearId, [student._id])).get(student._id.toString());
    // The child's results stay theirs when they change class: their marked papers are read whatever class they are in now.
    const results = await ExamMark.find({ tenantId: school, academicYearId: yearId, studentId: student._id }).lean();
    const resultOf = new Map(results.map((r) => [r.paperId.toString(), r]));
    const [exams, papers] = await Promise.all([
      Exam.find({ tenantId: school, academicYearId: yearId }).lean(),
      ExamPaper.find({
        tenantId: school,
        academicYearId: yearId,
        $or: [...(place ? [{ classIds: asId(place.classId) }] : []), { _id: { $in: results.map((r) => r.paperId) } }],
      }).lean(),
    ]);
    const names = await subjectNames(school, papers.map((p) => p.subjectId));
    const items = examsWith<ChildPaperDto>(
      exams,
      groupByExam(papers, (p) => {
        const mine = resultOf.get(p._id.toString());
        const max = p.maxMarks ?? null;
        return {
          ...baseOf(p, names),
          result: mine ? { marks: mine.absent ? null : mine.marks, absent: mine.absent, percent: !mine.absent && mine.marks !== null && max ? percentOf(mine.marks, max) : null } : null,
        };
      }),
      today
    ).map((e) => {
      const counted = e.papers.filter((p) => p.result && !p.result.absent && p.result.marks !== null && p.maxMarks);
      const marks = counted.reduce((sum, p) => sum + p.result!.marks!, 0);
      const outOf = counted.reduce((sum, p) => sum + p.maxMarks!, 0);
      return { ...e, summary: counted.length === 0 ? null : { marks, outOf, percent: percentOf(marks, outOf), papers: counted.length } };
    });
    const week = place ? await examWeekOf(tenantId, yearId, place.classId, query.date ?? today) : { ...weekOf(query.date ?? today), days: [] };
    return { items, week };
  }
}
