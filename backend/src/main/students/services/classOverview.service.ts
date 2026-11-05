import { Types } from "mongoose";
import { StructureService } from "../../academics/services/structure.service";
import { ClassTeacherService, unitKeyOf } from "../../staff/services/classTeacher.service";
import { Enrolment } from "../models/Enrolment";
import type { ClassOverviewQuery } from "../schemas/students.schemas";

export type SeatState = "open" | "almost" | "full" | "unlimited";

/** How full a section is: open, "almost full" from 85%, full at its limit (or past it), unlimited when no limit was set. */
export function seatState(enrolled: number, capacity: number | null): { state: SeatState; percent: number } {
  if (capacity === null) return { state: "unlimited", percent: 0 };
  if (capacity <= 0) return { state: enrolled > 0 ? "full" : "open", percent: enrolled > 0 ? 100 : 0 };
  const percent = Math.min(100, Math.round((enrolled / capacity) * 100));
  return { state: enrolled >= capacity ? "full" : enrolled / capacity >= 0.85 ? "almost" : "open", percent };
}

export interface SectionOverviewDto {
  id: string;
  name: string;
  room: string | null;
  /** Null when the section has no limit. */
  capacity: number | null;
  enrolled: number;
  seatsLeft: number | null;
  state: SeatState;
  percent: number;
  /** The section's class teacher this year; null until the school picks one. */
  classTeacher: { id: string; name: string } | null;
}

export interface ClassOverviewDto {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  /** Every student of the class this year: its sections together, or the class as a whole when it has none. */
  students: number;
  /**
   * The class's seat limit, how many of them are still free, and how full it is: its sections' limits added up, or, for a class without
   * sections (or whose sections have no limit), the class's own seats; 0 when nothing is set.
   */
  seats: number;
  seatsLeft: number;
  percent: number;
  sections: SectionOverviewDto[];
  /** The class teacher of a class that has no sections (a split class has one for each section). */
  classTeacher: { id: string; name: string } | null;
}

export interface ClassOverview {
  academicYear: { id: string; name: string } | null;
  /** Every department of the school (for the department dropdown), whatever the filter. */
  departments: { id: string; name: string }[];
  /** The totals of the classes below (the filter's), not of the whole school. */
  summary: { classes: number; sections: number; students: number; seats: number; seatsLeft: number; fullSections: number };
  /** The classes that match, in teaching order. */
  classes: ClassOverviewDto[];
}

/** "Class  5" and "class 5" are the same words. */
const keyOf = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Every class of the school with what is in it this year: its department, its students, and each section's students, room and seats.
 * The filters (a department or `none`, one class, part of a class name) are applied here, so a screen asks for what it shows. One read
 * of the class layout and one pass over the year's enrolments; students who are not active are not counted.
 */
export class ClassOverviewService {
  static async get(tenantId: string, query: ClassOverviewQuery): Promise<ClassOverview> {
    const school = new Types.ObjectId(tenantId);
    const structure = await StructureService.get(tenantId);
    const departments = structure.departments.map((d) => ({ id: d.id, name: d.name }));
    const empty = { classes: [], summary: { classes: 0, sections: 0, students: 0, seats: 0, seatsLeft: 0, fullSections: 0 } };
    if (!structure.academicYear) return { academicYear: null, departments, ...empty };

    const counts = await Enrolment.aggregate<{ _id: { classId: Types.ObjectId; sectionId: Types.ObjectId | null }; n: number }>([
      { $match: { tenantId: school, academicYearId: new Types.ObjectId(structure.academicYear.id), status: "active" } },
      { $group: { _id: { classId: "$classId", sectionId: "$sectionId" }, n: { $sum: 1 } } },
    ]);
    const inSection = new Map<string, number>();
    const inClass = new Map<string, number>();
    for (const c of counts) {
      if (c._id.sectionId) inSection.set(c._id.sectionId.toString(), c.n);
      inClass.set(c._id.classId.toString(), (inClass.get(c._id.classId.toString()) ?? 0) + c.n);
    }
    const departmentName = new Map(departments.map((d) => [d.id, d.name]));
    const heads = await ClassTeacherService.ofYear(tenantId, structure.academicYear.id);
    const words = query.q ? keyOf(query.q) : "";

    const classes = structure.classes
      .filter((c) => (!query.classId || c.id === query.classId) && (!words || keyOf(c.name).includes(words)))
      .filter((c) => (!query.departmentId ? true : query.departmentId === "none" ? !c.departmentId : c.departmentId === query.departmentId))
      .map((c): ClassOverviewDto => {
        const sections = c.sections.map((s): SectionOverviewDto => {
          const enrolled = inSection.get(s.id) ?? 0;
          return {
            id: s.id,
            name: s.name,
            room: s.room,
            capacity: s.capacity,
            enrolled,
            seatsLeft: s.capacity === null ? null : Math.max(0, s.capacity - enrolled),
            ...seatState(enrolled, s.capacity),
            classTeacher: heads.get(unitKeyOf(c.id, s.id)) ?? null,
          };
        });
        const students = inClass.get(c.id) ?? 0;
        // The class's seat limit (2026-11-04): its sections' seats added up (3 sections of 40 = 120); a class without sections, or whose
        // sections have no limit, has its own (the seats set when it was made); nothing set: none (0).
        const limited = sections.filter((s) => s.capacity !== null);
        const bySections = limited.length > 0;
        const seats = bySections ? limited.reduce((sum, s) => sum + (s.capacity ?? 0), 0) : (c.capacity ?? 0);
        const used = bySections ? limited.reduce((sum, s) => sum + s.enrolled, 0) : students;
        return {
          id: c.id,
          name: c.name,
          departmentId: c.departmentId,
          departmentName: c.departmentId ? (departmentName.get(c.departmentId) ?? null) : null,
          students,
          seats,
          seatsLeft: bySections ? limited.reduce((sum, s) => sum + (s.seatsLeft ?? 0), 0) : Math.max(0, seats - used),
          percent: seats > 0 ? Math.min(100, Math.round((used / seats) * 100)) : 0,
          sections,
          classTeacher: sections.length === 0 ? (heads.get(unitKeyOf(c.id, null)) ?? null) : null,
        };
      });

    const allSections = classes.flatMap((c) => c.sections);
    return {
      academicYear: structure.academicYear,
      departments,
      classes,
      summary: {
        classes: classes.length,
        sections: allSections.length,
        students: classes.reduce((sum, c) => sum + c.students, 0),
        seats: classes.reduce((sum, c) => sum + c.seats, 0),
        seatsLeft: classes.reduce((sum, c) => sum + c.seatsLeft, 0),
        fullSections: allSections.filter((s) => s.capacity !== null && s.state === "full").length,
      },
    };
  }
}
