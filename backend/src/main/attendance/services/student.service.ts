import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { AttendanceDay, type AttendanceStatus } from "../../classroom/models/AttendanceDay";
import { CalendarService } from "../../classroom/services/calendar.service";
import { childrenOf } from "../../classroom/services/children";
import { Enrolment } from "../../students/models/Enrolment";
import { activeUnits, resolveUnit } from "../../timetable/services/unit";
import type { StudentsQuery } from "../schemas/attendance.schemas";
import { eachDay, schoolDays, weekdayOf } from "./schoolDays";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

type Counts = Record<AttendanceStatus, number>;
const countOf = (statuses: AttendanceStatus[]): Counts => ({
  present: statuses.filter((s) => s === "present").length,
  absent: statuses.filter((s) => s === "absent").length,
  late: statuses.filter((s) => s === "late").length,
  leave: statuses.filter((s) => s === "leave").length,
});
/** Late counts as there; leave and absent do not (the same rule as the parent's page). */
const percentOf = (c: Counts) => {
  const days = c.present + c.absent + c.late + c.leave;
  return days === 0 ? null : Math.round(((c.present + c.late) / days) * 100);
};

interface Place {
  classId: string;
  sectionId: string | null;
  yearId: Types.ObjectId;
  /** The section's name ("A"), shown with each child when a class's sections are read together. */
  section: string | null;
}

/**
 * The school reads the students' attendance of a class for any days (2026-11-06): one section, or the whole class (every section), each
 * child with the marks of the days attendance was taken, the reason of an absence, and the counts. The days nobody took are not marks
 * (not Present): "not taken" says so.
 */
export class StudentAttendanceService {
  /** The places a question is about: the one section, the class itself when it has none, or every section of the class. */
  private static async places(tenantId: string, query: StudentsQuery): Promise<{ label: string; places: Place[] }> {
    if (query.sectionId !== "all") {
      const unit = await resolveUnit(tenantId, query.classId, query.sectionId === "none" ? null : query.sectionId);
      return { label: unit.label, places: [{ classId: unit.classId, sectionId: unit.sectionId, yearId: unit.yearId, section: unit.sectionName }] };
    }
    const school = asId(tenantId);
    const klass = await SchoolClass.findOne({ _id: query.classId, tenantId: school }).select("name").lean();
    if (!klass) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    // The sections of the year being read: the running one, or a past one the school is looking at.
    const yearId = await AcademicYearService.shownYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const sections = await Section.find({ tenantId: school, classId: klass._id, academicYearId: yearId }).select("name").lean();
    if (sections.length === 0) return { label: klass.name, places: [{ classId: query.classId, sectionId: null, yearId, section: null }] };
    sections.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return { label: klass.name, places: sections.map((s) => ({ classId: query.classId, sectionId: s._id.toString(), yearId, section: s.name })) };
  }

  static async range(tenantId: string, query: StudentsQuery) {
    const { label, places } = await StudentAttendanceService.places(tenantId, query);
    const now = indiaNow();
    const to = query.to > now.date ? now.date : query.to;
    const dates = query.from > to ? [] : eachDay(query.from, to);
    const school = asId(tenantId);

    const lists = await Promise.all(places.map((p) => childrenOf(tenantId, p)));
    const childIds = lists.flat().map((c) => asId(c.id));
    const [holidays, docs, childDocs] = await Promise.all([
      dates.length === 0 ? Promise.resolve([]) : CalendarService.holidaysBetween(school, query.from, to),
      dates.length === 0
        ? Promise.resolve([])
        : AttendanceDay.find({
            tenantId: school,
            classId: asId(query.classId),
            sectionId: { $in: places.map((p) => (p.sectionId ? asId(p.sectionId) : null)) },
            date: { $gte: fromDay(query.from), $lte: fromDay(to) },
          })
            .sort({ date: 1 })
            .lean(),
      // A child's days follow the child: what was taken in a class or section they have since left is theirs too.
      dates.length === 0 || childIds.length === 0
        ? Promise.resolve([])
        : AttendanceDay.find({ tenantId: school, "marks.studentId": { $in: childIds }, date: { $gte: fromDay(query.from), $lte: fromDay(to) } })
            .sort({ date: 1 })
            .lean(),
    ]);
    const takenOn = new Set(docs.map((d) => dayOf(d.date)));
    const days = dates.map((date) => ({
      date,
      weekday: weekdayOf(date),
      holiday: holidays.find((h) => h.startDate <= date && h.endDate >= date)?.title ?? null,
      taken: takenOn.has(date),
    }));

    const students = places.flatMap((place, i) =>
      lists[i].map((c) => {
        // One mark a day: if two days' records name the child (a move on the same day), the one saved last is the child's.
        const byDate = new Map<string, { status: AttendanceStatus; reason: string | null; saved: number }>();
        for (const d of childDocs) {
          const mark = d.marks.find((m) => m.studentId.toString() === c.id);
          const date = dayOf(d.date);
          if (mark && (byDate.get(date)?.saved ?? 0) <= d.updatedAt.getTime()) byDate.set(date, { status: mark.status, reason: mark.reason ?? null, saved: d.updatedAt.getTime() });
        }
        const records = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, m]) => ({ date, status: m.status, reason: m.reason }));
        const counts = countOf(records.map((r) => r.status));
        return { id: c.id, name: c.name, admissionNumber: c.admissionNumber, rollNumber: c.rollNumber, section: place.section, records, tally: { ...counts, days: records.length, percent: percentOf(counts) } };
      })
    );
    const total = countOf(students.flatMap((s) => s.records.map((r) => r.status)));
    return {
      label,
      from: query.from,
      to,
      days,
      students,
      summary: { students: students.length, ...total, percent: percentOf(total) },
    };
  }

  /**
   * The classes (or sections) with children that have not taken today's attendance: only on a day school runs (not a holiday), and once
   * school has started: the first thing a principal asks. With no timing set for the school, any day but Sunday.
   */
  static async today(tenantId: string) {
    const now = indiaNow();
    const [day] = await schoolDays(tenantId, now.date, now.date);
    const none: { classId: string; sectionId: string | null; label: string }[] = [];
    if (day.holiday || !day.working) return { date: now.date, working: false, holiday: day.holiday, pending: none };
    if (day.start !== null && now.minutes < day.start) return { date: now.date, working: true, holiday: null, pending: none };
    const school = asId(tenantId);
    const units = await activeUnits(tenantId);
    if (units.length === 0) return { date: now.date, working: true, holiday: null, pending: none };
    const [counts, taken] = await Promise.all([
      Enrolment.aggregate<{ _id: { classId: Types.ObjectId; sectionId: Types.ObjectId | null } }>([
        { $match: { tenantId: school, academicYearId: units[0].yearId, status: "active" } },
        { $group: { _id: { classId: "$classId", sectionId: "$sectionId" } } },
      ]),
      AttendanceDay.find({ tenantId: school, date: fromDay(now.date) }).select("classId sectionId").lean(),
    ]);
    const key = (classId: Types.ObjectId | string, sectionId: Types.ObjectId | string | null) => `${classId.toString()}:${sectionId ? sectionId.toString() : "-"}`;
    const hasChildren = new Set(counts.map((c) => key(c._id.classId, c._id.sectionId)));
    const done = new Set(taken.map((d) => key(d.classId, d.sectionId)));
    return {
      date: now.date,
      working: true,
      holiday: null,
      pending: units.filter((u) => hasChildren.has(key(u.classId, u.sectionId)) && !done.has(key(u.classId, u.sectionId))).map((u) => ({ classId: u.classId, sectionId: u.sectionId, label: u.label })),
    };
  }
}

