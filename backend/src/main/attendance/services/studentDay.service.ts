import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { seatedIn } from "../../academics/services/viewedYear";
import { AttendanceDay, type AttendanceStatus } from "../../classroom/models/AttendanceDay";
import { LeaveRequest } from "../../classroom/models/LeaveRequest";
import { CalendarService } from "../../classroom/services/calendar.service";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { Enrolment } from "../../students/models/Enrolment";
import { Student } from "../../students/models/Student";
import { fullName } from "../../students/services/shared";
import { sectionedName, shownUnits } from "../../timetable/services/unit";
import type { DayQuery } from "../schemas/attendance.schemas";

type Counts = Record<AttendanceStatus, number>;
const none = (): Counts => ({ present: 0, absent: 0, late: 0, leave: 0 });
const countOf = (statuses: AttendanceStatus[]): Counts => {
  const counts = none();
  for (const s of statuses) counts[s] += 1;
  return counts;
};
const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const keyOf = (classId: string | Types.ObjectId, sectionId: string | Types.ObjectId | null | undefined) => `${String(classId)}:${sectionId ? String(sectionId) : "-"}`;

export interface DayLine {
  id: string;
  name: string;
  admissionNumber: string;
  rollNumber: number | null;
  /** The child's place in the whole class or section (1 is the first): the number a child with no roll number is shown under. */
  position: number;
  status: AttendanceStatus;
  reason: string | null;
}

export interface DayGroup {
  classId: string;
  sectionId: string | null;
  /** "Class 5" (one section, or none), "Class 5A" (two or more). */
  label: string;
  classTeacher: { id: string; name: string } | null;
  /** The class teacher saved the day's sheet (a day the school marked one child at a time is not). */
  saved: boolean;
  /** Every child of the class or section, and their counts: a search narrows `students`, never these. */
  total: number;
  counts: Counts;
  students: DayLine[];
}

/**
 * The day of every class (2026-11-22, Attendance > Student for the school): the classes and sections of the year in teaching order, each with
 * its children (by roll number, then name) and their marks of the day, made the way one class's sheet is (`AttendanceService.sheet`): a mark
 * that was saved, else Leave for an approved leave, else Present where a day starts (the page shows a day nobody took as not taken). A class
 * picked is only that class (a section, only that section). A search keeps the children whose name, admission number or roll number holds the
 * words, as plain text, and leaves out a class with nobody found; the classes' numbers and the summary stay whole. A handful of reads for the
 * whole school, not one per class.
 */
export class StudentDayService {
  static async day(tenantId: string, query: DayQuery) {
    const school = asId(tenantId);
    const all = await shownUnits(tenantId);
    // How many sections each class has: a class with one is named as the class alone.
    const sectionsOf = new Map<string, number>();
    for (const u of all) if (u.sectionId) sectionsOf.set(u.classId, (sectionsOf.get(u.classId) ?? 0) + 1);

    let units = all;
    if (query.classId) {
      units = all.filter((u) => u.classId === query.classId);
      if (units.length === 0) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
      if (query.sectionId) {
        const sectionId = query.sectionId === "none" ? null : query.sectionId;
        units = units.filter((u) => u.sectionId === sectionId);
        if (units.length === 0) throw ApiError.notFound("Section not found", "SECTION_NOT_FOUND");
      }
    }

    const holidays = await CalendarService.holidaysBetween(school, query.date, query.date);
    const holiday = holidays[0] ? { title: holidays[0].title } : null;
    if (units.length === 0) return { date: query.date, holiday, groups: [] as DayGroup[], summary: { students: 0, classes: 0, taken: 0, counts: none() } };

    const yearId = units[0].yearId;
    const day = new Date(`${query.date}T00:00:00.000Z`);
    const classIds = [...new Set(units.map((u) => u.classId))].map(asId);
    const [enrolments, docs, heads] = await Promise.all([
      Enrolment.find({ tenantId: school, academicYearId: yearId, classId: { $in: classIds }, ...seatedIn(yearId) }).select("studentId classId sectionId rollNumber").lean(),
      AttendanceDay.find({ tenantId: school, classId: { $in: classIds }, date: day }).select("classId sectionId marks partial").lean(),
      ClassTeacher.find({ tenantId: school, academicYearId: yearId, classId: { $in: classIds } }).select("classId sectionId teacherId").lean(),
    ]);
    const studentIds = enrolments.map((e) => e.studentId);
    const [students, leaves, teachers] = await Promise.all([
      Student.find({ tenantId: school, _id: { $in: studentIds }, ...seatedIn(yearId) }).select("firstName lastName admissionNumber").lean(),
      studentIds.length === 0
        ? Promise.resolve([])
        : LeaveRequest.find({ tenantId: school, studentId: { $in: studentIds }, status: "approved", fromDate: { $lte: day }, toDate: { $gte: day } }).select("studentId").lean(),
      Teacher.find({ tenantId: school, _id: { $in: heads.map((h) => h.teacherId) } }).select("name").lean(),
    ]);

    const studentOf = new Map(students.map((s) => [s._id.toString(), s]));
    const onLeave = new Set(leaves.map((l) => l.studentId.toString()));
    const docOf = new Map(docs.map((d) => [keyOf(d.classId, d.sectionId), d]));
    const teacherName = new Map(teachers.map((t) => [t._id.toString(), t.name]));
    const headOf = new Map(heads.map((h) => [keyOf(h.classId, h.sectionId), h.teacherId.toString()]));
    const childrenOf = new Map<string, Omit<DayLine, "position" | "status" | "reason">[]>();
    for (const e of enrolments) {
      const s = studentOf.get(e.studentId.toString());
      if (!s) continue;
      const key = keyOf(e.classId, e.sectionId);
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), { id: s._id.toString(), name: fullName(s), admissionNumber: s.admissionNumber, rollNumber: e.rollNumber ?? null }]);
    }

    const word = (query.search ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const found = (c: DayLine) => c.name.toLowerCase().includes(word) || c.admissionNumber.toLowerCase().includes(word) || (c.rollNumber !== null && String(c.rollNumber).includes(word));
    const groups: DayGroup[] = [];
    const counts = none();
    let everyone = 0;
    let classes = 0;
    let taken = 0;
    for (const u of units) {
      const key = keyOf(u.classId, u.sectionId);
      const children = (childrenOf.get(key) ?? []).sort((a, b) => (a.rollNumber ?? 9999) - (b.rollNumber ?? 9999) || a.name.localeCompare(b.name));
      // A class or section with no child has nothing to show.
      if (children.length === 0) continue;
      const doc = docOf.get(key);
      const marks = new Map((doc?.marks ?? []).map((m) => [m.studentId.toString(), m]));
      const lines: DayLine[] = children.map((c, index) => ({
        ...c,
        position: index + 1,
        status: marks.get(c.id)?.status ?? (onLeave.has(c.id) ? "leave" : "present"),
        reason: marks.get(c.id)?.reason ?? null,
      }));
      const own = countOf(lines.map((l) => l.status));
      const saved = !!doc && !doc.partial;
      everyone += lines.length;
      classes += 1;
      // The summary counts the classes that were taken: a day nobody took is not everyone Present.
      if (saved) {
        taken += 1;
        for (const status of Object.keys(counts) as AttendanceStatus[]) counts[status] += own[status];
      }
      const shown = word ? lines.filter(found) : lines;
      if (word && shown.length === 0) continue;
      const head = headOf.get(key);
      groups.push({
        classId: u.classId,
        sectionId: u.sectionId,
        label: sectionedName(u.className, u.sectionName, sectionsOf.get(u.classId) ?? 0),
        classTeacher: head && teacherName.has(head) ? { id: head, name: teacherName.get(head)! } : null,
        saved,
        total: lines.length,
        counts: own,
        students: shown,
      });
    }
    return { date: query.date, holiday, groups, summary: { students: everyone, classes, taken, counts } };
  }
}
