import type { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { isDuplicateKey } from "../../academics/services/shared";
import { teacherOfUser } from "../../classroom/services/access";
import { Notify } from "../../notifications/services/events";
import { Teacher } from "../../staff/models/Teacher";
import { Enrolment } from "../../students/models/Enrolment";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { placeTitle } from "../../students/services/shared";
import { Subject } from "../../subjects/models/Subject";
import { minutesToClock } from "../../timetable/time";
import { Exam, type IExam } from "../models/Exam";
import { ExamDuty, roomKeyOf } from "../models/ExamDuty";
import { ExamPaper } from "../models/ExamPaper";
import { ExamRoom } from "../models/ExamRoom";
import type { DutyInput } from "../schemas/exams.schemas";
import { asId, toDay } from "./dto";
import { ExamService } from "./exam.service";

/**
 * Exam duty (2026-11-27, the user: "kis room mein kaun sa teacher rahega, duty rahegi; ek room mein 1 ya 2 teacher; jaise hi assign karun teacher ko
 * pata chal jaaye, aur exam se related time, date, room sab information mil jaaye"). One or two teachers watch a room (the name its runs share) for
 * the whole exam, and a teacher watches one room of an exam. The teacher hears it in the bell and reads it on their home (`mine`).
 */

type Detail = { path: string; message: string };
const invalid = (details: Detail[]) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", details);

export interface DutyTeacherDto {
  id: string;
  name: string;
}
export interface DutyDto {
  room: string;
  teachers: DutyTeacherDto[];
}

/** A room as the teacher on duty reads it: the exam, the room, who else watches it, who sits in it, and the days it has papers with the times. */
export interface MyDutyDto {
  exam: { id: string; name: string; startDate: string; endDate: string };
  room: string;
  /** The other teacher on duty there (none, or one). */
  with: string[];
  seats: { place: string; fromRoll: number; toRoll: number; students: number }[];
  students: number;
  days: { date: string; startTime: string; endTime: string; papers: { subject: string; classes: string[]; startTime: string; endTime: string }[] }[];
}

const teacherNames = async (school: Types.ObjectId, ids: Types.ObjectId[]) =>
  new Map((await Teacher.find({ tenantId: school, _id: { $in: ids } }).select("name").lean()).map((t) => [t._id.toString(), t.name]));

const factsOf = (exam: IExam) => ({ examName: exam.name, startDate: toDay(exam.startDate), endDate: toDay(exam.endDate) });

export class DutyService {
  /** The teachers of the school who can be put on duty (the ones still teaching here), by name. */
  static async teachers(tenantId: string): Promise<{ items: DutyTeacherDto[] }> {
    const teachers = await Teacher.find({ tenantId: asId(tenantId), isActive: true }).select("name").lean();
    return { items: teachers.map((t) => ({ id: t._id.toString(), name: t.name })).sort((a, b) => a.name.localeCompare(b.name)) };
  }

  /** The duties of an exam's rooms, in the order of `roomNames` (the rooms' names as the list shows them); a duty whose room is gone is left out. */
  static async ofRooms(tenantId: string, examId: Types.ObjectId, roomNames: string[]): Promise<DutyDto[]> {
    const school = asId(tenantId);
    const duties = await ExamDuty.find({ tenantId: school, examId }).lean();
    if (duties.length === 0) return [];
    const names = await teacherNames(school, duties.flatMap((d) => d.teacherIds));
    const byKey = new Map(duties.map((d) => [d.roomKey, d]));
    const seen = new Set<string>();
    const out: DutyDto[] = [];
    for (const room of roomNames) {
      const key = roomKeyOf(room);
      const duty = byKey.get(key);
      if (!duty || seen.has(key)) continue;
      seen.add(key);
      out.push({ room, teachers: duty.teacherIds.map((id) => ({ id: id.toString(), name: names.get(id.toString()) ?? "A teacher" })) });
    }
    return out;
  }

  /**
   * Puts these teachers (one or two; none clears it) on duty in a room of the exam: a room the exam has, teachers of the school, none of them on duty
   * in another room of this exam. The ones put on hear it, with who else is there; the ones taken off hear that.
   */
  static async save(tenantId: string, examId: string, input: DutyInput, actorId: string): Promise<DutyDto> {
    const school = asId(tenantId);
    const exam = await ExamService.find(tenantId, examId);
    const key = roomKeyOf(input.room);
    const run = (await ExamRoom.find({ tenantId: school, examId: exam._id }).select("room").sort({ createdAt: 1 }).lean()).find((r) => roomKeyOf(r.room) === key);
    if (!run) throw invalid([{ path: "room", message: `${input.room} is not in this exam` }]);

    const ids = input.teacherIds.map(asId);
    const teachers = ids.length === 0 ? [] : await Teacher.find({ tenantId: school, _id: { $in: ids }, isActive: true }).select("name").lean();
    if (teachers.length !== ids.length) throw invalid([{ path: "teacherIds", message: "Choose teachers of this school" }]);
    const nameOf = new Map(teachers.map((t) => [t._id.toString(), t.name]));
    if (ids.length > 0) {
      const elsewhere = await ExamDuty.findOne({ tenantId: school, examId: exam._id, roomKey: { $ne: key }, teacherIds: { $in: ids } }).lean();
      if (elsewhere) {
        const who = input.teacherIds.find((id) => elsewhere.teacherIds.some((t) => t.toString() === id))!;
        throw ApiError.conflict(`${nameOf.get(who)} is on duty in ${elsewhere.room} already`, "DUTY_TAKEN");
      }
    }

    const filter = { tenantId: school, examId: exam._id, roomKey: key };
    const before = await ExamDuty.findOne(filter).lean();
    if (ids.length === 0) await ExamDuty.deleteOne(filter);
    else {
      const write = () => ExamDuty.updateOne(filter, { $set: { room: run.room, teacherIds: ids }, $setOnInsert: { academicYearId: exam.academicYearId } }, { upsert: true });
      // Two saves of a new room's duty at once: the second finds the first's record and writes over it.
      await write().catch((err) => (isDuplicateKey(err) ? write() : Promise.reject(err)));
    }

    const had = (before?.teacherIds ?? []).map(String);
    const added = input.teacherIds.filter((id) => !had.includes(id));
    const removed = had.filter((id) => !input.teacherIds.includes(id));
    Notify.examDuty(tenantId, actorId, { change: "added", teacherIds: added, room: run.room, names: nameOf, ...factsOf(exam) });
    Notify.examDuty(tenantId, actorId, { change: "removed", teacherIds: removed, room: before?.room ?? run.room, ...factsOf(exam) });
    return { room: run.room, teachers: input.teacherIds.map((id) => ({ id, name: nameOf.get(id)! })) };
  }

  /**
   * A run of a room was renamed (`now`) or taken away (`now` null). While the room has other runs its duty stays. Its last run renamed: the duty moves
   * with it (unless the new room has a duty of its own, then it goes); its last run taken away: the duty goes. Its teachers hear it.
   */
  static async afterRunLeft(tenantId: string, exam: IExam, was: string, now: string | null, actorId: string): Promise<void> {
    const school = asId(tenantId);
    const oldKey = roomKeyOf(was);
    if (now !== null && roomKeyOf(now) === oldKey) return;
    const runs = await ExamRoom.find({ tenantId: school, examId: exam._id }).select("room").lean();
    if (runs.some((r) => roomKeyOf(r.room) === oldKey)) return;
    const duty = await ExamDuty.findOne({ tenantId: school, examId: exam._id, roomKey: oldKey }).lean();
    if (!duty) return;
    const teacherIds = duty.teacherIds.map(String);
    if (now !== null && !(await ExamDuty.exists({ tenantId: school, examId: exam._id, roomKey: roomKeyOf(now) }))) {
      const moved = await ExamDuty.updateOne({ tenantId: school, _id: duty._id }, { $set: { room: now, roomKey: roomKeyOf(now) } }).catch((err) => (isDuplicateKey(err) ? null : Promise.reject(err)));
      if (moved) {
        Notify.examDuty(tenantId, actorId, { change: "moved", teacherIds, room: now, was: duty.room, ...factsOf(exam) });
        return;
      }
    }
    await ExamDuty.deleteOne({ tenantId: school, _id: duty._id });
    Notify.examDuty(tenantId, actorId, { change: "removed", teacherIds, room: duty.room, ...factsOf(exam) });
  }

  /** The rooms the signed-in teacher watches in the exams of this year that are not over, the soonest first. A login that is no teacher's has none. */
  static async mine(tenantId: string, userId: string): Promise<{ items: MyDutyDto[] }> {
    const teacher = await teacherOfUser(tenantId, userId);
    const school = asId(tenantId);
    const yearId = teacher ? await AcademicYearService.activeYearId(school) : null;
    if (!teacher || !yearId) return { items: [] };
    const duties = await ExamDuty.find({ tenantId: school, academicYearId: yearId, teacherIds: teacher._id }).lean();
    if (duties.length === 0) return { items: [] };
    const today = todayInIndia();
    const exams = (await Exam.find({ tenantId: school, _id: { $in: duties.map((d) => d.examId) } }).lean()).filter((e) => toDay(e.endDate) >= today);
    if (exams.length === 0) return { items: [] };
    const examIds = exams.map((e) => e._id);
    const [runs, papers] = await Promise.all([ExamRoom.find({ tenantId: school, examId: { $in: examIds } }).lean(), ExamPaper.find({ tenantId: school, examId: { $in: examIds } }).lean()]);
    const classIds = [...new Set(runs.map((r) => r.classId.toString()))].map(asId);
    const [classes, sections, enrolments, subjects, names] = await Promise.all([
      SchoolClass.find({ tenantId: school, _id: { $in: classIds } }).select("name order").lean(),
      Section.find({ tenantId: school, _id: { $in: runs.flatMap((r) => (r.sectionId ? [r.sectionId] : [])) } }).select("name").lean(),
      Enrolment.find({ tenantId: school, academicYearId: yearId, classId: { $in: classIds }, status: "active", rollNumber: { $ne: null } }).select("classId sectionId rollNumber").lean(),
      Subject.find({ tenantId: school, _id: { $in: papers.map((p) => p.subjectId) } }).select("name").lean(),
      teacherNames(school, duties.flatMap((d) => d.teacherIds)),
    ]);
    const classOf = new Map(classes.map((c) => [c._id.toString(), c]));
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
    const same = (a: Types.ObjectId | null | undefined, b: Types.ObjectId | null | undefined) => String(a ?? "") === String(b ?? "");

    const items: MyDutyDto[] = [];
    for (const exam of exams) {
      for (const duty of duties.filter((d) => d.examId.equals(exam._id))) {
        const mine = runs
          .filter((r) => r.examId.equals(exam._id) && roomKeyOf(r.room) === duty.roomKey)
          .sort((a, b) => (classOf.get(a.classId.toString())?.order ?? 0) - (classOf.get(b.classId.toString())?.order ?? 0) || a.fromRoll - b.fromRoll);
        if (mine.length === 0) continue;
        const seats = mine.map((r) => ({
          place: placeTitle(classOf.get(r.classId.toString())?.name ?? "A class", r.sectionId ? (sectionName.get(r.sectionId.toString()) ?? null) : null),
          fromRoll: r.fromRoll,
          toRoll: r.toRoll,
          students: enrolments.filter((e) => same(e.classId, r.classId) && same(e.sectionId, r.sectionId) && e.rollNumber! >= r.fromRoll && e.rollNumber! <= r.toRoll).length,
        }));
        items.push({
          exam: { id: exam._id.toString(), name: exam.name, startDate: toDay(exam.startDate), endDate: toDay(exam.endDate) },
          room: duty.room,
          with: duty.teacherIds.filter((id) => !id.equals(teacher._id)).map((id) => names.get(id.toString()) ?? "A teacher"),
          seats,
          students: seats.reduce((n, s) => n + s.students, 0),
          days: DutyService.daysOf(
            papers.filter((p) => p.examId.equals(exam._id)),
            new Set(mine.map((r) => r.classId.toString())),
            (id) => classOf.get(id)?.name ?? "A class",
            (id) => subjectName.get(id) ?? "A subject"
          ),
        });
      }
    }
    items.sort((a, b) => a.exam.startDate.localeCompare(b.exam.startDate) || a.room.localeCompare(b.room, undefined, { numeric: true, sensitivity: "base" }));
    return { items };
  }

  /** The days the classes of a room write papers: each day from its first paper's start to its last one's end, with the papers (the room's classes only). */
  private static daysOf(papers: { date: Date; start: number; duration: number; subjectId: Types.ObjectId; classIds: Types.ObjectId[] }[], classIds: Set<string>, className: (id: string) => string, subject: (id: string) => string) {
    const days = new Map<string, { start: number; end: number; papers: { subject: string; classes: string[]; startTime: string; endTime: string; start: number }[] }>();
    for (const p of papers) {
      const classes = p.classIds.map(String).filter((id) => classIds.has(id));
      if (classes.length === 0) continue;
      const date = toDay(p.date);
      const day = days.get(date) ?? { start: p.start, end: p.start + p.duration, papers: [] };
      day.start = Math.min(day.start, p.start);
      day.end = Math.max(day.end, p.start + p.duration);
      day.papers.push({ subject: subject(p.subjectId.toString()), classes: classes.map(className), startTime: minutesToClock(p.start), endTime: minutesToClock(p.start + p.duration), start: p.start });
      days.set(date, day);
    }
    return [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        startTime: minutesToClock(d.start),
        endTime: minutesToClock(d.end),
        papers: d.papers.sort((a, b) => a.start - b.start || a.subject.localeCompare(b.subject)).map(({ start: _start, ...p }) => p),
      }));
  }
}
