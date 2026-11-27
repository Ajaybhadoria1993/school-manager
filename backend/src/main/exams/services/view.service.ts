import { Types } from "mongoose";
import { SchoolClass } from "../../academics/models/SchoolClass";
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
import { ExamRoom } from "../models/ExamRoom";
import type { ChildExamsQuery, ClassExamsQuery } from "../schemas/exams.schemas";
import { isInAudience } from "./audience";
import { examWeekOf, weekOf, type ExamWeekDto } from "./days";
import { roomFor } from "./seating.service";
import { EXAMS_SCHOOL_WIDE, asId, toDay, toExamDto, type ExamDto } from "./dto";
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
  /** Where the child sits for it (2026-11-27): their roll number in their class and the room that holds it; null for a child with no class this year. */
  seat: { rollNumber: number | null; room: string | null } | null;
}

/** The exams a class reads: the ones for it (the whole school, its department, the class itself), and any other that has a paper for it. */
const forClass = (exams: IExam[], klass: { _id: Types.ObjectId; departmentId: Types.ObjectId | null } | null, withPapers: Set<string>) =>
  exams.filter((e) => withPapers.has(e._id.toString()) || (klass !== null && isInAudience(e, klass)));

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
    const access = await accessTo(tenantId, caller, unit, EXAMS_SCHOOL_WIDE);
    const school = asId(tenantId);
    const place = { classId: asId(unit.classId), sectionId: unit.sectionId ? asId(unit.sectionId) : null };
    const [allExams, papers, children, marked, klass] = await Promise.all([
      Exam.find({ tenantId: school, academicYearId: unit.yearId }).lean(),
      ExamPaper.find({ tenantId: school, academicYearId: unit.yearId, classIds: place.classId }).lean(),
      childrenOf(tenantId, unit),
      ExamMark.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { tenantId: school, academicYearId: unit.yearId, ...place } }, { $group: { _id: "$paperId", n: { $sum: 1 } } }]),
      SchoolClass.findOne({ tenantId: school, _id: place.classId }).select("departmentId").lean(),
    ]);
    // An exam for other classes (a department's, some classes') is not this class's (2026-11-26).
    const exams = forClass(allExams, klass, new Set(papers.map((p) => p.examId.toString())));
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
    const [allExams, papers, klass] = await Promise.all([
      Exam.find({ tenantId: school, academicYearId: yearId }).lean(),
      ExamPaper.find({
        tenantId: school,
        academicYearId: yearId,
        $or: [...(place ? [{ classIds: asId(place.classId) }] : []), { _id: { $in: results.map((r) => r.paperId) } }],
      }).lean(),
      place ? SchoolClass.findOne({ tenantId: school, _id: asId(place.classId) }).select("departmentId").lean() : null,
    ]);
    // Only the exams of the child's class (2026-11-26), and any other the child has a paper or a result in.
    const exams = forClass(allExams, klass, new Set(papers.map((p) => p.examId.toString())));
    const [names, rooms] = await Promise.all([
      subjectNames(school, papers.map((p) => p.subjectId)),
      place ? ExamRoom.find({ tenantId: school, examId: { $in: exams.map((e) => e._id) }, classId: asId(place.classId) }).lean() : [],
    ]);
    // Where the child sits for each exam: their roll number, and the room whose run holds it (2026-11-27).
    const seatOf = (examId: string) =>
      place ? { rollNumber: place.rollNumber ?? null, room: roomFor(rooms.filter((r) => r.examId.toString() === examId), { classId: place.classId, sectionId: place.sectionId }, place.rollNumber ?? null) } : null;
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
      return { ...e, summary: counted.length === 0 ? null : { marks, outOf, percent: percentOf(marks, outOf), papers: counted.length }, seat: seatOf(e.id) };
    });
    const week = place ? await examWeekOf(tenantId, yearId, place.classId, query.date ?? today) : { ...weekOf(query.date ?? today), days: [] };
    return { items, week };
  }
}
