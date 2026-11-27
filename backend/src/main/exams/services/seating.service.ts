import type { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { seatedIn } from "../../academics/services/viewedYear";
import { isDuplicateKey } from "../../academics/services/shared";
import { Enrolment } from "../../students/models/Enrolment";
import { Guardian } from "../../students/models/Guardian";
import { Student } from "../../students/models/Student";
import { fullName, placeTitle } from "../../students/services/shared";
import type { IExam } from "../models/Exam";
import { ExamRoom, type IExamRoom } from "../models/ExamRoom";
import type { RollNumbersInput, RoomInput, RosterQuery } from "../schemas/exams.schemas";
import { audienceOf, isInAudience, schoolLayout } from "./audience";
import { asId } from "./dto";
import { DutyService, type DutyDto } from "./duty.service";
import { ExamService } from "./exam.service";

/**
 * The children of an exam and where they sit (2026-11-27, the user: "sab bacche, filter, naam, father name, roll number; admission ke time roll number
 * nahi diya to yahan de sakein; Room number: kitne se kitne bacche kis room mein; sab parent ko bhi jaayega"). The roll number is the child's own in
 * their class or section (`Enrolment.rollNumber`, the admission's: used once in a section in a year). A room holds a run of roll numbers of a class or
 * section (`ExamRoom`); a child is in the room whose run holds their roll number.
 */

type Detail = { path: string; message: string };
const invalid = (details: Detail[]) => ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", details);
const ROOM_NOT_FOUND = () => ApiError.notFound("This room is not in the exam any more", "ROOM_NOT_FOUND");
const same = (a: Types.ObjectId | string | null | undefined, b: Types.ObjectId | string | null | undefined) => String(a ?? "") === String(b ?? "");

export interface RosterRowDto {
  id: string;
  name: string;
  admissionNumber: string;
  fatherName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  room: string | null;
}

export interface RoomDto {
  id: string;
  examId: string;
  room: string;
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  fromRoll: number;
  toRoll: number;
  /** The children (of the class or section now) whose roll number is in the run. */
  students: number;
}

/** A class or section of the exam where some children have no room yet: with a roll number and no room, and with no roll number at all. */
export interface LeftDto {
  classId: string;
  className: string;
  sectionId: string | null;
  sectionName: string | null;
  withoutRoom: number;
  withoutRoll: number;
}

/** The roll numbers given in a class or section of the exam, lowest first (the Rooms tab counts a run with them while it is written). */
export interface RollsDto {
  classId: string;
  sectionId: string | null;
  numbers: number[];
}

/** The room whose run holds this roll number in this class or section, or null. */
export const roomFor = (rooms: Pick<IExamRoom, "room" | "classId" | "sectionId" | "fromRoll" | "toRoll">[], place: { classId: string | Types.ObjectId; sectionId: string | Types.ObjectId | null }, roll: number | null) =>
  roll === null ? null : (rooms.find((r) => same(r.classId, place.classId) && same(r.sectionId, place.sectionId) && roll >= r.fromRoll && roll <= r.toRoll)?.room ?? null);

export class SeatingService {
  /** A class of the school that the exam is for (400 under `classId` otherwise). */
  private static async classOf(tenantId: string, exam: IExam, classId: string) {
    const klass = await SchoolClass.findOne({ tenantId: asId(tenantId), _id: asId(classId) }).select("name order departmentId").lean();
    if (!klass) throw invalid([{ path: "classId", message: "Choose a class of this school" }]);
    if (!isInAudience(exam, klass)) throw invalid([{ path: "classId", message: `${klass.name} is not in this exam` }]);
    return klass;
  }

  /** A class's sections in the exam's year, by name. */
  private static sectionsOf(tenantId: string, exam: IExam, classId: Types.ObjectId) {
    return Section.find({ tenantId: asId(tenantId), classId, academicYearId: exam.academicYearId }).select("name").sort({ name: 1 }).lean();
  }

  /** A class's children (or one section's) with their father's name, roll number and room; by section, roll number (none last) and name. */
  static async roster(tenantId: string, examId: string, query: RosterQuery) {
    const school = asId(tenantId);
    const exam = await ExamService.find(tenantId, examId);
    const klass = await SeatingService.classOf(tenantId, exam, query.classId);
    const sections = await SeatingService.sectionsOf(tenantId, exam, klass._id);
    if (query.sectionId && !sections.some((s) => same(s._id, query.sectionId))) throw invalid([{ path: "sectionId", message: "Choose a section of this class" }]);
    const enrolments = await Enrolment.find({
      tenantId: school,
      academicYearId: exam.academicYearId,
      classId: klass._id,
      ...(query.sectionId ? { sectionId: asId(query.sectionId) } : {}),
      ...seatedIn(exam.academicYearId),
    })
      .select("studentId sectionId rollNumber")
      .lean();
    const [students, rooms] = await Promise.all([
      Student.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.studentId) }, ...seatedIn(exam.academicYearId) }).select("firstName lastName admissionNumber guardians").lean(),
      ExamRoom.find({ tenantId: school, examId: exam._id, classId: klass._id }).lean(),
    ]);
    const fatherIds = students.flatMap((s) => (s.guardians ?? []).filter((g) => g.relation === "Father").map((g) => g.guardianId));
    const fathers = new Map((await Guardian.find({ tenantId: school, _id: { $in: fatherIds } }).select("name").lean()).map((g) => [g._id.toString(), g.name]));
    const enrolmentOf = new Map(enrolments.map((e) => [e.studentId.toString(), e]));
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));

    const items: RosterRowDto[] = students
      .map((s) => {
        const e = enrolmentOf.get(s._id.toString())!;
        const father = (s.guardians ?? []).find((g) => g.relation === "Father");
        const rollNumber = e.rollNumber ?? null;
        return {
          id: s._id.toString(),
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          fatherName: father ? (fathers.get(father.guardianId.toString()) ?? null) : null,
          sectionId: e.sectionId ? e.sectionId.toString() : null,
          sectionName: e.sectionId ? (sectionName.get(e.sectionId.toString()) ?? null) : null,
          rollNumber,
          room: roomFor(rooms, { classId: klass._id, sectionId: e.sectionId ?? null }, rollNumber),
        };
      })
      .sort((a, b) => (a.sectionName ?? "").localeCompare(b.sectionName ?? "") || (a.rollNumber ?? 9999) - (b.rollNumber ?? 9999) || a.name.localeCompare(b.name));
    return {
      classId: klass._id.toString(),
      className: klass.name,
      sectionId: query.sectionId ?? null,
      sections: sections.map((s) => ({ id: s._id.toString(), name: s.name })),
      items,
      counts: { students: items.length, withoutRoll: items.filter((i) => i.rollNumber === null).length, withoutRoom: items.filter((i) => i.rollNumber !== null && i.room === null).length },
    };
  }

  /**
   * Roll numbers of some children at once, each the child's own in their class or section (null clears one): a child in a class of the exam; a number
   * used once in a section (not twice in the list, not another child's). Everything is checked first; the numbers are then freed and given, so two
   * children can swap in one save.
   */
  static async setRollNumbers(tenantId: string, examId: string, input: RollNumbersInput): Promise<{ updated: number }> {
    const school = asId(tenantId);
    const exam = await ExamService.find(tenantId, examId);
    const ids = input.rows.map((r) => asId(r.studentId));
    const [enrolments, students] = await Promise.all([
      Enrolment.find({ tenantId: school, academicYearId: exam.academicYearId, studentId: { $in: ids }, status: "active" }).select("studentId classId sectionId rollNumber").lean(),
      Student.find({ tenantId: school, _id: { $in: ids } }).select("firstName lastName").lean(),
    ]);
    const [classes, sections] = await Promise.all([
      SchoolClass.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.classId) } }).select("name departmentId").lean(),
      Section.find({ tenantId: school, _id: { $in: enrolments.flatMap((e) => (e.sectionId ? [e.sectionId] : [])) } }).select("name").lean(),
    ]);
    const nameOf = new Map(students.map((s) => [s._id.toString(), fullName(s)]));
    const enrolmentOf = new Map(enrolments.map((e) => [e.studentId.toString(), e]));
    const classOf = new Map(classes.map((c) => [c._id.toString(), c]));
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
    const placeOf = (e: { classId: Types.ObjectId; sectionId?: Types.ObjectId | null }) => placeTitle(classOf.get(e.classId.toString())?.name ?? "A class", e.sectionId ? (sectionName.get(e.sectionId.toString()) ?? null) : null);

    const outside = input.rows.flatMap((row, i) => {
      const e = enrolmentOf.get(row.studentId);
      const klass = e ? classOf.get(e.classId.toString()) : undefined;
      return e && klass && isInAudience(exam, klass) ? [] : [{ path: `rows.${i}.studentId`, message: `${nameOf.get(row.studentId) ?? "This child"} is not in a class of this exam` }];
    });
    if (outside.length > 0) throw invalid(outside);

    const keyOf = (e: { classId: Types.ObjectId; sectionId?: Types.ObjectId | null }, roll: number) => `${e.classId.toString()}:${e.sectionId?.toString() ?? ""}:${roll}`;
    const seen = new Set<string>();
    const twice: Detail[] = [];
    input.rows.forEach((row, i) => {
      if (row.rollNumber === null) return;
      const key = keyOf(enrolmentOf.get(row.studentId)!, row.rollNumber);
      if (seen.has(key)) twice.push({ path: `rows.${i}.rollNumber`, message: `Roll number ${row.rollNumber} is given twice in ${placeOf(enrolmentOf.get(row.studentId)!)}` });
      seen.add(key);
    });
    if (twice.length > 0) throw invalid(twice);

    // Another child of the section (not in this list) who has the number already, inactive ones too: the number stays theirs.
    const wanted = input.rows.filter((r) => r.rollNumber !== null).map((r) => ({ e: enrolmentOf.get(r.studentId)!, roll: r.rollNumber! }));
    if (wanted.length > 0) {
      const holders = await Enrolment.find({
        tenantId: school,
        academicYearId: exam.academicYearId,
        studentId: { $nin: ids },
        $or: wanted.map((w) => ({ classId: w.e.classId, sectionId: w.e.sectionId ?? null, rollNumber: w.roll })),
      })
        .select("studentId classId sectionId rollNumber")
        .lean();
      const holder = holders[0];
      if (holder) {
        const who = await Student.findOne({ tenantId: school, _id: holder.studentId }).select("firstName lastName").lean();
        throw ApiError.conflict(`Roll number ${holder.rollNumber} of ${placeOf(holder)} is ${who ? fullName(who) : "another child"}'s`, "ROLL_NUMBER_TAKEN");
      }
    }

    const changed = input.rows.filter((r) => (enrolmentOf.get(r.studentId)!.rollNumber ?? null) !== r.rollNumber);
    if (changed.length === 0) return { updated: 0 };
    const changedIds = changed.map((r) => enrolmentOf.get(r.studentId)!._id);
    await Enrolment.updateMany({ tenantId: school, _id: { $in: changedIds } }, { $set: { rollNumber: null } });
    try {
      for (const row of changed) {
        if (row.rollNumber !== null) await Enrolment.updateOne({ tenantId: school, _id: enrolmentOf.get(row.studentId)!._id }, { $set: { rollNumber: row.rollNumber } });
      }
    } catch (err) {
      // Someone took a number in the meantime: everything goes back as it was.
      await Enrolment.updateMany({ tenantId: school, _id: { $in: changedIds } }, { $set: { rollNumber: null } });
      for (const row of changed) {
        const before = enrolmentOf.get(row.studentId)!;
        if (before.rollNumber != null) await Enrolment.updateOne({ tenantId: school, _id: before._id }, { $set: { rollNumber: before.rollNumber } }).catch(() => undefined);
      }
      if (isDuplicateKey(err)) throw ApiError.conflict("A roll number was just given to another child: reload and try again", "ROLL_NUMBER_TAKEN");
      throw err;
    }
    return { updated: changed.length };
  }

  // ---- Rooms ------------------------------------------------------------------------------------------------------------------------------

  /**
   * The rooms of the exam (by room, class, section, first roll), each with its children counted, and the classes or sections with children left over;
   * the teachers on duty in each room (2026-11-27); and the roll numbers of each class or section, so a run is counted while it is written.
   */
  static async rooms(tenantId: string, examId: string): Promise<{ items: RoomDto[]; left: LeftDto[]; duties: DutyDto[]; rolls: RollsDto[] }> {
    const school = asId(tenantId);
    const exam = await ExamService.find(tenantId, examId);
    const [rooms, layout] = await Promise.all([ExamRoom.find({ tenantId: school, examId: exam._id }).lean(), schoolLayout(tenantId)]);
    const classes = audienceOf(exam, layout).classes;
    const [enrolments, sections] = await Promise.all([
      Enrolment.find({ tenantId: school, academicYearId: exam.academicYearId, classId: { $in: classes.map((c) => asId(c.id)) }, ...seatedIn(exam.academicYearId) }).select("classId sectionId rollNumber").lean(),
      Section.find({ tenantId: school, academicYearId: exam.academicYearId, classId: { $in: [...classes.map((c) => asId(c.id)), ...rooms.map((r) => r.classId)] } }).select("name").lean(),
    ]);
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
    const classRow = new Map(layout.classes.map((c) => [c._id.toString(), c]));
    const countIn = (r: IExamRoom) => enrolments.filter((e) => same(e.classId, r.classId) && same(e.sectionId, r.sectionId) && e.rollNumber != null && e.rollNumber >= r.fromRoll && e.rollNumber <= r.toRoll).length;
    const items = rooms
      .map((r) => SeatingService.roomDto(r, classRow.get(r.classId.toString())?.name ?? "A class", r.sectionId ? (sectionName.get(r.sectionId.toString()) ?? null) : null, countIn(r)))
      .sort(
        (a, b) =>
          a.room.localeCompare(b.room, undefined, { numeric: true, sensitivity: "base" }) ||
          (classRow.get(a.classId)?.order ?? 0) - (classRow.get(b.classId)?.order ?? 0) ||
          (a.sectionName ?? "").localeCompare(b.sectionName ?? "") ||
          a.fromRoll - b.fromRoll
      );

    const units = new Map<string, LeftDto & { order: number }>();
    for (const e of enrolments) {
      const key = `${e.classId.toString()}:${e.sectionId?.toString() ?? ""}`;
      const unit = units.get(key) ?? {
        classId: e.classId.toString(),
        className: classRow.get(e.classId.toString())?.name ?? "A class",
        sectionId: e.sectionId ? e.sectionId.toString() : null,
        sectionName: e.sectionId ? (sectionName.get(e.sectionId.toString()) ?? null) : null,
        withoutRoom: 0,
        withoutRoll: 0,
        order: classRow.get(e.classId.toString())?.order ?? 0,
      };
      const roll = e.rollNumber ?? null;
      if (roll === null) unit.withoutRoll += 1;
      else if (roomFor(rooms, { classId: e.classId, sectionId: e.sectionId ?? null }, roll) === null) unit.withoutRoom += 1;
      units.set(key, unit);
    }
    const ordered = [...units.values()].sort((a, b) => a.order - b.order || (a.sectionName ?? "").localeCompare(b.sectionName ?? ""));
    const left = ordered.filter((u) => u.withoutRoom > 0 || u.withoutRoll > 0).map(({ order: _order, ...u }) => u);
    const rolls = ordered.map((u) => ({
      classId: u.classId,
      sectionId: u.sectionId,
      numbers: enrolments
        .filter((e) => same(e.classId, u.classId) && same(e.sectionId, u.sectionId) && e.rollNumber != null)
        .map((e) => e.rollNumber!)
        .sort((a, b) => a - b),
    }));
    return { items, left, duties: await DutyService.ofRooms(tenantId, exam._id, items.map((r) => r.room)), rolls };
  }

  private static roomDto(r: IExamRoom, className: string, sectionName: string | null, students: number): RoomDto {
    return {
      id: r._id.toString(),
      examId: r.examId.toString(),
      room: r.room,
      classId: r.classId.toString(),
      className,
      sectionId: r.sectionId ? r.sectionId.toString() : null,
      sectionName,
      fromRoll: r.fromRoll,
      toRoll: r.toRoll,
      students,
    };
  }

  /** The checks of a room: a class of the exam, its section when it has sections (none when it has not), and no overlap with another run of it. */
  private static async checkRoom(tenantId: string, exam: IExam, input: RoomInput, ignore: Types.ObjectId | null) {
    const klass = await SeatingService.classOf(tenantId, exam, input.classId);
    const sections = await SeatingService.sectionsOf(tenantId, exam, klass._id);
    const section = input.sectionId ? sections.find((s) => same(s._id, input.sectionId)) : undefined;
    if (sections.length > 0 && !input.sectionId) throw invalid([{ path: "sectionId", message: "Choose the section" }]);
    if (input.sectionId && !section) throw invalid([{ path: "sectionId", message: "Choose a section of this class" }]);
    const place = placeTitle(klass.name, section?.name ?? null);
    const clash = await ExamRoom.findOne({
      tenantId: asId(tenantId),
      examId: exam._id,
      classId: klass._id,
      sectionId: section ? section._id : null,
      fromRoll: { $lte: input.toRoll },
      toRoll: { $gte: input.fromRoll },
      ...(ignore ? { _id: { $ne: ignore } } : {}),
    }).lean();
    if (clash) throw ApiError.conflict(`${place} roll ${clash.fromRoll} to ${clash.toRoll} is in ${clash.room} already`, "ROOM_OVERLAP");
    return { klass, section };
  }

  private static async count(tenantId: string, exam: IExam, r: IExamRoom): Promise<number> {
    return Enrolment.countDocuments({
      tenantId: asId(tenantId),
      academicYearId: exam.academicYearId,
      classId: r.classId,
      sectionId: r.sectionId ?? null,
      rollNumber: { $gte: r.fromRoll, $lte: r.toRoll },
      ...seatedIn(exam.academicYearId),
    });
  }

  static async addRoom(tenantId: string, examId: string, input: RoomInput): Promise<RoomDto> {
    const exam = await ExamService.find(tenantId, examId);
    const { klass, section } = await SeatingService.checkRoom(tenantId, exam, input, null);
    const made = await ExamRoom.create({
      tenantId: asId(tenantId),
      academicYearId: exam.academicYearId,
      examId: exam._id,
      room: input.room,
      classId: klass._id,
      sectionId: section ? section._id : null,
      fromRoll: input.fromRoll,
      toRoll: input.toRoll,
    });
    const row = made.toObject();
    return SeatingService.roomDto(row, klass.name, section?.name ?? null, await SeatingService.count(tenantId, exam, row));
  }

  /** Changes a run; when it was its room's last run and it now has another room's name, the room's duty moves with it (`DutyService.afterRunLeft`). */
  static async updateRoom(tenantId: string, examId: string, roomId: string, input: RoomInput, actorId: string): Promise<RoomDto> {
    const exam = await ExamService.find(tenantId, examId);
    const current = await ExamRoom.findOne({ tenantId: asId(tenantId), examId: exam._id, _id: asId(roomId) }).lean();
    if (!current) throw ROOM_NOT_FOUND();
    const { klass, section } = await SeatingService.checkRoom(tenantId, exam, input, current._id);
    const updated = await ExamRoom.findOneAndUpdate(
      { tenantId: asId(tenantId), examId: exam._id, _id: current._id },
      { $set: { room: input.room, classId: klass._id, sectionId: section ? section._id : null, fromRoll: input.fromRoll, toRoll: input.toRoll } },
      { new: true }
    ).lean();
    if (!updated) throw ROOM_NOT_FOUND();
    await DutyService.afterRunLeft(tenantId, exam, current.room, updated.room, actorId);
    return SeatingService.roomDto(updated, klass.name, section?.name ?? null, await SeatingService.count(tenantId, exam, updated));
  }

  /** Takes a run away; the room's duty goes with its last run. */
  static async removeRoom(tenantId: string, examId: string, roomId: string, actorId: string): Promise<void> {
    const exam = await ExamService.find(tenantId, examId);
    const gone = await ExamRoom.findOneAndDelete({ tenantId: asId(tenantId), examId: exam._id, _id: asId(roomId) }).lean();
    if (!gone) throw ROOM_NOT_FOUND();
    await DutyService.afterRunLeft(tenantId, exam, gone.room, null, actorId);
  }
}
