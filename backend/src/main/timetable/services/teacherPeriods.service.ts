import { ApiError } from "../../../utils/ApiError";
import { AllotmentService } from "../../subjects/services/allotment.service";
import { DAY_NAMES } from "../constants";
import type { TeacherPeriodsInput } from "../schemas/timetable.schemas";
import { analyse, type AllotmentInfo, type CellIn, type Issue } from "./checker";
import { clashError, GridService, type GridView } from "./grid.service";
import { resolveUnit } from "./unit";
import { busyFrom, loadWorld, unitDays, unitKey } from "./world";

const invalid = (path: string, message: string) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path, message }]);

/**
 * A teacher is given a class from their page, with the days and periods (2026-11-13): the subject goes to the teacher and its periods go
 * into the class's timetable, in **one request**. Everything is checked before anything is written (the teacher is the school's and
 * teaching, a period the class uses for another subject is refused, the teacher must be free and come at each period, the subject cannot be
 * given more periods than it has a week); a refusal leaves the subject's teacher and the timetable as they were. The lessons name nobody:
 * they follow the subject's teacher in the class's list, like every lesson the timetable makes.
 */
export class TeacherPeriodsService {
  static async assign(tenantId: string, userId: string, input: TeacherPeriodsInput): Promise<GridView> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId);
    const world = await loadWorld(tenantId, unit.yearId);
    const key = unitKey(unit.classId, unit.sectionId);
    const days = unitDays(world, unit.classId);
    if (days.length === 0) throw ApiError.conflict(`${unit.label} has no timing yet. Set the school's timings first.`, "NO_TIMING");

    const teacher = world.teachers.get(input.teacherId);
    if (!teacher) throw invalid("teacherId", "Choose a teacher from your school's list");
    if (!teacher.isActive) throw invalid("teacherId", `${teacher.name} is no longer teaching here`);

    const subject = world.subjects.get(input.subjectId);
    if (!subject) throw invalid("subjectId", "Choose a subject from your school's list");
    const studied = world.allotments.get(key)?.get(input.subjectId);
    const periodsAfter = input.periodsPerWeek ?? studied?.periodsPerWeek ?? (input.slots.length > 0 ? input.slots.length : undefined);
    if (periodsAfter === undefined) throw invalid("periodsPerWeek", `Enter the periods a week: ${unit.label} does not study ${subject.name} yet`);

    // The timetable as it is, and as it will be: the subject in each chosen period that is free (one that has the subject already stays).
    const stored: CellIn[] = (world.timetables.get(key)?.cells ?? []).map((c) => ({ ...c, lessons: c.lessons.map((l) => ({ ...l })) }));
    const placedBefore = stored.reduce((sum, c) => sum + c.lessons.filter((l) => l.subjectId === input.subjectId).length, 0);
    const cells: CellIn[] = stored.map((c) => ({ ...c, lessons: c.lessons.map((l) => ({ ...l })) }));
    let added = 0;
    for (const slot of [...input.slots].sort((a, b) => a.day - b.day || a.period - b.period)) {
      const here = cells.find((c) => c.day === slot.day && c.period === slot.period);
      if (here?.lessons.some((l) => l.subjectId === input.subjectId)) continue;
      if (here && here.lessons.length > 0) {
        const names = here.lessons.map((l) => world.subjects.get(l.subjectId)?.name ?? "another subject");
        const message = `${DAY_NAMES[slot.day]} period ${slot.period} already has ${names.join(" and ")}`;
        throw ApiError.conflict(message, "PERIOD_TAKEN", [{ path: "slots", message }]);
      }
      cells.push({ day: slot.day, period: slot.period, lessons: [{ subjectId: input.subjectId, teacherId: null, room: null }] });
      added += 1;
    }
    if (placedBefore + added > periodsAfter) {
      const left = Math.max(0, periodsAfter - placedBefore);
      throw invalid(
        "slots",
        `${subject.name} has ${periodsAfter} periods a week and ${placedBefore} ${placedBefore === 1 ? "is" : "are"} in the timetable already: ${left > 0 ? `${left} more can be placed` : "no more can be placed"}`
      );
    }

    // The rules of the timetable, on the new teacher and the new lessons: only what this change brings new is held against it.
    const allotments = world.allotments.get(key) ?? new Map<string, AllotmentInfo>();
    const after = new Map(allotments);
    after.set(input.subjectId, { subjectId: input.subjectId, subjectName: subject.name, periodsPerWeek: periodsAfter, blockSize: studied?.blockSize ?? 1, teacherId: input.teacherId, group: studied?.group ?? null });
    const busy = busyFrom(world, key);
    const errorsOf = (list: CellIn[], rows: Map<string, AllotmentInfo>): Issue[] => analyse({ days, cells: list, allotments: rows, teachers: world.teachers, busy }).issues.filter((i) => i.level === "error");
    const known = new Set(errorsOf(stored, allotments).map((e) => `${e.code}:${e.day}:${e.period}`));
    const fresh = errorsOf(cells, after).filter((e) => !known.has(`${e.code}:${e.day}:${e.period}`));
    if (fresh.length > 0) throw clashError(fresh);

    // Checked: the subject goes to the teacher (a subject new to the class is added with its periods), then the lessons are kept.
    const unitRef = { classId: input.classId, sectionId: input.sectionId };
    await AllotmentService.assignTeacher(tenantId, { ...unitRef, subjectId: input.subjectId, teacherId: input.teacherId, ...(studied && !input.periodsPerWeek ? {} : { periodsPerWeek: periodsAfter }) }, userId);
    return GridService.save(tenantId, userId, { ...unitRef, cells });
  }
}
