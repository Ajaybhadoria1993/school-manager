import { Types } from "mongoose";
import { Notify } from "../../notifications/services/events";
import { ApiError } from "../../../utils/ApiError";
import { Section } from "../../academics/models/Section";
import { ClassTeacher } from "../../staff/models/ClassTeacher";
import { Teacher } from "../../staff/models/Teacher";
import { ClassTeacherService } from "../../staff/services/classTeacher.service";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { analyse, type AllotmentInfo } from "../../timetable/services/checker";
import { clashError } from "../../timetable/services/grid.service";
import { loadRules } from "../../timetable/services/schedule.service";
import { weekPeriods } from "../../timetable/services/scheduleRules";
import { resolveUnit, type Unit } from "../../timetable/services/unit";
import { busyFrom, loadWorld, unitDays, unitKey, type World } from "../../timetable/services/world";
import { Allotment } from "../models/Allotment";
import { Subject } from "../models/Subject";
import { MAX_BACKUP_TEACHERS } from "../constants";
import type { AllotmentRowInput, AssignTeacherInput, SaveAllotmentsInput, SaveUnitTeachersInput } from "../schemas/subjects.schemas";

export interface AllotmentRowDto {
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  category: "academic" | "activity";
  subjectActive: boolean;
  periodsPerWeek: number;
  blockSize: number;
  teacherId: string | null;
  teacherName: string | null;
  /** The backup teachers in order (priority 2, 3...). */
  backups: { id: string; name: string }[];
  group: string | null;
}

export interface AllotmentView {
  unit: { classId: string; className: string; sectionId: string | null; sectionName: string | null; label: string; academicYear: { id: string; name: string } };
  rows: AllotmentRowDto[];
  /** The class's other sections (of the same year), which the same list can be given to. */
  siblings: { id: string; name: string }[];
  totals: {
    /** The periods a week the list has to place (the subjects of a choice share their periods, so a choice counts once). */
    periods: number;
    /** The periods a week the class's timing has; null when no timing covers the class yet. */
    available: number | null;
  };
}

interface Problem {
  path: string;
  message: string;
}

/** The periods a week a list needs: every subject everyone studies, and each choice once (its subjects are taught side by side). */
export function periodsToPlace(rows: readonly Pick<AllotmentRowInput, "periodsPerWeek" | "group">[]): number {
  let total = 0;
  const groups = new Map<string, number>();
  for (const row of rows) {
    if (row.group) groups.set(row.group.toLowerCase(), Math.max(groups.get(row.group.toLowerCase()) ?? 0, row.periodsPerWeek));
    else total += row.periodsPerWeek;
  }
  for (const periods of groups.values()) total += periods;
  return total;
}

const groupKeyOf = (group: string | null) => (group ? nameKeyOf(group) : null);

export class AllotmentService {
  /** What the unit studies, and what is left to say about it. */
  static async get(tenantId: string, classId: string, sectionId: string | null): Promise<AllotmentView> {
    const unit = await resolveUnit(tenantId, classId, sectionId);
    return AllotmentService.view(tenantId, unit);
  }

  /**
   * Replaces what a unit studies. The same list can be given to the class's other sections in the same request (`alsoSections`; the
   * teachers only with `withTeachers`). Everything is checked before anything is written; the rows are then written one section at a
   * time (no transactions: a failure half way leaves the sections done so far as the person saved them, and asking again finishes).
   */
  static async save(tenantId: string, input: SaveAllotmentsInput): Promise<AllotmentView> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId);
    const others: Unit[] = [];
    for (const sectionId of input.alsoSections) {
      if (sectionId === input.sectionId) continue;
      others.push(await resolveUnit(tenantId, input.classId, sectionId));
    }
    if (unit.sectionId === null && others.length > 0) {
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "alsoSections", message: "A class without sections has no other section" }]);
    }

    const problems = await AllotmentService.rowProblems(tenantId, input.rows);
    if (problems.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", problems);

    const available = await AllotmentService.availablePeriods(tenantId, input.classId);
    const needed = periodsToPlace(input.rows);
    if (available !== null && needed > available) {
      throw ApiError.badRequest(
        `${unit.label} has ${needed} periods a week to place but its timing has only ${available}.`,
        "PERIODS_DO_NOT_FIT",
        [{ path: "rows", message: `${needed} periods a week to place but the timing has only ${available}` }]
      );
    }

    await AllotmentService.assertTimetablesStillFit(tenantId, [{ unit, withTeachers: true }, ...others.map((o) => ({ unit: o, withTeachers: input.withTeachers }))], input.rows);

    await AllotmentService.write(tenantId, unit, input.rows, true);
    for (const other of others) await AllotmentService.write(tenantId, other, input.rows, input.withTeachers);
    return AllotmentService.view(tenantId, unit);
  }

  /**
   * The teacher of one subject of a unit, everything else of the unit left as it is: the same checks as saving the whole list (the
   * teacher is the school's and teaching, the periods fit the timing, a teacher already busy at a period the subject is taught is
   * refused). A subject the unit does not study yet is added at the end with `periodsPerWeek`.
   */
  static async assignTeacher(tenantId: string, input: AssignTeacherInput, actorId: string | null = null): Promise<AllotmentView> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId);
    const school = new Types.ObjectId(tenantId);
    const stored = await Allotment.find({
      tenantId: school,
      academicYearId: unit.yearId,
      classId: new Types.ObjectId(unit.classId),
      sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null,
    })
      .sort({ position: 1, _id: 1 })
      .lean();
    const rows: AllotmentRowInput[] = stored.map((r) => ({
      subjectId: r.subjectId.toString(),
      periodsPerWeek: r.periodsPerWeek,
      blockSize: r.blockSize,
      teacherId: r.teacherId ? r.teacherId.toString() : null,
      backupTeacherIds: (r.backupTeacherIds ?? []).map((id) => id.toString()),
      group: r.group ?? null,
    }));
    let at = rows.findIndex((r) => r.subjectId === input.subjectId);
    const before = at >= 0 ? rows[at].teacherId : null;
    const backupsBefore = at >= 0 ? (rows[at].backupTeacherIds ?? []) : [];
    if (at >= 0) {
      rows[at] = {
        ...rows[at],
        teacherId: input.teacherId,
        ...(input.backupTeacherIds !== undefined ? { backupTeacherIds: input.backupTeacherIds } : {}),
        ...(input.periodsPerWeek ? { periodsPerWeek: input.periodsPerWeek } : {}),
      };
    } else {
      const subject = await Subject.findOne({ _id: input.subjectId, tenantId: school }).select("name").lean();
      if (!subject) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "subjectId", message: "Choose a subject from your school's list" }]);
      if (!input.periodsPerWeek) {
        throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "periodsPerWeek", message: `Enter the periods a week: ${unit.label} does not study ${subject.name} yet` }]);
      }
      rows.push({ subjectId: input.subjectId, periodsPerWeek: input.periodsPerWeek, blockSize: 1, teacherId: input.teacherId, backupTeacherIds: input.backupTeacherIds ?? [], group: null });
      at = rows.length - 1;
    }
    try {
      const view = await AllotmentService.save(tenantId, { classId: input.classId, sectionId: input.sectionId, rows, alsoSections: [], withTeachers: false });
      if (actorId && (input.teacherId ?? null) !== before) {
        const [subject, teacher] = await Promise.all([
          Subject.findOne({ _id: input.subjectId, tenantId: school }).select("name").lean(),
          input.teacherId ? Teacher.findOne({ _id: input.teacherId, tenantId: school }).select("name").lean() : Promise.resolve(null),
        ]);
        Notify.subjectTeacherChanged(tenantId, actorId, {
          unit,
          subjectName: subject?.name ?? "A subject",
          now: teacher ? { id: teacher._id.toString(), name: teacher.name } : null,
          before,
        });
      }
      const newBackups = (input.backupTeacherIds ?? []).filter((id) => !backupsBefore.includes(id));
      if (actorId && newBackups.length > 0) {
        const subject = await Subject.findOne({ _id: input.subjectId, tenantId: school }).select("name").lean();
        Notify.backupTeachersAdded(tenantId, actorId, { unit, subjectName: subject?.name ?? "A subject", teacherIds: newBackups });
      }
      return view;
    } catch (err) {
      // The whole list's words point at a row (`rows.2.teacherId`); this request has one box of each.
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const prefix = `rows.${at}.`;
        err.details = (err.details as Problem[]).map((d) => (typeof d.path === "string" && d.path.startsWith(prefix) ? { ...d, path: d.path.slice(prefix.length) } : d));
      }
      throw err;
    }
  }

  /**
   * The class's page saves with one button (2026-11-06): the class teacher and, for the subjects named, the main and the backup teachers. All
   * or nothing: the teachers are checked first, the subjects are saved by the same checks as the whole list (a main teacher busy at a period
   * the subject is taught is refused, the timetable stays as it was), then the class teacher. A subject not named keeps its teachers.
   */
  static async saveTeachers(tenantId: string, input: SaveUnitTeachersInput, actorId: string | null = null): Promise<AllotmentView & { classTeacher: { id: string; name: string } | null }> {
    const unit = await resolveUnit(tenantId, input.classId, input.sectionId);
    const school = new Types.ObjectId(tenantId);
    if (input.classTeacherId) {
      const head = await Teacher.findOne({ _id: input.classTeacherId, tenantId: school }).select("name isActive").lean();
      if (!head) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "classTeacherId", message: "Choose a teacher from your school's list" }]);
      if (!head.isActive) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "classTeacherId", message: `${head.name} is no longer teaching here` }]);
    }
    const where = { tenantId: school, academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null };
    const stored = await Allotment.find(where).sort({ position: 1, _id: 1 }).lean();
    const rows: AllotmentRowInput[] = stored.map((r) => ({
      subjectId: r.subjectId.toString(),
      periodsPerWeek: r.periodsPerWeek,
      blockSize: r.blockSize,
      teacherId: r.teacherId ? r.teacherId.toString() : null,
      backupTeacherIds: (r.backupTeacherIds ?? []).map((id) => id.toString()),
      group: r.group ?? null,
    }));
    const before = new Map(rows.map((r) => [r.subjectId, { teacherId: r.teacherId, backups: r.backupTeacherIds ?? [] }]));
    const inputIndexOfRow = new Map<number, number>();
    const problems: Problem[] = [];
    const named = new Set<string>();
    input.subjects.forEach((s, i) => {
      const at = rows.findIndex((r) => r.subjectId === s.subjectId);
      if (named.has(s.subjectId)) problems.push({ path: `subjects.${i}.subjectId`, message: "This subject is in the list twice" });
      else if (at < 0) problems.push({ path: `subjects.${i}.subjectId`, message: `${unit.label} does not study this subject` });
      else {
        rows[at] = { ...rows[at], teacherId: s.teacherId, backupTeacherIds: s.teacherId ? s.backupTeacherIds : [] };
        inputIndexOfRow.set(at, i);
      }
      named.add(s.subjectId);
    });
    if (problems.length > 0) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", problems);

    let view: AllotmentView;
    try {
      view = await AllotmentService.save(tenantId, { classId: input.classId, sectionId: input.sectionId, rows, alsoSections: [], withTeachers: false });
    } catch (err) {
      // The whole list's words point at a row of it (`rows.2.teacherId`); this request's are of its own subjects.
      if (err instanceof ApiError && Array.isArray(err.details)) {
        err.details = (err.details as Problem[]).map((d) => {
          const m = typeof d.path === "string" ? /^rows\.(\d+)\.(.*)$/.exec(d.path) : null;
          const i = m ? inputIndexOfRow.get(Number(m[1])) : undefined;
          return m && i !== undefined ? { ...d, path: `subjects.${i}.${m[2]}` } : d;
        });
      }
      throw err;
    }

    // The class teacher last: everything above was checked, so this is the one write left.
    let head: { id: string; name: string } | null;
    if (input.classTeacherId !== undefined) head = (await ClassTeacherService.set(tenantId, { classId: input.classId, sectionId: input.sectionId, teacherId: input.classTeacherId }, actorId)).teacher;
    else {
      const post = await ClassTeacher.findOne(where).select("teacherId").lean();
      const teacher = post ? await Teacher.findOne({ _id: post.teacherId, tenantId: school }).select("name").lean() : null;
      head = teacher ? { id: teacher._id.toString(), name: teacher.name } : null;
    }

    if (actorId) {
      const subjectNames = new Map(view.rows.map((r) => [r.subjectId, r.subjectName]));
      const teacherNames = new Map(view.rows.flatMap((r) => [...(r.teacherId ? [[r.teacherId, r.teacherName ?? "A teacher"] as const] : []), ...r.backups.map((b) => [b.id, b.name] as const)]));
      for (const s of input.subjects) {
        const was = before.get(s.subjectId);
        if (!was) continue;
        if ((s.teacherId ?? null) !== (was.teacherId ?? null)) {
          Notify.subjectTeacherChanged(tenantId, actorId, {
            unit,
            subjectName: subjectNames.get(s.subjectId) ?? "A subject",
            now: s.teacherId ? { id: s.teacherId, name: teacherNames.get(s.teacherId) ?? "A teacher" } : null,
            before: was.teacherId,
          });
        }
        const added = (s.teacherId ? s.backupTeacherIds : []).filter((id) => !was.backups.includes(id));
        if (added.length > 0) Notify.backupTeachersAdded(tenantId, actorId, { unit, subjectName: subjectNames.get(s.subjectId) ?? "A subject", teacherIds: added });
      }
    }
    return { ...view, classTeacher: head };
  }

  /**
   * The units' timetables are already made on what they studied: a subject cannot be taken off while it has lessons, and a new teacher
   * must be free (and come) at every period the subject is taught, or the change is refused and the timetable is left as it was.
   */
  private static async assertTimetablesStillFit(tenantId: string, targets: { unit: Unit; withTeachers: boolean }[], rows: AllotmentRowInput[]): Promise<void> {
    const worlds = new Map<string, World>();
    for (const { unit, withTeachers } of targets) {
      let world = worlds.get(unit.yearId.toString());
      if (!world) worlds.set(unit.yearId.toString(), (world = await loadWorld(tenantId, unit.yearId)));
      const key = unitKey(unit.classId, unit.sectionId);
      const stored = world.timetables.get(key);
      if (!stored || stored.cells.length === 0) continue;

      const before = world.allotments.get(key) ?? new Map<string, AllotmentInfo>();
      const placed = new Map<string, number>();
      for (const cell of stored.cells) for (const lesson of cell.lessons) placed.set(lesson.subjectId, (placed.get(lesson.subjectId) ?? 0) + 1);
      const kept = new Set(rows.map((r) => r.subjectId));
      for (const [subjectId, count] of placed) {
        if (kept.has(subjectId)) continue;
        const name = world.subjects.get(subjectId)?.name ?? "A subject";
        throw ApiError.conflict(
          `${name} is in the timetable of ${unit.label} (${count} period${count === 1 ? "" : "s"}). Take it out of the timetable first.`,
          "SUBJECT_IN_TIMETABLE"
        );
      }

      const after = new Map<string, AllotmentInfo>(
        rows.map((row) => [
          row.subjectId,
          {
            subjectId: row.subjectId,
            subjectName: world!.subjects.get(row.subjectId)?.name ?? "A subject",
            periodsPerWeek: row.periodsPerWeek,
            blockSize: row.blockSize,
            teacherId: withTeachers ? row.teacherId : (before.get(row.subjectId)?.teacherId ?? null),
            group: row.group,
          },
        ])
      );
      const days = unitDays(world, unit.classId);
      const busy = busyFrom(world, key);
      const errorsOf = (allotments: Map<string, AllotmentInfo>) =>
        analyse({ days, cells: stored.cells, allotments, teachers: world!.teachers, busy }).issues.filter((i) => i.level === "error");
      const known = new Set(errorsOf(before).map((e) => `${e.code}:${e.day}:${e.period}`));
      const added = errorsOf(after).filter((e) => !known.has(`${e.code}:${e.day}:${e.period}`));
      if (added.length > 0) throw clashError(added);
    }
  }

  /** The unit's rows with the subject and teacher named, and the totals. */
  private static async view(tenantId: string, unit: Unit): Promise<AllotmentView> {
    const school = new Types.ObjectId(tenantId);
    const unitFilter = { tenantId: school, academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null };
    const rows = await Allotment.find(unitFilter).sort({ position: 1, _id: 1 }).lean();
    const [subjects, teachers, siblings, available] = await Promise.all([
      Subject.find({ tenantId: school, _id: { $in: rows.map((r) => r.subjectId) } }).lean(),
      Teacher.find({ tenantId: school, _id: { $in: rows.flatMap((r) => [...(r.teacherId ? [r.teacherId] : []), ...(r.backupTeacherIds ?? [])]) } }).select("name").lean(),
      unit.sectionId
        ? Section.find({ tenantId: school, classId: new Types.ObjectId(unit.classId), academicYearId: unit.yearId, _id: { $ne: new Types.ObjectId(unit.sectionId) } }).select("name").lean()
        : Promise.resolve([]),
      AllotmentService.availablePeriods(tenantId, unit.classId),
    ]);
    const subjectById = new Map(subjects.map((s) => [s._id.toString(), s]));
    const teacherById = new Map(teachers.map((t) => [t._id.toString(), t]));
    const dtos: AllotmentRowDto[] = rows.flatMap((r) => {
      const subject = subjectById.get(r.subjectId.toString());
      if (!subject) return [];
      return [
        {
          subjectId: r.subjectId.toString(),
          subjectName: subject.name,
          subjectCode: subject.code ?? null,
          category: subject.category,
          subjectActive: subject.isActive,
          periodsPerWeek: r.periodsPerWeek,
          blockSize: r.blockSize,
          teacherId: r.teacherId ? r.teacherId.toString() : null,
          teacherName: r.teacherId ? (teacherById.get(r.teacherId.toString())?.name ?? null) : null,
          backups: (r.backupTeacherIds ?? []).flatMap((id) => {
            const teacher = teacherById.get(id.toString());
            return teacher ? [{ id: id.toString(), name: teacher.name }] : [];
          }),
          group: r.group ?? null,
        },
      ];
    });
    return {
      unit: { classId: unit.classId, className: unit.className, sectionId: unit.sectionId, sectionName: unit.sectionName, label: unit.label, academicYear: { id: unit.yearId.toString(), name: unit.yearName } },
      rows: dtos,
      siblings: siblings
        .map((s) => ({ id: s._id.toString(), name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
      totals: { periods: periodsToPlace(dtos), available },
    };
  }

  /** The periods a week a class's timing gives it (null when no timing covers it). */
  static async availablePeriods(tenantId: string, classId: string): Promise<number | null> {
    const week = weekPeriods(await loadRules(tenantId), classId);
    return week.length === 0 ? null : week.reduce((sum, d) => sum + d.periods, 0);
  }

  /** What is wrong with the rows, by the box: the subject and the teacher are the school's, the blocks fit, a choice is a real choice. */
  private static async rowProblems(tenantId: string, rows: AllotmentRowInput[]): Promise<Problem[]> {
    const school = new Types.ObjectId(tenantId);
    const problems: Problem[] = [];
    const [subjects, teachers] = await Promise.all([
      Subject.find({ tenantId: school, _id: { $in: rows.map((r) => new Types.ObjectId(r.subjectId)) } }).select("name isActive").lean(),
      Teacher.find({ tenantId: school, _id: { $in: rows.flatMap((r) => [...(r.teacherId ? [r.teacherId] : []), ...(r.backupTeacherIds ?? [])].map((id) => new Types.ObjectId(id))) } }).select("name isActive").lean(),
    ]);
    const subjectById = new Map(subjects.map((s) => [s._id.toString(), s]));
    const teacherById = new Map(teachers.map((t) => [t._id.toString(), t]));

    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const subject = subjectById.get(row.subjectId);
      if (!subject) problems.push({ path: `rows.${i}.subjectId`, message: "Choose a subject from your school's list" });
      else if (seen.has(row.subjectId)) problems.push({ path: `rows.${i}.subjectId`, message: `${subject.name} is in the list twice` });
      else if (!subject.isActive) problems.push({ path: `rows.${i}.subjectId`, message: `${subject.name} is archived. Bring it back first` });
      seen.add(row.subjectId);

      if (row.teacherId) {
        const teacher = teacherById.get(row.teacherId);
        if (!teacher) problems.push({ path: `rows.${i}.teacherId`, message: "Choose a teacher from your school's list" });
        else if (!teacher.isActive) problems.push({ path: `rows.${i}.teacherId`, message: `${teacher.name} is no longer teaching here` });
      }
      const backups = row.backupTeacherIds ?? [];
      if (backups.length > MAX_BACKUP_TEACHERS) problems.push({ path: `rows.${i}.backupTeacherIds`, message: `Up to ${MAX_BACKUP_TEACHERS} backup teachers` });
      if (backups.length > 0 && !row.teacherId) problems.push({ path: `rows.${i}.backupTeacherIds`, message: "Choose the main teacher first" });
      const listed = new Set<string>();
      backups.forEach((id, j) => {
        const path = `rows.${i}.backupTeacherIds.${j}`;
        const teacher = teacherById.get(id);
        if (!teacher) problems.push({ path, message: "Choose a teacher from your school's list" });
        else if (id === row.teacherId) problems.push({ path, message: `${teacher.name} is the main teacher already` });
        else if (listed.has(id)) problems.push({ path, message: `${teacher.name} is in the list twice` });
        else if (!teacher.isActive) problems.push({ path, message: `${teacher.name} is no longer teaching here` });
        listed.add(id);
      });
      if (row.blockSize > 1 && row.periodsPerWeek % row.blockSize !== 0) {
        problems.push({ path: `rows.${i}.periodsPerWeek`, message: `${row.periodsPerWeek} periods cannot be given in blocks of ${row.blockSize}: use a multiple of ${row.blockSize}` });
      }
    });

    // A choice: two or more subjects taught in the same periods, so they share the periods a week and the block, and never one teacher.
    const groups = new Map<string, number[]>();
    rows.forEach((row, i) => {
      const key = groupKeyOf(row.group);
      if (key) groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    for (const members of groups.values()) {
      if (members.length < 2) {
        problems.push({ path: `rows.${members[0]}.group`, message: "A choice needs at least two subjects" });
        continue;
      }
      const first = rows[members[0]];
      for (const i of members.slice(1)) {
        if (rows[i].periodsPerWeek !== first.periodsPerWeek) problems.push({ path: `rows.${i}.periodsPerWeek`, message: "The subjects of one choice need the same periods a week" });
        if (rows[i].blockSize !== first.blockSize) problems.push({ path: `rows.${i}.blockSize`, message: "The subjects of one choice need the same block" });
      }
      const taken = new Map<string, number>();
      for (const i of members) {
        const teacher = rows[i].teacherId;
        if (!teacher) continue;
        if (taken.has(teacher)) {
          const name = teacherById.get(teacher)?.name ?? "A teacher";
          problems.push({ path: `rows.${i}.teacherId`, message: `${name} cannot teach two subjects of one choice at the same time` });
        }
        taken.set(teacher, i);
      }
    }
    return problems;
  }

  /**
   * Makes the unit's rows what `rows` says: subjects no longer listed go, the others are added or updated, in the order given. When
   * the teachers are not to be given (`withTeachers` false, for the other sections), a subject the unit already had keeps its teacher
   * and a new one has none.
   */
  private static async write(tenantId: string, unit: Unit, rows: AllotmentRowInput[], withTeachers: boolean): Promise<void> {
    const school = new Types.ObjectId(tenantId);
    const base = { tenantId: school, academicYearId: unit.yearId, classId: new Types.ObjectId(unit.classId), sectionId: unit.sectionId ? new Types.ObjectId(unit.sectionId) : null };
    const existing = withTeachers ? [] : await Allotment.find(base).select("subjectId teacherId backupTeacherIds").lean();
    const keptTeacher = new Map(existing.map((e) => [e.subjectId.toString(), e.teacherId ?? null]));
    const keptBackups = new Map(existing.map((e) => [e.subjectId.toString(), e.backupTeacherIds ?? []]));

    await Allotment.deleteMany({ ...base, subjectId: { $nin: rows.map((r) => new Types.ObjectId(r.subjectId)) } });
    if (rows.length === 0) return;
    await Allotment.bulkWrite(
      rows.map((row, position) => ({
        updateOne: {
          filter: { ...base, subjectId: new Types.ObjectId(row.subjectId) },
          update: {
            $set: {
              periodsPerWeek: row.periodsPerWeek,
              blockSize: row.blockSize,
              teacherId: withTeachers ? (row.teacherId ? new Types.ObjectId(row.teacherId) : null) : (keptTeacher.get(row.subjectId) ?? null),
              // Backups: the ones sent; with none sent the unit's own stay (a whole list saved from elsewhere does not wipe them); a section that is only
              // given the subjects (not the teachers) keeps its own.
              ...(withTeachers
                ? row.backupTeacherIds !== undefined
                  ? { backupTeacherIds: row.teacherId ? row.backupTeacherIds.map((id) => new Types.ObjectId(id)) : [] }
                  : {}
                : { backupTeacherIds: keptBackups.get(row.subjectId) ?? [] }),
              group: row.group,
              groupKey: groupKeyOf(row.group),
              position,
            },
          },
          upsert: true,
        },
      }))
    );
  }
}
