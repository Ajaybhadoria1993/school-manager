import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { Guardian } from "../../students/models/Guardian";
import { Student } from "../../students/models/Student";
import { fullName, placesOf, placeTitle, RECORD_FIELDS, type StudentDetailDto } from "../../students/services/shared";
import { StudentService } from "../../students/services/student.service";
import { Tenant } from "../../tenants/models/Tenant";
import { GridService } from "../../timetable/services/grid.service";

/** A child's class this year as the parent reads it ("Class 5 - A", roll 12). */
export interface ChildPlaceDto {
  className: string;
  sectionName: string | null;
  rollNumber: number | null;
  label: string;
}

export interface ChildSummaryDto {
  id: string;
  name: string;
  admissionNumber: string;
  gender: string;
  dateOfBirth: string;
  place: ChildPlaceDto | null;
}

/** One child as their parent sees them: the child's own record, not the school's bookkeeping (moves, own fields, logins, who did what). */
export interface ChildDetailDto extends ChildSummaryDto {
  firstName: string;
  lastName: string;
  admissionDate: string;
  bloodGroup: string | null;
  category: string | null;
  classTeacher: { name: string } | null;
  address: StudentDetailDto["address"];
  previousSchool: StudentDetailDto["previousSchool"];
  records: Record<string, unknown>;
  guardians: { name: string; relation: string; isPrimary: boolean; mobile: string | null; alternateMobile: string | null; email: string | null; occupation: string | null }[];
}

/** The week of the child's class as the school published it: days and times, and each period's subject, teacher and room. */
export interface ChildTimetableDto {
  label: string;
  status: "published";
  publishedAt: string | null;
  days: unknown[];
  cells: unknown[];
  allotments: { subjectId: string; subjectName: string; subjectCode: string | null; periodsPerWeek: number; teacherId: string | null }[];
  teachers: { id: string; name: string }[];
}

const CHILD_NOT_FOUND = () => ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");

const placeOf = (p: { className: string; sectionName: string | null; rollNumber: number | null } | null): ChildPlaceDto | null =>
  p ? { className: p.className, sectionName: p.sectionName, rollNumber: p.rollNumber, label: placeTitle(p.className, p.sectionName) } : null;

/**
 * What a signed-in parent sees (2026-11-04): their children at the school, each one's record, class teacher and published timetable. The
 * parent is the guardian whose login this is (Guardian.userId); every read is of that school and of that guardian's active children only,
 * so another family's child, or another school's, is simply not found.
 */
export class ParentService {
  private static async guardianOf(tenantId: string, userId: string) {
    return Guardian.findOne({ tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) }).lean();
  }

  /** This guardian's active child with this id (and the guardian), or not found: every parent read and write starts here. */
  static async childOf(tenantId: string, userId: string, studentId: string) {
    const guardian = await ParentService.guardianOf(tenantId, userId);
    if (!guardian || !Types.ObjectId.isValid(studentId)) throw CHILD_NOT_FOUND();
    const student = await Student.findOne({ _id: studentId, tenantId: new Types.ObjectId(tenantId), status: "active", "guardians.guardianId": guardian._id }).lean();
    if (!student) throw CHILD_NOT_FOUND();
    return { guardian, student };
  }

  static async children(tenantId: string, userId: string): Promise<{ parent: { name: string; school: string }; items: ChildSummaryDto[] }> {
    const school = new Types.ObjectId(tenantId);
    const [guardian, tenant] = await Promise.all([ParentService.guardianOf(tenantId, userId), Tenant.findById(school).select("name").lean()]);
    const parent = { name: guardian?.name ?? "", school: tenant?.name ?? "" };
    if (!guardian) return { parent, items: [] };
    const [yearId, kids] = await Promise.all([
      AcademicYearService.activeYearId(school),
      Student.find({ tenantId: school, status: "active", "guardians.guardianId": guardian._id }).select("firstName lastName admissionNumber gender dateOfBirth").lean(),
    ]);
    const places = await placesOf(school, yearId, kids.map((k) => k._id));
    const items = kids
      .map((k) => ({
        id: k._id.toString(),
        name: fullName(k),
        admissionNumber: k.admissionNumber,
        gender: k.gender,
        dateOfBirth: k.dateOfBirth.toISOString().slice(0, 10),
        place: placeOf(places.get(k._id.toString()) ?? null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { parent, items };
  }

  static async child(tenantId: string, userId: string, studentId: string): Promise<ChildDetailDto> {
    await ParentService.childOf(tenantId, userId, studentId);
    const s = await StudentService.get(tenantId, studentId);
    const yearId = await AcademicYearService.activeYearId(new Types.ObjectId(tenantId));
    let classTeacher: { name: string } | null = null;
    if (s.place && yearId) {
      const row = await ClassTeacher.findOne({
        tenantId: new Types.ObjectId(tenantId),
        academicYearId: yearId,
        classId: new Types.ObjectId(s.place.classId),
        sectionId: s.place.sectionId ? new Types.ObjectId(s.place.sectionId) : null,
      }).lean();
      const teacher = row ? await Teacher.findOne({ _id: row.teacherId, tenantId: new Types.ObjectId(tenantId) }).select("name").lean() : null;
      classTeacher = teacher ? { name: teacher.name } : null;
    }
    return {
      id: s.id,
      name: s.name,
      firstName: s.firstName,
      lastName: s.lastName,
      admissionNumber: s.admissionNumber,
      gender: s.gender,
      dateOfBirth: s.dateOfBirth,
      admissionDate: s.admissionDate,
      bloodGroup: s.bloodGroup ?? null,
      category: s.category ?? null,
      place: placeOf(s.place),
      classTeacher,
      address: s.address,
      previousSchool: s.previousSchool,
      records: Object.fromEntries([...RECORD_FIELDS.map((k) => [k, s[k] ?? null]), ["rteSeat", s.rteSeat], ["bpl", s.bpl]]),
      guardians: s.guardians.map((g) => ({ name: g.name, relation: g.relation, isPrimary: g.isPrimary, mobile: g.mobile, alternateMobile: g.alternateMobile, email: g.email, occupation: g.occupation })),
    };
  }

  /** The child's class's week, once the school has published it (null before that, or for a child with no class this year). */
  static async timetable(tenantId: string, userId: string, studentId: string): Promise<ChildTimetableDto | null> {
    await ParentService.childOf(tenantId, userId, studentId);
    const s = await StudentService.get(tenantId, studentId);
    if (!s.place) return null;
    let view;
    try {
      // Read as a teacher reads it: only a published timetable is given.
      view = await GridService.get(tenantId, "teacher", s.place.classId, s.place.sectionId);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) return null;
      throw err;
    }
    if (view.status !== "published") return null;
    const named = new Set([...view.allotments.flatMap((a) => (a.teacherId ? [a.teacherId] : [])), ...view.cells.flatMap((c) => c.lessons.flatMap((l) => (l.teacherId ? [l.teacherId] : [])))]);
    return {
      label: placeTitle(s.place.className, s.place.sectionName),
      status: "published",
      publishedAt: view.publishedAt,
      days: view.days,
      cells: view.cells,
      allotments: view.allotments.map((a) => ({ subjectId: a.subjectId, subjectName: a.subjectName, subjectCode: a.subjectCode, periodsPerWeek: a.periodsPerWeek, teacherId: a.teacherId })),
      teachers: view.teachers.filter((t) => named.has(t.id)).map((t) => ({ id: t.id, name: t.name })),
    };
  }
}
