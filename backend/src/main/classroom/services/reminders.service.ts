import { Types } from "mongoose";
import { indiaNow } from "../../../utils/clock";
import { reportError } from "../../../utils/logger";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Notify } from "../../notifications/services/events";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Allotment } from "../../subjects/models/Allotment";
import { Subject } from "../../subjects/models/Subject";
import { Tenant } from "../../tenants/models/Tenant";
import { readDay } from "../../timetable/services/arrangement.service";
import { SpecialDayService } from "../../timetable/services/specialDay.service";
import { shownUnits, type Unit } from "../../timetable/services/unit";
import { unitKey } from "../../timetable/services/world";
import { DiaryEntry, Syllabus } from "../models/ClassWork";
import { ClassworkReminder, DEFAULT_REMINDER_TIME } from "../models/ClassworkReminder";
import type { ReminderInput } from "../schemas/classroom.schemas";
import { fromDay } from "./calendar.service";
import { isLate } from "./chapters";

/** No reminder goes after this (10 PM in India): a server that comes up late does not ring anyone at night. */
const LAST_MINUTE = 22 * 60;
const SUNDAY = 7;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const keyOf = (r: { classId: Types.ObjectId; sectionId?: Types.ObjectId | null }) => unitKey(r.classId.toString(), r.sectionId?.toString() ?? null);

/**
 * The school's daily class work reminders (docs/teaching-progress.md), once a day at the school's time: each teacher who has not written
 * today's diary hears which classes and subjects; and a chapter whose planned day is gone is told of once, to its teacher, the class
 * teacher and the school. The server asks `runDue` every few minutes (see `startReminders`).
 */
export class ReminderService {
  static async settings(tenantId: string) {
    const found = await ClassworkReminder.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean();
    return { enabled: found?.enabled ?? true, time: found?.time ?? DEFAULT_REMINDER_TIME };
  }

  static async saveSettings(tenantId: string, input: ReminderInput) {
    await ClassworkReminder.updateOne({ tenantId: new Types.ObjectId(tenantId) }, { $set: { enabled: input.enabled, time: input.time } }, { upsert: true });
    return { enabled: input.enabled, time: input.time };
  }

  /** Every running school whose time has come today and has not had today's reminders. One school's failure does not stop the others. */
  static async runDue(): Promise<void> {
    const { date, minutes } = indiaNow();
    if (minutes >= LAST_MINUTE) return;
    const schools = await Tenant.find({ approvalStatus: "approved", isActive: true }).select("_id parentTenantId").lean();
    const open = new Set(schools.map((s) => s._id.toString()));
    for (const school of schools) {
      // A medium of a school that is switched off is off too.
      if (school.parentTenantId && !open.has(school.parentTenantId.toString())) continue;
      const tenantId = school._id.toString();
      try {
        const choice = await ReminderService.settings(tenantId);
        if (minutes < minutesOf(choice.time) || !(await ReminderService.claim(school._id, date))) continue;
        if (choice.enabled) await ReminderService.diary(tenantId, date);
        await ReminderService.behind(tenantId, date);
      } catch (err) {
        reportError(err, { source: "reminders", tenantId });
      }
    }
  }

  /** Takes today for this school; false when it was taken already (by an earlier run, or another server at the same moment). */
  private static async claim(tenantId: Types.ObjectId, date: string): Promise<boolean> {
    try {
      const done = await ClassworkReminder.updateOne({ tenantId, lastRunOn: { $ne: date } }, { $set: { lastRunOn: date } }, { upsert: true });
      return done.modifiedCount + done.upsertedCount > 0;
    } catch (err) {
      // The school's record exists with today on it: the insert the upsert tried meets the unique index.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }

  /**
   * Today's diary still to be written, told to each subject's teacher. A class with a published timetable: the subjects it has today (and who
   * takes them). Without one: every subject with a teacher, except on a Sunday. Nobody on a holiday, and not a teacher who is away.
   */
  private static async diary(tenantId: string, date: string) {
    const units = await shownUnits(tenantId);
    if (units.length === 0) return;
    const school = new Types.ObjectId(tenantId);
    const [day, specials, written] = await Promise.all([
      readDay(tenantId, date, units[0].yearId),
      SpecialDayService.between(tenantId, date, date),
      DiaryEntry.find({ tenantId: school, date: fromDay(date) }).select("classId sectionId subjectId").lean(),
    ]);
    if (day.holiday) return;
    const done = new Set(written.map((e) => `${keyOf(e)}:${e.subjectId.toString()}`));
    const closed = (classId: string) => specials.some((s) => s.slots.length === 0 && s.classIds.some((c) => c.toString() === classId));

    // teacher id -> unit (in the school's order) -> the subjects still to be written
    const owed = new Map<string, Map<Unit, Set<string>>>();
    for (const unit of units) {
      const key = unitKey(unit.classId, unit.sectionId);
      if (closed(unit.classId)) continue;
      const timetabled = day.world.timetables.get(key)?.status === "published";
      const today: { teacherId: string | null; subjectId: string }[] = timetabled
        ? day.lessons.filter((l) => unitKey(l.classId, l.sectionId) === key)
        : day.weekday === SUNDAY
          ? []
          : [...(day.world.allotments.get(key)?.values() ?? [])];
      for (const lesson of today) {
        const teacher = lesson.teacherId ? day.world.teachers.get(lesson.teacherId) : undefined;
        if (!teacher?.isActive || teacher.offDays.includes(day.weekday) || done.has(`${key}:${lesson.subjectId}`)) continue;
        const mark = day.mark.get(teacher.id);
        if (mark === "absent" || mark === "leave" || (mark !== "present" && day.leave.has(teacher.id))) continue;
        const mine = owed.get(teacher.id) ?? new Map<Unit, Set<string>>();
        const subjects = mine.get(unit) ?? new Set<string>();
        subjects.add(day.world.subjects.get(lesson.subjectId)?.name ?? "A subject");
        mine.set(unit, subjects);
        owed.set(teacher.id, mine);
      }
    }
    Notify.diaryReminder(
      tenantId,
      [...owed].map(([teacherId, mine]) => ({
        teacherId,
        classes: [...mine].map(([unit, subjects]) => ({ unit, subjects: [...subjects].sort((a, b) => a.localeCompare(b)) })),
      }))
    );
  }

  /** The chapters that have just become late, told once: to the subject's teacher, the class teacher, and the school. */
  private static async behind(tenantId: string, date: string) {
    const school = new Types.ObjectId(tenantId);
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) return;
    const plans = await Syllabus.find({
      tenantId: school,
      academicYearId: yearId,
      chapters: { $elemMatch: { plannedOn: { $lt: fromDay(date) }, completedOn: null, lateToldOn: null } },
    }).lean();
    if (plans.length === 0) return;
    const [units, allotments, heads, subjects] = await Promise.all([
      shownUnits(tenantId),
      Allotment.find({ tenantId: school, academicYearId: yearId }).select("classId sectionId subjectId teacherId").lean(),
      ClassTeacher.find({ tenantId: school, academicYearId: yearId }).select("classId sectionId teacherId").lean(),
      Subject.find({ tenantId: school, _id: { $in: plans.map((p) => p.subjectId) } }).select("name").lean(),
    ]);
    const place = new Map(units.map((u, order) => [unitKey(u.classId, u.sectionId), { order, label: u.label }]));
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));

    const found = plans.flatMap((plan) => {
      const key = keyOf(plan);
      const at = place.get(key);
      const allotment = allotments.find((a) => keyOf(a) === key && a.subjectId.equals(plan.subjectId));
      // A class the school no longer runs, or a subject it no longer studies, is nobody's to hurry.
      if (!at || !allotment) return [];
      const late = plan.chapters.filter((c) => isLate(c, date) && !c.lateToldOn);
      if (late.length === 0) return [];
      const head = heads.find((h) => keyOf(h) === key)?.teacherId ?? null;
      const subject = subjectName.get(plan.subjectId.toString()) ?? "A subject";
      const teacherIds = [allotment.teacherId, head].flatMap((id) => (id ? [id.toString()] : []));
      return [{ plan, order: at.order, subject, chapters: late, label: `${at.label} ${subject}`, teacherIds }];
    });
    if (found.length === 0) return;
    found.sort((a, b) => a.order - b.order || a.subject.localeCompare(b.subject));

    for (const item of found) {
      await Syllabus.updateOne(
        { _id: item.plan._id, tenantId: school },
        { $set: { "chapters.$[late].lateToldOn": fromDay(date) } },
        { arrayFilters: [{ "late._id": { $in: item.chapters.map((c) => c._id) } }] }
      );
    }
    Notify.syllabusBehind(
      tenantId,
      found.flatMap((item) => item.chapters.map((c) => ({ line: `${item.label}: ${c.name}`, teacherIds: item.teacherIds })))
    );
  }
}

/** Looks every few minutes for schools whose reminder time has come. Returns how to stop. */
export function startReminders(everyMs = 5 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    ReminderService.runDue()
      .catch((err) => reportError(err, { source: "reminders" }))
      .finally(() => (running = false));
  };
  const timer = setInterval(tick, everyMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
