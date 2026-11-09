import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { accessTo } from "../../classroom/services/access";
import { childrenOf } from "../../classroom/services/children";
import type { Caller } from "../../classroom/services/leave.service";
import { Notify } from "../../notifications/services/events";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { Subject } from "../../subjects/models/Subject";
import { resolveUnit } from "../../timetable/services/unit";
import { minutesToClock } from "../../timetable/time";
import { User } from "../../users/models/User";
import { Exam } from "../models/Exam";
import { ExamMark } from "../models/ExamMark";
import { ExamPaper, type IExamPaper } from "../models/ExamPaper";
import type { MarksSheetQuery, SaveExamMarksInput } from "../schemas/exams.schemas";
import { PAPER_NOT_FOUND, asId, toDay } from "./dto";

const NOT_THEIRS = () => ApiError.forbidden("Only this subject's teacher, the class teacher or the school enters these marks.", "NOT_THEIR_SUBJECT");

const percentOf = (marks: number, max: number) => Math.round((marks / max) * 100);
const averageOf = (values: number[]) => (values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

/** The marks sheet of one class (or section) in one paper: each child with their marks or absence, and whether the caller may write. */
export interface MarksSheetDto {
  paperId: string;
  label: string;
  exam: { id: string; name: string };
  subject: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  maxMarks: number | null;
  topic: string | null;
  /** The paper's day has come (marks are entered from that day on). */
  held: boolean;
  canWrite: boolean;
  marked: number;
  average: number | null;
  students: { id: string; name: string; admissionNumber: string; rollNumber: number | null; marks: number | null; absent: boolean }[];
}

/** The marks of an exam (2026-11-06): entered class by class after a paper is held, by the subject's teacher, the class teacher or the school. */
export class MarksService {
  private static async paperFor(tenantId: string, paperId: string, classId: string): Promise<IExamPaper> {
    const paper = Types.ObjectId.isValid(paperId) ? await ExamPaper.findOne({ _id: paperId, tenantId: asId(tenantId) }).lean() : null;
    // A paper that is not for this class is not this class's to see.
    if (!paper || !paper.classIds.some((c) => c.toString() === classId)) throw PAPER_NOT_FOUND();
    return paper;
  }

  static async sheet(tenantId: string, caller: Caller, paperId: string, query: MarksSheetQuery): Promise<MarksSheetDto> {
    const paper = await MarksService.paperFor(tenantId, paperId, query.classId);
    const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
    const access = await accessTo(tenantId, caller, unit);
    const school = asId(tenantId);
    const [children, exam, subject, rows] = await Promise.all([
      childrenOf(tenantId, unit),
      Exam.findOne({ _id: paper.examId, tenantId: school }).select("name").lean(),
      Subject.findOne({ _id: paper.subjectId, tenantId: school }).select("name").lean(),
      ExamMark.find({ tenantId: school, paperId: paper._id, classId: asId(unit.classId), sectionId: unit.sectionId ? asId(unit.sectionId) : null }).lean(),
    ]);
    const byChild = new Map(rows.map((r) => [r.studentId.toString(), r]));
    const students = children.map((c) => ({ ...c, marks: byChild.get(c.id)?.marks ?? null, absent: byChild.get(c.id)?.absent ?? false }));
    const entered = students.filter((c) => c.absent || c.marks !== null);
    const max = paper.maxMarks ?? null;
    return {
      paperId: paper._id.toString(),
      label: unit.label,
      exam: { id: paper.examId.toString(), name: exam?.name ?? "An exam" },
      subject: { id: paper.subjectId.toString(), name: subject?.name ?? "A subject" },
      date: toDay(paper.date),
      startTime: minutesToClock(paper.start),
      endTime: minutesToClock(paper.start + paper.duration),
      maxMarks: max,
      topic: paper.topic ?? null,
      held: toDay(paper.date) <= todayInIndia(),
      canWrite: access.all || access.subjects.has(paper.subjectId.toString()),
      marked: entered.length,
      average: max === null ? null : averageOf(students.flatMap((c) => (c.marks !== null && !c.absent ? [percentOf(c.marks, max)] : []))),
      students,
    };
  }

  /** Saves the marks of the children sent (the others keep theirs); marks and no absence, or neither, clears a child's result. */
  static async save(tenantId: string, caller: Caller, paperId: string, input: SaveExamMarksInput): Promise<MarksSheetDto> {
    const paper = await MarksService.paperFor(tenantId, paperId, input.classId);
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId ?? null);
    const access = await accessTo(tenantId, caller, unit);
    if (!(access.all || access.subjects.has(paper.subjectId.toString()))) throw NOT_THEIRS();
    if (paper.maxMarks === null || paper.maxMarks === undefined) throw ApiError.conflict("Set the marks this paper is out of first (change the paper), then enter the marks.", "NO_MAX_MARKS");
    if (toDay(paper.date) > todayInIndia()) throw ApiError.conflict("The marks are entered once the paper is held.", "PAPER_NOT_HELD");
    // A child named twice counts once, by the last line.
    const given = [...new Map(input.marks.map((m) => [m.studentId, m])).values()];
    const over = given.find((m) => !m.absent && m.marks !== null && m.marks > paper.maxMarks!);
    if (over) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "marks", message: `Marks are out of ${paper.maxMarks}` }]);
    const children = await childrenOf(tenantId, unit);
    const inClass = new Set(children.map((c) => c.id));
    if (given.some((m) => !inClass.has(m.studentId))) throw ApiError.badRequest("A child in this list is not in this class.", "NOT_IN_CLASS");

    const school = asId(tenantId);
    const user = await User.findById(caller.userId).select("name").lean();
    const by = { name: user?.name ?? "The school", role: caller.role };
    const place = { classId: asId(unit.classId), sectionId: unit.sectionId ? asId(unit.sectionId) : null };
    const before = new Map(
      (await ExamMark.find({ tenantId: school, paperId: paper._id, studentId: { $in: given.map((m) => asId(m.studentId)) } }).lean()).map((r) => [r.studentId.toString(), r])
    );

    const operations = given.map((m) => {
      const filter = { tenantId: school, paperId: paper._id, studentId: asId(m.studentId) };
      const marks = m.absent ? null : m.marks;
      if (!m.absent && marks === null) return { deleteOne: { filter } };
      return { updateOne: { filter, update: { $set: { academicYearId: paper.academicYearId, examId: paper.examId, ...place, marks, absent: m.absent, enteredBy: by } }, upsert: true } };
    });
    if (operations.length > 0) await ExamMark.bulkWrite(operations);

    const saved = await MarksService.sheet(tenantId, caller, paperId, { classId: input.classId, sectionId: input.sectionId ?? "none" });
    // The parents of the children whose result is new or different hear it; saving the same again tells nobody.
    const nameOf = new Map(saved.students.map((c) => [c.id, c.name]));
    const changed = given
      .map((m) => ({ id: m.studentId, name: nameOf.get(m.studentId) ?? "Your child", marks: m.absent ? null : m.marks, absent: m.absent }))
      .filter((m) => (m.absent || m.marks !== null) && ((before.get(m.id)?.marks ?? null) !== m.marks || (before.get(m.id)?.absent ?? false) !== m.absent));
    if (changed.length > 0) {
      Notify.examMarksSaved(tenantId, caller.userId, {
        unit: { classId: unit.classId, sectionId: unit.sectionId, label: unit.label },
        examName: saved.exam.name,
        subjectName: saved.subject.name,
        date: saved.date,
        maxMarks: paper.maxMarks,
        average: saved.average,
        by: by.name,
        changed,
      });
    }
    return saved;
  }
}
