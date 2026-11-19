import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { NOT_INACTIVE } from "../../academics/models/status";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { AttendanceDay } from "../../classroom/models/AttendanceDay";
import { Exam } from "../../exams/models/Exam";
import { ExamMark } from "../../exams/models/ExamMark";
import { ExamPaper } from "../../exams/models/ExamPaper";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { Enrolment } from "../../students/models/Enrolment";
import { Guardian } from "../../students/models/Guardian";
import { Student, type IStudent } from "../../students/models/Student";
import { fullName, placesOf, placeTitle, type PlaceDto } from "../../students/services/shared";
import { Subject } from "../../subjects/models/Subject";
import { Tenant } from "../../tenants/models/Tenant";
import { gradeOf, MAX_CLASS_DOCUMENTS } from "../constants";
import { ReportRemark } from "../models/ReportRemark";
import { DocumentSettingsService } from "./settings.service";
import { minutesToClock } from "../../timetable/time";
import { MAX_REMARK } from "../models/ReportRemark";
import { personOf } from "../../fees/services/studentConcession.service";
import { PhotoService } from "./photo.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const joined = (parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p && p.trim() !== "").join(", ");
const round1 = (n: number) => Math.round(n * 10) / 10;
const STUDENT_NOT_FOUND = () => ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
const NO_YEAR = () => ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");

/** The top of every document: who the school is, where, how to reach it, its board, and where its logo is (the logo has a public address). */
export interface SchoolHeaderDto {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** "CBSE", "M.P. Board"... */
  board: string | null;
  affiliationNumber: string | null;
  logoUrl: string;
}

export interface IdCardDto {
  school: SchoolHeaderDto;
  /** The session the card is valid for. */
  year: { name: string; endDate: string };
  student: {
    id: string;
    name: string;
    admissionNumber: string;
    rollNumber: number | null;
    classLabel: string | null;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string | null;
    address: string | null;
    photo: string | null;
  };
  guardian: { name: string; relation: string; mobile: string | null } | null;
}

export interface ReportSubjectDto {
  subject: string;
  /** Marks got in the subject's papers of this exam; null when no mark is in yet. */
  marks: number | null;
  /** What the papers with a result are out of (a paper with no result is left out of both). */
  outOf: number;
  absent: boolean;
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
}

export interface ReportCardDto {
  school: SchoolHeaderDto;
  year: { name: string };
  exam: { id: string; name: string; kind: string; startDate: string; endDate: string };
  student: { id: string; name: string; admissionNumber: string; rollNumber: number | null; className: string | null; sectionName: string | null; dateOfBirth: string; gender: string; fatherName: string | null; motherName: string | null; photo: string | null };
  subjects: ReportSubjectDto[];
  /** Null while no subject has a mark in. */
  totals: { marks: number; outOf: number; percent: number; grade: string; result: "pass" | "fail" } | null;
  attendance: { present: number; absent: number; late: number; leave: number; days: number; percent: number | null };
  classTeacher: string | null;
  /** Said on the card: the pass mark the result was worked out with, and the school's scale. */
  passPercent: number;
  gradeBands: { min: number; grade: string }[];
  /** The child's place among the class's children who have a total in this exam; null when the school does not show it or the child has no total. */
  rank: { position: number; of: number } | null;
  /** What the class teacher wrote for this exam. */
  remark: string | null;
  principalName: string | null;
  generatedOn: string;
}

export interface AdmitCardDto {
  school: SchoolHeaderDto;
  year: { name: string };
  exam: { id: string; name: string; kind: string; startDate: string; endDate: string };
  student: { id: string; name: string; admissionNumber: string; rollNumber: number | null; classLabel: string | null; dateOfBirth: string; gender: string; fatherName: string | null; photo: string | null };
  /** The class's papers in this exam, in the order they are written. */
  papers: { date: string; day: string; subject: string; start: string; end: string; durationMinutes: number; maxMarks: number | null }[];
  principalName: string | null;
  instructions: string[];
}

/** What every admit card says to the candidate. */
const ADMIT_INSTRUCTIONS = [
  "Bring this admit card to every paper.",
  "Be in the exam room 15 minutes before the paper starts.",
  "Bring your own pen, pencil and other things the paper needs. Borrowing is not allowed.",
  "Phones and other devices are not allowed in the exam room.",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type StudentRow = Pick<IStudent, "_id" | "firstName" | "lastName" | "admissionNumber" | "gender" | "dateOfBirth" | "bloodGroup" | "address" | "guardians">;
const STUDENT_FIELDS = "firstName lastName admissionNumber gender dateOfBirth bloodGroup address guardians";

/**
 * Documents (2026-11-19): the ID card and the exam report card of a student, built from what the app keeps (the student, the school's profile and
 * logo, the exam marks, the attendance). They are data, not files: the screen lays them out and the browser prints them (so they can also be saved as
 * a PDF). One student, or every student of a class (or a section) at once for printing together.
 */
export class DocumentsService {
  // ---- the school's header ------------------------------------------------------------------------------------------------------------------
  static async header(school: Types.ObjectId): Promise<SchoolHeaderDto> {
    const t = await Tenant.findById(school).select("name schoolEmail contactPhone address profile").lean();
    const a = t?.address;
    const entry = t?.profile?.boardEntries?.[0];
    const board = entry ? (entry.board === "State Board" ? (entry.stateBoard ?? entry.board) : entry.board === "Other" ? (entry.otherBoard ?? "Other board") : entry.board) : null;
    return {
      name: t?.name ?? "",
      address: joined([a?.line1, a?.line2, a?.city, a?.district, a?.state, a?.pincode]) || null,
      phone: t?.contactPhone ?? null,
      email: t?.schoolEmail ?? null,
      board,
      affiliationNumber: entry?.affiliationNumber ?? null,
      logoUrl: t?.profile?.logoUpdatedAt ? `/public/schools/${school.toString()}/logo?v=${new Date(t.profile.logoUpdatedAt).getTime()}` : "",
    };
  }

  private static async runningYear(school: Types.ObjectId) {
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name endDate").lean();
    if (!year) throw NO_YEAR();
    return year;
  }

  // ---- what to choose from ----------------------------------------------------------------------------------------------------------------
  /** The classes (with their sections) and the exams of the running session, for the Documents page's boxes. */
  static async options(tenantId: string) {
    const school = asId(tenantId);
    const yearId = await AcademicYearService.activeYearId(school);
    const [classes, sections, exams] = await Promise.all([
      SchoolClass.find({ tenantId: school, ...NOT_INACTIVE }).sort({ order: 1, nameKey: 1 }).select("name").lean(),
      yearId ? Section.find({ tenantId: school, academicYearId: yearId }).sort({ nameKey: 1 }).select("name classId").lean() : Promise.resolve([]),
      yearId ? Exam.find({ tenantId: school, academicYearId: yearId }).sort({ startDate: -1 }).select("name type startDate endDate").lean() : Promise.resolve([]),
    ]);
    return {
      classes: classes.map((c) => ({ id: c._id.toString(), name: c.name, sections: sections.filter((s) => s.classId.equals(c._id)).map((s) => ({ id: s._id.toString(), name: s.name })) })),
      exams: exams.map((e) => ({ id: e._id.toString(), name: e.name, kind: e.type, startDate: dayOf(e.startDate), endDate: dayOf(e.endDate) })),
    };
  }

  // ---- who is in a class ------------------------------------------------------------------------------------------------------------------
  /** The active students of a class (or one of its sections) this session, by roll number then name; at most MAX_CLASS_DOCUMENTS. */
  private static async classStudents(school: Types.ObjectId, classId: string, sectionId?: string) {
    const yearId = await AcademicYearService.activeYearId(school);
    if (!yearId) throw NO_YEAR();
    if (!Types.ObjectId.isValid(classId) || !(await SchoolClass.exists({ _id: classId, tenantId: school }))) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    const enrolments = await Enrolment.find({ tenantId: school, academicYearId: yearId, classId: asId(classId), status: "active", ...(sectionId ? { sectionId: asId(sectionId) } : {}) }).lean();
    const students = await Student.find({ tenantId: school, status: "active", _id: { $in: enrolments.map((e) => e.studentId) } }).select(STUDENT_FIELDS).lean();
    const roll = new Map(enrolments.map((e) => [e.studentId.toString(), e.rollNumber ?? Number.MAX_SAFE_INTEGER]));
    const sorted = students.sort((a, b) => roll.get(a._id.toString())! - roll.get(b._id.toString())! || fullName(a).localeCompare(fullName(b)));
    if (sorted.length > MAX_CLASS_DOCUMENTS) {
      throw ApiError.badRequest(`This group has ${sorted.length} students. Choose a section, up to ${MAX_CLASS_DOCUMENTS} at a time.`, "TOO_MANY_STUDENTS");
    }
    return sorted;
  }

  private static async studentOf(school: Types.ObjectId, studentId: string) {
    const student = Types.ObjectId.isValid(studentId) ? await Student.findOne({ _id: studentId, tenantId: school, status: "active" }).select(STUDENT_FIELDS).lean() : null;
    if (!student) throw STUDENT_NOT_FOUND();
    return student;
  }

  // ---- the ID card --------------------------------------------------------------------------------------------------------------------------
  private static async cardsOf(school: Types.ObjectId, students: StudentRow[]): Promise<IdCardDto[]> {
    if (students.length === 0) return [];
    const year = await DocumentsService.runningYear(school);
    const ids = students.map((s) => s._id);
    const primary = students.flatMap((s) => {
      const link = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0];
      return link ? [link.guardianId] : [];
    });
    const [header, places, photos, guardians] = await Promise.all([
      DocumentsService.header(school),
      placesOf(school, year._id, ids),
      PhotoService.manyOf(school, ids),
      Guardian.find({ tenantId: school, _id: { $in: primary } }).select("name mobile").lean(),
    ]);
    const guardianById = new Map(guardians.map((g) => [g._id.toString(), g]));
    return students.map((s) => {
      const place: PlaceDto | undefined = places.get(s._id.toString());
      const link = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0];
      const g = link ? guardianById.get(link.guardianId.toString()) : undefined;
      const a = s.address;
      return {
        school: header,
        year: { name: year.name, endDate: dayOf(year.endDate) },
        student: {
          id: s._id.toString(),
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          rollNumber: place?.rollNumber ?? null,
          classLabel: place ? placeTitle(place.className, place.sectionName) : null,
          dateOfBirth: dayOf(s.dateOfBirth),
          gender: s.gender,
          bloodGroup: s.bloodGroup ?? null,
          address: joined([a?.line1, a?.line2, a?.city, a?.state, a?.pincode]) || null,
          photo: photos.get(s._id.toString()) ?? null,
        },
        guardian: g && link ? { name: g.name, relation: link.relation, mobile: g.mobile } : null,
      };
    });
  }

  static async idCard(tenantId: string, studentId: string): Promise<IdCardDto> {
    const school = asId(tenantId);
    return (await DocumentsService.cardsOf(school, [await DocumentsService.studentOf(school, studentId)]))[0];
  }

  static async idCardsOfClass(tenantId: string, classId: string, sectionId?: string): Promise<{ items: IdCardDto[] }> {
    const school = asId(tenantId);
    return { items: await DocumentsService.cardsOf(school, await DocumentsService.classStudents(school, classId, sectionId)) };
  }

  // ---- the report card ----------------------------------------------------------------------------------------------------------------------
  /**
   * The place of each child in their class for an exam: the children with a total, by their percentage (the sum of their marks over the sum of what
   * those papers are out of), best first; children with the same percentage share a place and the next is skipped (1, 2, 2, 4). A child's class is the
   * one they are in now; an absent paper is left out of their total, as everywhere.
   */
  static async standings(school: Types.ObjectId, examId: Types.ObjectId, classIds: string[], papers: { _id: Types.ObjectId; maxMarks: number | null }[]): Promise<Map<string, { position: number; of: number }>> {
    const out = new Map<string, { position: number; of: number }>();
    if (classIds.length === 0) return out;
    const max = new Map(papers.map((p) => [p._id.toString(), p.maxMarks]));
    const enrolments = await Enrolment.find({ tenantId: school, status: "active", classId: { $in: classIds.map(asId) } }).select("studentId classId").lean();
    const classOf = new Map(enrolments.map((e) => [e.studentId.toString(), e.classId.toString()]));
    const marks = await ExamMark.find({ tenantId: school, examId, studentId: { $in: enrolments.map((e) => e.studentId) } }).lean();
    const sums = new Map<string, { got: number; of: number }>();
    for (const m of marks) {
      const outOf = max.get(m.paperId.toString());
      if (m.absent || m.marks === null || !outOf) continue;
      const t = sums.get(m.studentId.toString()) ?? { got: 0, of: 0 };
      sums.set(m.studentId.toString(), { got: t.got + m.marks, of: t.of + outOf });
    }
    const byClass = new Map<string, { id: string; ratio: number }[]>();
    for (const [id, t] of sums) {
      const cls = classOf.get(id);
      if (cls && t.of > 0) byClass.set(cls, [...(byClass.get(cls) ?? []), { id, ratio: t.got / t.of }]);
    }
    for (const list of byClass.values()) {
      for (const mine of list) out.set(mine.id, { position: 1 + list.filter((o) => o.ratio > mine.ratio + 1e-9).length, of: list.length });
    }
    return out;
  }

  /**
   * Each child's report card for one exam. A subject's marks are the sum of its papers in the exam that have a result (an absent paper has none and is
   * left out, the same rule as everywhere); a subject passes from PASS_PERCENT up; the exam's result is a pass when every subject with a mark passes.
   * A paper with no marks entered yet is not counted, so the card says what is in. Results are read by child, so a child who changed class keeps theirs.
   */
  private static async reportsOf(school: Types.ObjectId, students: StudentRow[], examId: string): Promise<ReportCardDto[]> {
    if (students.length === 0) return [];
    const exam = Types.ObjectId.isValid(examId) ? await Exam.findOne({ _id: examId, tenantId: school }).lean() : null;
    if (!exam) throw ApiError.notFound("This exam is not on the school's list any more", "EXAM_NOT_FOUND");
    const year = await DocumentsService.runningYear(school);
    const ids = students.map((s) => s._id);
    const [settings, remarks, header, places, photos, marks, papers, attendance] = await Promise.all([
      DocumentSettingsService.get(school),
      ReportRemark.find({ tenantId: school, examId: exam._id, studentId: { $in: ids } }).lean(),
      DocumentsService.header(school),
      placesOf(school, year._id, ids),
      PhotoService.manyOf(school, ids),
      ExamMark.find({ tenantId: school, examId: exam._id, studentId: { $in: ids } }).lean(),
      ExamPaper.find({ tenantId: school, examId: exam._id }).lean(),
      AttendanceDay.find({ tenantId: school, academicYearId: year._id, "marks.studentId": { $in: ids } }).select("marks").lean(),
    ]);
    const remarkOf = new Map(remarks.map((r) => [r.studentId.toString(), r.remark]));
    const standing = settings.showRank ? await DocumentsService.standings(school, exam._id, [...new Set([...places.values()].map((p) => p.classId))], papers) : new Map<string, { position: number; of: number }>();
    const subjects = await Subject.find({ tenantId: school, _id: { $in: papers.map((p) => p.subjectId) } }).select("name").lean();
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
    const paperById = new Map(papers.map((p) => [p._id.toString(), p]));

    // Parents' names for the card, from the guardian links (a guardian's relation is on the link).
    const links = students.flatMap((s) => s.guardians.map((g) => g.guardianId));
    const guardians = await Guardian.find({ tenantId: school, _id: { $in: links } }).select("name").lean();
    const guardianName = new Map(guardians.map((g) => [g._id.toString(), g.name]));

    // Class teachers, by class and section.
    const teacherLinks = await ClassTeacher.find({ tenantId: school, academicYearId: year._id }).lean();
    const teachers = await Teacher.find({ tenantId: school, _id: { $in: teacherLinks.map((t) => t.teacherId) } }).select("name").lean();
    const teacherName = new Map(teachers.map((t) => [t._id.toString(), t.name]));
    const classTeacherOf = (place: PlaceDto | undefined) => {
      if (!place) return null;
      const link = teacherLinks.find((t) => t.classId.toString() === place.classId && (t.sectionId ? t.sectionId.toString() : null) === place.sectionId);
      return link ? (teacherName.get(link.teacherId.toString()) ?? null) : null;
    };

    return students.map((s) => {
      const sid = s._id.toString();
      const mine = marks.filter((m) => m.studentId.equals(s._id));
      // Every subject the exam has a paper in for this child's class, even when no mark is in yet.
      const place = places.get(sid);
      const classPapers = papers.filter((p) => (place ? p.classIds.some((c) => c.toString() === place.classId) : false) || mine.some((m) => m.paperId.equals(p._id)));
      const bySubject = new Map<string, { marks: number; outOf: number; counted: number; absent: boolean }>();
      for (const p of classPapers) {
        const key = p.subjectId.toString();
        const entry = bySubject.get(key) ?? { marks: 0, outOf: 0, counted: 0, absent: false };
        const result = mine.find((m) => m.paperId.equals(p._id));
        if (result?.absent) entry.absent = true;
        else if (result && result.marks !== null && p.maxMarks) {
          entry.marks += result.marks;
          entry.outOf += p.maxMarks;
          entry.counted += 1;
        }
        bySubject.set(key, entry);
      }
      const rows: ReportSubjectDto[] = [...bySubject.entries()]
        .map(([key, v]) => {
          const percent = v.counted > 0 && v.outOf > 0 ? Math.round((v.marks / v.outOf) * 100) : null;
          return {
            subject: subjectName.get(key) ?? "A subject",
            marks: v.counted > 0 ? v.marks : null,
            outOf: v.outOf,
            absent: v.absent && v.counted === 0,
            percent,
            grade: percent === null ? null : gradeOf(percent, settings.gradeBands),
            passed: percent === null ? null : percent >= settings.passPercent,
          };
        })
        .sort((a, b) => a.subject.localeCompare(b.subject));
      const counted = rows.filter((r) => r.marks !== null);
      const total = counted.reduce((t, r) => t + r.marks!, 0);
      const outOf = counted.reduce((t, r) => t + r.outOf, 0);
      const percent = outOf > 0 ? Math.round((total / outOf) * 100) : 0;

      const tally = { present: 0, absent: 0, late: 0, leave: 0 };
      for (const day of attendance) {
        const mark = day.marks.find((m) => m.studentId.equals(s._id));
        if (mark) tally[mark.status as keyof typeof tally] += 1;
      }
      const days = tally.present + tally.absent + tally.late + tally.leave;
      const father = s.guardians.find((g) => g.relation === "Father");
      const mother = s.guardians.find((g) => g.relation === "Mother");
      return {
        school: header,
        year: { name: year.name },
        exam: { id: exam._id.toString(), name: exam.name, kind: exam.type, startDate: dayOf(exam.startDate), endDate: dayOf(exam.endDate) },
        student: {
          id: sid,
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          rollNumber: place?.rollNumber ?? null,
          className: place?.className ?? null,
          sectionName: place?.sectionName ?? null,
          dateOfBirth: dayOf(s.dateOfBirth),
          gender: s.gender,
          fatherName: father ? (guardianName.get(father.guardianId.toString()) ?? null) : null,
          motherName: mother ? (guardianName.get(mother.guardianId.toString()) ?? null) : null,
          photo: photos.get(sid) ?? null,
        },
        subjects: rows,
        totals: counted.length === 0 ? null : { marks: round1(total), outOf, percent, grade: gradeOf(percent, settings.gradeBands), result: counted.every((r) => r.passed) ? "pass" : "fail" },
        // Late counts as there (the same rule as the parent's attendance).
        attendance: { ...tally, days, percent: days === 0 ? null : Math.round(((tally.present + tally.late) / days) * 100) },
        classTeacher: classTeacherOf(place),
        passPercent: settings.passPercent,
        gradeBands: settings.gradeBands,
        rank: counted.length === 0 ? null : (standing.get(sid) ?? null),
        remark: remarkOf.get(sid) ?? null,
        principalName: settings.principalName,
        generatedOn: dayOf(new Date()),
      };
    });
  }

  static async reportCard(tenantId: string, studentId: string, examId: string): Promise<ReportCardDto> {
    const school = asId(tenantId);
    return (await DocumentsService.reportsOf(school, [await DocumentsService.studentOf(school, studentId)], examId))[0];
  }

  static async reportCardsOfClass(tenantId: string, classId: string, examId: string, sectionId?: string): Promise<{ items: ReportCardDto[] }> {
    const school = asId(tenantId);
    return { items: await DocumentsService.reportsOf(school, await DocumentsService.classStudents(school, classId, sectionId), examId) };
  }

  // ---- the admit card (hall ticket) ----------------------------------------------------------------------------------------------------------
  /** Each child's admit card for one exam: who they are and the class's papers (subject, day, time) in the order they are written. */
  private static async admitsOf(school: Types.ObjectId, students: StudentRow[], examId: string): Promise<AdmitCardDto[]> {
    if (students.length === 0) return [];
    const exam = Types.ObjectId.isValid(examId) ? await Exam.findOne({ _id: examId, tenantId: school }).lean() : null;
    if (!exam) throw ApiError.notFound("This exam is not on the school's list any more", "EXAM_NOT_FOUND");
    const year = await DocumentsService.runningYear(school);
    const ids = students.map((s) => s._id);
    const [settings, header, places, photos, papers] = await Promise.all([
      DocumentSettingsService.get(school),
      DocumentsService.header(school),
      placesOf(school, year._id, ids),
      PhotoService.manyOf(school, ids),
      ExamPaper.find({ tenantId: school, examId: exam._id }).sort({ date: 1, start: 1 }).lean(),
    ]);
    const subjects = await Subject.find({ tenantId: school, _id: { $in: papers.map((p) => p.subjectId) } }).select("name").lean();
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
    const links = students.flatMap((s) => s.guardians.map((g) => g.guardianId));
    const guardians = await Guardian.find({ tenantId: school, _id: { $in: links } }).select("name").lean();
    const guardianName = new Map(guardians.map((g) => [g._id.toString(), g.name]));
    return students.map((s) => {
      const place = places.get(s._id.toString());
      const father = s.guardians.find((g) => g.relation === "Father");
      return {
        school: header,
        year: { name: year.name },
        exam: { id: exam._id.toString(), name: exam.name, kind: exam.type, startDate: dayOf(exam.startDate), endDate: dayOf(exam.endDate) },
        student: {
          id: s._id.toString(),
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          rollNumber: place?.rollNumber ?? null,
          classLabel: place ? placeTitle(place.className, place.sectionName) : null,
          dateOfBirth: dayOf(s.dateOfBirth),
          gender: s.gender,
          fatherName: father ? (guardianName.get(father.guardianId.toString()) ?? null) : null,
          photo: photos.get(s._id.toString()) ?? null,
        },
        papers: papers
          .filter((p) => (place ? p.classIds.some((c) => c.toString() === place.classId) : false))
          .map((p) => ({
            date: dayOf(p.date),
            day: WEEKDAYS[p.date.getUTCDay()],
            subject: subjectName.get(p.subjectId.toString()) ?? "A subject",
            start: minutesToClock(p.start),
            end: minutesToClock(p.start + p.duration),
            durationMinutes: p.duration,
            maxMarks: p.maxMarks ?? null,
          })),
        principalName: settings.principalName,
        instructions: ADMIT_INSTRUCTIONS,
      };
    });
  }

  static async admitCard(tenantId: string, studentId: string, examId: string): Promise<AdmitCardDto> {
    const school = asId(tenantId);
    return (await DocumentsService.admitsOf(school, [await DocumentsService.studentOf(school, studentId)], examId))[0];
  }

  static async admitCardsOfClass(tenantId: string, classId: string, examId: string, sectionId?: string): Promise<{ items: AdmitCardDto[] }> {
    const school = asId(tenantId);
    return { items: await DocumentsService.admitsOf(school, await DocumentsService.classStudents(school, classId, sectionId), examId) };
  }

  // ---- the class teacher's remark ---------------------------------------------------------------------------------------------------------
  /** Writes (or, when empty, takes away) what is said on one child's report card for one exam. */
  static async saveRemark(tenantId: string, userId: string, input: { studentId: string; examId: string; remark: string }): Promise<{ remark: string | null }> {
    const school = asId(tenantId);
    const student = await DocumentsService.studentOf(school, input.studentId);
    const exam = Types.ObjectId.isValid(input.examId) ? await Exam.findOne({ _id: input.examId, tenantId: school }).select("_id").lean() : null;
    if (!exam) throw ApiError.notFound("This exam is not on the school's list any more", "EXAM_NOT_FOUND");
    const year = await DocumentsService.runningYear(school);
    if (input.remark.length > MAX_REMARK) throw ApiError.badRequest(`Keep the remark under ${MAX_REMARK} characters`, "VALIDATION_ERROR");
    if (input.remark === "") {
      await ReportRemark.deleteOne({ tenantId: school, examId: exam._id, studentId: student._id });
      return { remark: null };
    }
    const by = await personOf(userId);
    await ReportRemark.updateOne({ tenantId: school, examId: exam._id, studentId: student._id }, { $set: { remark: input.remark, writtenBy: by }, $setOnInsert: { tenantId: school, academicYearId: year._id } }, { upsert: true });
    return { remark: input.remark };
  }
}
