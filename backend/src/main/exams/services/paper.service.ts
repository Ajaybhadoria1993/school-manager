import type { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { CalendarService } from "../../classroom/services/calendar.service";
import { Notify } from "../../notifications/services/events";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { Subject } from "../../subjects/models/Subject";
import { clockToMinutes, overlaps } from "../../timetable/time";
import { Exam, type IExam } from "../models/Exam";
import { ExamMark } from "../models/ExamMark";
import { ExamPaper, type IExamPaper } from "../models/ExamPaper";
import type { AddPapersInput, UpdatePaperInput } from "../schemas/exams.schemas";
import { PAPER_NOT_FOUND, asId, describePapers, fromDay, toDay, type PaperDto } from "./dto";
import { ExamService } from "./exam.service";
import { clock12, shortDay } from "./text";

type Detail = { path: string; message: string };
const invalid = (details: Detail[]) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", details);

/** One paper to put in an exam, with the times as minutes after midnight. */
interface Row {
  subjectId: string;
  date: string;
  start: number;
  duration: number;
}

/** Where a problem of row `i` is reported: "papers.1.date" when several rows are added, plain "date" when one paper is changed. */
type PathOf = (i: number, field: "date" | "startTime" | "durationMinutes" | "subjectId") => string;

/** What goes in an exam: papers for some classes (the same date and time for all of them), changed or taken away one by one. */
export class PaperService {
  /** The papers of one timetable for the classes at once. All or nothing: everything is checked before the first is saved. */
  static async add(tenantId: string, examId: string, input: AddPapersInput, actorId: string): Promise<{ items: PaperDto[] }> {
    const exam = await ExamService.find(tenantId, examId);
    const rows: Row[] = input.papers.map((p) => ({ subjectId: p.subjectId, date: p.date, start: clockToMinutes(p.startTime)!, duration: p.durationMinutes }));
    const classNames = await PaperService.checkClassesAndSubjects(tenantId, input.classIds, rows.map((r) => r.subjectId), (i, f) => `papers.${i}.${f}`);
    PaperService.checkRows(exam, rows, (i, f) => `papers.${i}.${f}`);
    await PaperService.checkHolidays(tenantId, rows);
    await PaperService.checkClashes(exam, input.classIds, classNames, rows);

    const made = await ExamPaper.insertMany(
      input.papers.map((p, i) => ({
        tenantId: asId(tenantId),
        academicYearId: exam.academicYearId,
        examId: exam._id,
        classIds: input.classIds.map(asId),
        subjectId: asId(p.subjectId),
        date: fromDay(rows[i].date),
        start: rows[i].start,
        duration: rows[i].duration,
        maxMarks: p.maxMarks ?? null,
        topic: p.topic ?? null,
      }))
    );
    const items = await describePapers(tenantId, made.map((m) => m.toObject()));
    // The parents and the teachers of these classes hear the timetable is out (the classes and the papers, as the page lists them).
    Notify.examTimetable(tenantId, actorId, {
      exam: { id: exam._id.toString(), name: exam.name },
      yearId: exam.academicYearId,
      classes: items[0].classes.map((c) => ({ id: c.id, name: c.name })),
      papers: items.map((p) => ({ subjectName: p.subject.name, date: p.date })),
    });
    return { items };
  }

  /** Changes what is sent of one paper; the same rules hold, and it does not clash with itself. */
  static async update(tenantId: string, examId: string, paperId: string, input: UpdatePaperInput, actorId: string): Promise<PaperDto> {
    const exam = await ExamService.find(tenantId, examId);
    const current = await PaperService.findPaper(tenantId, exam._id, paperId);
    const classIds = input.classIds ?? current.classIds.map((c) => c.toString());
    const row: Row = {
      subjectId: input.subjectId ?? current.subjectId.toString(),
      date: input.date ?? toDay(current.date),
      start: input.startTime ? clockToMinutes(input.startTime)! : current.start,
      duration: input.durationMinutes ?? current.duration,
    };
    await PaperService.marksStillFit(tenantId, current, { classIds, subjectId: row.subjectId, date: row.date, maxMarks: input.maxMarks });
    const classNames = await PaperService.checkClassesAndSubjects(tenantId, classIds, [row.subjectId], (_i, f) => f);
    PaperService.checkRows(exam, [row], (_i, f) => f);
    // A paper that stays on its day may stay on a holiday declared since: only a move to a day is checked against the holidays.
    if (row.date !== toDay(current.date)) await PaperService.checkHolidays(tenantId, [row]);
    await PaperService.checkClashes(exam, classIds, classNames, [row], current._id);

    const set: Record<string, unknown> = { classIds: classIds.map(asId), subjectId: asId(row.subjectId), date: fromDay(row.date), start: row.start, duration: row.duration };
    if (input.maxMarks !== undefined) set.maxMarks = input.maxMarks;
    if (input.topic !== undefined) set.topic = input.topic;
    const updated = await ExamPaper.findOneAndUpdate({ _id: current._id, tenantId: asId(tenantId), examId: exam._id }, { $set: set }, { new: true }).lean();
    if (!updated) throw PAPER_NOT_FOUND();
    const dto = (await describePapers(tenantId, [updated]))[0];

    // Whoever the paper is (still) for hears what it is now; the classes taken off it hear it is taken off. Saving the same again tells nobody.
    const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
    const wasClasses = current.classIds.map((c) => c.toString());
    const differs =
      !same(current.subjectId, updated.subjectId) ||
      toDay(current.date) !== toDay(updated.date) ||
      current.start !== updated.start ||
      current.duration !== updated.duration ||
      !same(current.topic, updated.topic) ||
      !same(current.maxMarks, updated.maxMarks) ||
      wasClasses.slice().sort().join() !== classIds.slice().sort().join();
    if (differs) {
      const taken = wasClasses.filter((c) => !classIds.includes(c));
      Notify.examPaperChanged(tenantId, actorId, {
        exam: { id: exam._id.toString(), name: exam.name },
        yearId: exam.academicYearId,
        subjectName: dto.subject.name,
        when: `${shortDay(dto.date)}, ${clock12(updated.start)} to ${clock12(updated.start + updated.duration)}`,
        day: dto.date,
        now: dto.classes.map((c) => ({ id: c.id, name: c.name })),
        taken: await PaperService.namedClasses(tenantId, taken),
      });
    }
    return dto;
  }

  /** Marks entered for a paper hold it steady: its subject and the classes that have marks stay, it is not moved to a day that has not come, and it stays out of enough marks. */
  private static async marksStillFit(tenantId: string, current: IExamPaper, next: { classIds: string[]; subjectId: string; date: string; maxMarks: number | null | undefined }): Promise<void> {
    const entered = await ExamMark.find({ tenantId: asId(tenantId), paperId: current._id }).select("classId marks").lean();
    if (entered.length === 0) return;
    const held = (what: string) => ApiError.conflict(`Marks are entered for this paper: ${what}`, "PAPER_HAS_MARKS");
    if (next.subjectId !== current.subjectId.toString()) throw held("its subject cannot change");
    const kept = new Set(next.classIds);
    if (entered.some((m) => !kept.has(m.classId.toString()))) throw held("a class that has marks cannot be taken off it");
    if (next.date !== toDay(current.date) && next.date > todayInIndia()) throw held("it cannot be moved to a day that has not come");
    const top = entered.reduce((best, m) => (m.marks !== null && m.marks > best ? m.marks : best), -1);
    if (next.maxMarks === null && top >= 0) throw held("it must stay out of some marks");
    if (typeof next.maxMarks === "number" && top > next.maxMarks) throw ApiError.conflict(`Marks up to ${top} are entered: the paper cannot be out of less than ${top}`, "MARKS_ABOVE_MAX");
  }

  /** These classes with their names, in the school's order. */
  private static async namedClasses(tenantId: string, ids: string[]): Promise<{ id: string; name: string }[]> {
    if (ids.length === 0) return [];
    const classes = await SchoolClass.find({ tenantId: asId(tenantId), _id: { $in: ids.map(asId) } }).select("name order").sort({ order: 1 }).lean();
    return classes.map((c) => ({ id: c._id.toString(), name: c.name }));
  }

  static async remove(tenantId: string, examId: string, paperId: string, actorId: string): Promise<void> {
    const exam = await ExamService.find(tenantId, examId);
    const current = await PaperService.findPaper(tenantId, exam._id, paperId);
    await ExamMark.deleteMany({ tenantId: asId(tenantId), paperId: current._id });
    await ExamPaper.deleteOne({ _id: current._id, tenantId: asId(tenantId), examId: exam._id });
    const [subject, classes] = await Promise.all([
      Subject.findOne({ tenantId: asId(tenantId), _id: current.subjectId }).select("name").lean(),
      PaperService.namedClasses(tenantId, current.classIds.map((c) => c.toString())),
    ]);
    Notify.examPaperRemoved(tenantId, actorId, { exam: { id: exam._id.toString(), name: exam.name }, yearId: exam.academicYearId, subjectName: subject?.name ?? "A subject", day: toDay(current.date), classes });
  }

  private static async findPaper(tenantId: string, examId: Types.ObjectId, paperId: string): Promise<IExamPaper> {
    const paper = await ExamPaper.findOne({ _id: paperId, tenantId: asId(tenantId), examId }).lean();
    if (!paper) throw PAPER_NOT_FOUND();
    return paper;
  }

  /** The classes and subjects are this school's (a subject it still teaches). Returns each class's name, for the messages. */
  private static async checkClassesAndSubjects(tenantId: string, classIds: string[], subjectIds: string[], pathOf: PathOf): Promise<Map<string, { name: string; order: number }>> {
    const school = asId(tenantId);
    const subjects = [...new Set(subjectIds)];
    const [classes, found] = await Promise.all([
      SchoolClass.find({ tenantId: school, _id: { $in: classIds.map(asId) } }).select("name order").lean(),
      Subject.find({ tenantId: school, _id: { $in: subjects.map(asId) }, isActive: true }).select("_id").lean(),
    ]);
    const problems: Detail[] = [];
    if (classes.length !== classIds.length) problems.push({ path: "classIds", message: "Choose classes of this school" });
    const known = new Set(found.map((s) => s._id.toString()));
    subjectIds.forEach((id, i) => {
      if (!known.has(id)) problems.push({ path: pathOf(i, "subjectId"), message: "Choose a subject of this school" });
    });
    if (problems.length > 0) throw invalid(problems);
    return new Map(classes.map((c) => [c._id.toString(), { name: c.name, order: c.order }]));
  }

  /** Each paper is on a day of the exam, ends by midnight, and fits the school hours of a full exam. */
  private static checkRows(exam: IExam, rows: Row[], pathOf: PathOf): void {
    const first = toDay(exam.startDate);
    const last = toDay(exam.endDate);
    const problems: Detail[] = [];
    rows.forEach((row, i) => {
      if (row.date < first || row.date > last) {
        const days = first === last ? `${shortDay(first)}, the day of this exam` : `a day from ${shortDay(first)} to ${shortDay(last)}, the days of this exam`;
        problems.push({ path: pathOf(i, "date"), message: `Choose ${days}` });
      }
      const end = row.start + row.duration;
      if (end > 1440) problems.push({ path: pathOf(i, "durationMinutes"), message: "The paper must end by midnight" });
      else if (exam.schoolStart !== null && exam.schoolEnd !== null) {
        const message = `The paper must fall inside school time, ${clock12(exam.schoolStart)} to ${clock12(exam.schoolEnd)}`;
        if (row.start < exam.schoolStart) problems.push({ path: pathOf(i, "startTime"), message });
        else if (end > exam.schoolEnd) problems.push({ path: pathOf(i, "durationMinutes"), message });
      }
    });
    if (problems.length > 0) throw invalid(problems);
  }

  /** Nothing is set on a holiday: the school's own, or a standard one it has not taken off. */
  private static async checkHolidays(tenantId: string, rows: Row[]): Promise<void> {
    const days = rows.map((r) => r.date).sort();
    const holidays = await CalendarService.holidaysBetween(tenantId, days[0], days[days.length - 1]);
    for (const row of rows) {
      const holiday = holidays.find((h) => h.startDate <= row.date && h.endDate >= row.date);
      if (holiday) throw ApiError.conflict(`${shortDay(row.date)} is a holiday (${holiday.title}): choose another day`, "PAPER_ON_HOLIDAY");
    }
  }

  /** A class is never in two papers that overlap on one day: not among these rows, and not against any paper of the year (this exam's or another's). */
  private static async checkClashes(exam: IExam, classIds: string[], classNames: Map<string, { name: string; order: number }>, rows: Row[], ignore?: Types.ObjectId): Promise<void> {
    const span = (r: Row) => ({ start: r.start, end: r.start + r.duration });
    for (let a = 0; a < rows.length; a++) {
      for (let b = a + 1; b < rows.length; b++) {
        if (rows[a].date === rows[b].date && overlaps(span(rows[a]), span(rows[b]))) {
          throw ApiError.conflict(`Two papers in this list overlap on ${shortDay(rows[a].date)}: change one of the times`, "PAPER_CLASH");
        }
      }
    }
    const school = asId(String(exam.tenantId));
    const existing = await ExamPaper.find({
      tenantId: school,
      academicYearId: exam.academicYearId,
      date: { $in: [...new Set(rows.map((r) => r.date))].map(fromDay) },
      classIds: { $in: classIds.map(asId) },
      ...(ignore ? { _id: { $ne: ignore } } : {}),
    }).lean();
    const found = existing.find((e) => rows.some((r) => r.date === toDay(e.date) && overlaps(span(r), { start: e.start, end: e.start + e.duration })));
    if (!found) return;
    const [subject, exams] = await Promise.all([Subject.findOne({ tenantId: school, _id: found.subjectId }).select("name").lean(), Exam.findOne({ tenantId: school, _id: found.examId }).select("name").lean()]);
    const wanted = new Set(classIds);
    const className = found.classIds
      .map((c) => c.toString())
      .filter((c) => wanted.has(c))
      .map((c) => classNames.get(c)!)
      .sort((x, y) => x.order - y.order)[0]?.name;
    throw ApiError.conflict(
      `${className ?? "A class"} already has ${subject?.name ?? "a paper"} from ${clock12(found.start)} to ${clock12(found.start + found.duration)} on ${shortDay(toDay(found.date))} (${exams?.name ?? "another exam"})`,
      "PAPER_CLASH"
    );
  }
}
