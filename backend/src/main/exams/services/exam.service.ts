import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { isDuplicateKey } from "../../academics/services/shared";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { Notify } from "../../notifications/services/events";
import { clockToMinutes } from "../../timetable/time";
import { EXAM_TYPE_INFO, type ExamType } from "../constants";
import { Exam } from "../models/Exam";
import { ExamMark } from "../models/ExamMark";
import { ExamPaper } from "../models/ExamPaper";
import type { CreateExamInput, ListExamsQuery, UpdateExamInput } from "../schemas/exams.schemas";
import { EXAM_NOT_FOUND, asId, countPapers, describePapers, factsOf, fromDay, toDay, toExamDto, type ExamDetailDto, type ExamDto } from "./dto";
import { holidayNamesOn } from "./holidays";
import { sortExams } from "./status";
import { dayWithYear } from "./text";

type Detail = { path: string; message: string };
const invalid = (details: Detail[]) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", details);
const nameKeyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const EXISTS = (name: string) => ApiError.conflict(`There is already an exam called ${name} this year`, "EXAM_EXISTS");

/** What an exam is, with the hours as minutes after midnight (null: the school day is not changed). */
interface Shape {
  type: ExamType;
  startDate: string;
  endDate: string;
  schoolStart: number | null;
  schoolEnd: number | null;
}

/** The rules of the hours the school keeps during a full exam: both or neither, end after start, and not for a test. */
function hoursProblems(shape: Shape): Detail[] {
  const { schoolStart, schoolEnd } = shape;
  if (!EXAM_TYPE_INFO[shape.type].full) {
    return schoolStart !== null || schoolEnd !== null ? [{ path: "schoolStart", message: "School hours are for a full exam, not for a test" }] : [];
  }
  if ((schoolStart === null) !== (schoolEnd === null)) return [{ path: "schoolEnd", message: "Give the time the school starts and the time it ends" }];
  if (schoolStart !== null && schoolEnd !== null && schoolEnd <= schoolStart) return [{ path: "schoolEnd", message: "School must end after it starts" }];
  return [];
}

const minutesOrNull = (clock: string | null | undefined): number | null => (clock ? clockToMinutes(clock) : null);

/** Exams and tests of the school's active year (Test & Exam, Manage school). What each class writes is `PaperService`. */
export class ExamService {
  static async find(tenantId: string, id: string) {
    const exam = await Exam.findOne({ _id: id, tenantId: asId(tenantId) }).lean();
    if (!exam) throw EXAM_NOT_FOUND();
    return exam;
  }

  /** This year's exams (or those of a past year being looked at): the one that is on first, then the next ones, then the ones that are over. */
  static async list(tenantId: string, query: ListExamsQuery): Promise<{ items: ExamDto[] }> {
    const yearId = await AcademicYearService.shownYearId(tenantId);
    if (!yearId) return { items: [] };
    const school = asId(tenantId);
    const [exams, papers] = await Promise.all([
      Exam.find({ tenantId: school, academicYearId: yearId }).lean(),
      ExamPaper.find({ tenantId: school, academicYearId: yearId }).select("examId classIds").lean(),
    ]);
    const counts = countPapers(papers);
    const today = todayInIndia();
    const items = exams.map((e) => toExamDto(e, counts.get(e._id.toString()), today)).filter((e) => !query.status || e.status === query.status);
    return { items: sortExams(items) };
  }

  static async get(tenantId: string, id: string): Promise<ExamDetailDto> {
    const exam = await ExamService.find(tenantId, id);
    const papers = await ExamPaper.find({ tenantId: asId(tenantId), examId: exam._id }).lean();
    const described = await describePapers(tenantId, papers);
    // A holiday declared after a paper was set does not undo it: the paper says so, and the school moves it.
    const holidays = await holidayNamesOn(tenantId, [...new Set(described.map((p) => p.date))]);
    return { ...toExamDto(exam, countPapers(papers).get(exam._id.toString()), todayInIndia()), papers: described.map((p) => ({ ...p, holiday: holidays.get(p.date) ?? null })) };
  }

  static async create(tenantId: string, input: CreateExamInput, actorId: string): Promise<ExamDto> {
    const year = await ExamService.activeYear(tenantId);
    const shape: Shape = {
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate ?? input.startDate,
      schoolStart: minutesOrNull(input.schoolStart),
      schoolEnd: minutesOrNull(input.schoolEnd),
    };
    const problems = [...hoursProblems(shape), ...ExamService.insideYear(year, shape)];
    if (problems.length > 0) throw invalid(problems);
    try {
      const made = await Exam.create({
        tenantId: asId(tenantId),
        academicYearId: year.id,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        type: input.type,
        startDate: fromDay(shape.startDate),
        endDate: fromDay(shape.endDate),
        schoolStart: shape.schoolStart,
        schoolEnd: shape.schoolEnd,
        note: input.note ?? null,
      });
      const dto = toExamDto(made.toObject(), undefined, todayInIndia());
      Notify.examScheduled(tenantId, actorId, factsOf(dto));
      return dto;
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(input.name);
      throw err;
    }
  }

  /** Changes what is sent. The exam cannot be shortened, or its school hours narrowed, past a paper that is already in it. */
  static async update(tenantId: string, id: string, input: UpdateExamInput, actorId: string): Promise<ExamDto> {
    const current = await ExamService.find(tenantId, id);
    const type = input.type ?? current.type;
    const mentionsHours = input.schoolStart !== undefined || input.schoolEnd !== undefined;
    // A full exam turned into a test keeps no school hours (a day that goes on as usual) unless the change says so itself.
    const keepsHours = EXAM_TYPE_INFO[type].full || mentionsHours;
    const shape: Shape = {
      type,
      startDate: input.startDate ?? toDay(current.startDate),
      endDate: input.endDate ?? (input.startDate && input.startDate > toDay(current.endDate) ? input.startDate : toDay(current.endDate)),
      schoolStart: !keepsHours ? null : input.schoolStart !== undefined ? minutesOrNull(input.schoolStart) : current.schoolStart,
      schoolEnd: !keepsHours ? null : input.schoolEnd !== undefined ? minutesOrNull(input.schoolEnd) : current.schoolEnd,
    };
    const problems = [...(shape.endDate < shape.startDate ? [{ path: "endDate", message: "The last day cannot be before the first day" }] : []), ...hoursProblems(shape)];
    const year = await AcademicYear.findOne({ _id: current.academicYearId, tenantId: asId(tenantId) }).select("startDate endDate").lean();
    if (year) problems.push(...ExamService.insideYear({ start: toDay(year.startDate), end: toDay(year.endDate) }, shape));
    if (problems.length > 0) throw invalid(problems);
    await ExamService.papersStillFit(tenantId, current._id, shape);

    const set: Record<string, unknown> = {
      type,
      startDate: fromDay(shape.startDate),
      endDate: fromDay(shape.endDate),
      schoolStart: shape.schoolStart,
      schoolEnd: shape.schoolEnd,
    };
    if (input.name !== undefined) {
      set.name = input.name;
      set.nameKey = nameKeyOf(input.name);
    }
    if (input.note !== undefined) set.note = input.note;
    try {
      const updated = await Exam.findOneAndUpdate({ _id: id, tenantId: asId(tenantId) }, { $set: set }, { new: true }).lean();
      if (!updated) throw EXAM_NOT_FOUND();
      const papers = await ExamPaper.find({ tenantId: asId(tenantId), examId: updated._id }).select("examId classIds").lean();
      const dto = toExamDto(updated, countPapers(papers).get(updated._id.toString()), todayInIndia());
      // Everyone hears what the exam is now, but only when its name, kind, days or school hours really changed (a note, or the same save again, tells nobody).
      const differs =
        updated.name !== current.name ||
        updated.type !== current.type ||
        toDay(updated.startDate) !== toDay(current.startDate) ||
        toDay(updated.endDate) !== toDay(current.endDate) ||
        updated.schoolStart !== current.schoolStart ||
        updated.schoolEnd !== current.schoolEnd;
      if (differs) Notify.examChanged(tenantId, actorId, factsOf(dto));
      return dto;
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS(input.name ?? current.name);
      throw err;
    }
  }

  /** Takes the exam, its papers and the marks of its papers; the classes are free at those times again. */
  static async remove(tenantId: string, id: string, actorId: string): Promise<void> {
    const school = asId(tenantId);
    const exam = await ExamService.find(tenantId, id);
    await ExamMark.deleteMany({ tenantId: school, examId: exam._id });
    await ExamPaper.deleteMany({ tenantId: school, examId: exam._id });
    await Exam.deleteOne({ _id: exam._id, tenantId: school });
    Notify.examRemoved(tenantId, actorId, factsOf(toExamDto(exam, undefined, todayInIndia())));
  }

  private static async activeYear(tenantId: string) {
    const id = await AcademicYearService.activeYearId(tenantId);
    const year = id ? await AcademicYear.findOne({ _id: id, tenantId: asId(tenantId) }).select("startDate endDate").lean() : null;
    if (!year) throw ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");
    return { id: year._id, start: toDay(year.startDate), end: toDay(year.endDate) };
  }

  /** The exam falls inside the academic year, whose days are named in the message. */
  private static insideYear(year: { start: string; end: string }, shape: Shape): Detail[] {
    const where = `(${dayWithYear(year.start)} to ${dayWithYear(year.end)})`;
    const message = `The exam must fall inside the academic year ${where}`;
    if (shape.startDate < year.start || shape.startDate > year.end) return [{ path: "startDate", message }];
    if (shape.endDate > year.end) return [{ path: "endDate", message }];
    return [];
  }

  /** Refuses new days or school hours that leave papers of the exam outside them. */
  private static async papersStillFit(tenantId: string, examId: unknown, shape: Shape): Promise<void> {
    const papers = await ExamPaper.find({ tenantId: asId(tenantId), examId: asId(String(examId)) }).select("date start duration").lean();
    const count = (what: (p: (typeof papers)[number]) => boolean) => papers.filter(what).length;
    const outsideDays = count((p) => toDay(p.date) < shape.startDate || toDay(p.date) > shape.endDate);
    const outsideHours = shape.schoolStart === null || shape.schoolEnd === null ? 0 : count((p) => p.start < shape.schoolStart! || p.start + p.duration > shape.schoolEnd!);
    const say = (n: number, where: string) => `${n} ${n === 1 ? "paper falls" : "papers fall"} outside ${where}: move or delete ${n === 1 ? "it" : "them"} first`;
    if (outsideDays > 0) throw ApiError.conflict(say(outsideDays, "these days"), "PAPERS_OUTSIDE");
    if (outsideHours > 0) throw ApiError.conflict(say(outsideHours, "these school hours"), "PAPERS_OUTSIDE");
  }
}
