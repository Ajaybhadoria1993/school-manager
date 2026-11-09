import { Types } from "mongoose";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Enrolment } from "../models/Enrolment";
import { EnrolmentChange, type ITransferSchool } from "../models/EnrolmentChange";
import { Guardian } from "../models/Guardian";
import { Student, type IStudent } from "../models/Student";
import { StudentStatusLog, type StatusAction } from "../models/StudentStatusLog";
import type { ListInactiveQuery, TransferOutInput } from "../schemas/students.schemas";
import { actorRecord, type Actor, type ActorRecord } from "./actor";
import { day, escapeRegex, fullName, placesOf, STUDENT_NOT_FOUND, type StudentDetailDto } from "./shared";
import { StudentService } from "./student.service";
import { ParentLoginService } from "./parentLogin.service";
import { resolvePlacement, sectionFull, seatsTaken } from "./placement";

/** Who is doing it, as the session knows them (the name is read here, from their account). */
export type StatusActor = Actor;

/** An inactive student, with what is needed to recognise them and to see who made them inactive, when and why. */
export interface InactiveStudentDto {
  id: string;
  name: string;
  gender: IStudent["gender"];
  admissionNumber: string;
  dateOfBirth: string;
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  parentName: string | null;
  parentMobile: string | null;
  reason: string | null;
  /** The transfer certificate details, when the student left for another school. */
  transfer: ITransferSchool | null;
  inactiveAt: string;
  inactiveBy: { name: string; role: string };
}

export interface InactivePage {
  items: InactiveStudentDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type By = ActorRecord;
type Places = Awaited<ReturnType<typeof placesOf>>;

const uniqueIds = (ids: string[]) => [...new Set(ids)].map((id) => new Types.ObjectId(id));

/**
 * Active and inactive students. A student who leaves (or was admitted by mistake) is made **inactive**: kept whole (`status`
 * `inactive`, and their enrolments too), out of every list, seat count, export, sibling list and search, and active again with one click
 * when they return. Nothing here deletes a student, ever. Every action says how many were done and how many were skipped (not found,
 * another school's, or not in the right state), and never fails the whole request for one of them. Each is written to
 * StudentStatusLog with who did it, when and why.
 */
export class StudentStatusService {
  /** The class and section each of these students has this year (the log must say who the student was). */
  private static async placesFor(school: Types.ObjectId, studentIds: Types.ObjectId[], inYear?: Types.ObjectId): Promise<{ yearId: Types.ObjectId | null; places: Places }> {
    const year = inYear ? { _id: inYear } : await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id").lean();
    return { yearId: year?._id ?? null, places: await placesOf(school, year?._id ?? null, studentIds) };
  }

  private static async log(
    school: Types.ObjectId,
    action: StatusAction,
    by: By,
    reason: string | null,
    students: Pick<IStudent, "_id" | "firstName" | "lastName" | "admissionNumber">[],
    places: Places
  ) {
    if (students.length === 0) return;
    await StudentStatusLog.insertMany(
      students.map((s) => ({
        tenantId: school,
        action,
        studentId: s._id,
        name: fullName(s),
        admissionNumber: s.admissionNumber,
        className: places.get(s._id.toString())?.className ?? null,
        sectionName: places.get(s._id.toString())?.sectionName ?? null,
        reason,
        by,
      }))
    );
  }

  /** Makes active students inactive. Their roll number is freed (kept on the student, to give back); their seat is free again. */
  static async deactivate(
    tenantId: string,
    actor: StatusActor,
    ids: string[],
    reason: string | null,
    transfer: ITransferSchool | null = null,
    /** The year their place is read from (and its roll number freed in); the running year when not given. */
    inYear?: Types.ObjectId
  ): Promise<{ deactivated: number; skipped: number }> {
    const school = new Types.ObjectId(tenantId);
    const wanted = uniqueIds(ids);
    const students = await Student.find({ tenantId: school, _id: { $in: wanted }, status: "active" }).lean();
    const { yearId, places } = await StudentStatusService.placesFor(school, students.map((s) => s._id), inYear);
    const by = await actorRecord(actor);
    const at = new Date();

    const moved: typeof students = [];
    await Promise.all(
      students.map(async (s) => {
        const roll = places.get(s._id.toString())?.rollNumber ?? null;
        // The condition is the last word when two people press at the same moment: only the first one counts.
        const done = await Student.updateOne({ _id: s._id, tenantId: school, status: "active" }, { $set: { status: "inactive", inactive: { at, by, reason, rollNumber: roll, transfer } } });
        if (done.modifiedCount === 0) return;
        moved.push(s);
        await Enrolment.updateMany({ tenantId: school, studentId: s._id, status: "active" }, { $set: { status: "inactive" } });
        if (yearId) await Enrolment.updateOne({ tenantId: school, studentId: s._id, academicYearId: yearId }, { $set: { rollNumber: null } });
        const was = places.get(s._id.toString());
        if (transfer && yearId && was) {
          // A transfer to another school stays in the student's history: where they were, who let them go, when, and the certificate.
          await EnrolmentChange.create({
            tenantId: school,
            academicYearId: yearId,
            studentId: s._id,
            enrolmentId: new Types.ObjectId(was.enrolmentId),
            kind: "transferred_out",
            from: { classId: new Types.ObjectId(was.classId), className: was.className, sectionId: was.sectionId ? new Types.ObjectId(was.sectionId) : null, sectionName: was.sectionName, rollNumber: was.rollNumber },
            to: null,
            reason,
            school: transfer,
            by,
          });
        }
      })
    );
    await StudentStatusService.log(school, "deactivated", by, reason, moved, places);
    // A parent whose last child here has left cannot sign in any more (2026-11-04, the user).
    await ParentLoginService.followChildren(school, moved);
    return { deactivated: moved.length, skipped: wanted.length - moved.length };
  }

  /**
   * A student leaves for another school: they become inactive (nothing is deleted) with the new school's name and the transfer certificate
   * kept on them and in their history. One student at a time (the certificate is theirs). 404 when they are not an active student of this school.
   */
  static async transferOut(tenantId: string, actor: StatusActor, id: string, input: TransferOutInput): Promise<StudentDetailDto> {
    const transfer: ITransferSchool = { schoolName: input.schoolName, tcNumber: input.tcNumber, tcDate: input.tcDate, remarks: input.remarks };
    const done = await StudentStatusService.deactivate(tenantId, actor, [id], `Transferred to ${input.schoolName}`, transfer);
    if (done.deactivated === 0) throw STUDENT_NOT_FOUND();
    return StudentService.get(tenantId, id);
  }

  /** The inactive students, the most recently made inactive first. */
  static async list(tenantId: string, query: ListInactiveQuery): Promise<InactivePage> {
    const school = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school, status: "inactive" };
    if (query.q) {
      filter.$or = [
        { nameKey: { $regex: escapeRegex(query.q.toLowerCase().replace(/\s+/g, " ")) } },
        { admissionNumber: { $regex: escapeRegex(query.q.toUpperCase().replace(/\s+/g, "")) } },
      ];
    }
    const [total, students] = await Promise.all([
      Student.countDocuments(filter),
      Student.find(filter)
        .sort({ "inactive.at": -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
    ]);
    const { places } = await StudentStatusService.placesFor(school, students.map((s) => s._id));
    const primaryIds = students.flatMap((s) => s.guardians.filter((g) => g.isPrimary).map((g) => g.guardianId));
    const parents = new Map((await Guardian.find({ tenantId: school, _id: { $in: primaryIds } }).select("name mobile").lean()).map((g) => [g._id.toString(), g]));

    return {
      items: students.map((s) => {
        const place = places.get(s._id.toString());
        const parent = parents.get(s.guardians.find((g) => g.isPrimary)?.guardianId.toString() ?? "");
        return {
          id: s._id.toString(),
          name: fullName(s),
          gender: s.gender,
          admissionNumber: s.admissionNumber,
          dateOfBirth: day(s.dateOfBirth),
          className: place?.className ?? null,
          sectionName: place?.sectionName ?? null,
          rollNumber: s.inactive?.rollNumber ?? null,
          parentName: parent?.name ?? null,
          parentMobile: parent?.mobile ?? null,
          reason: s.inactive?.reason ?? null,
          transfer: s.inactive?.transfer ?? null,
          inactiveAt: (s.inactive?.at ?? s.updatedAt).toISOString(),
          inactiveBy: { name: s.inactive?.by.name ?? "Unknown", role: s.inactive?.by.role ?? "" },
        };
      }),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /**
   * Makes inactive students active again, where they were. The roll number comes back only when nobody took it while they were away. A
   * student who has no place in the running year (they left in an earlier year) needs one: `placement` (a class and section of this
   * year) puts them there; without it they are left as they are and counted in `needsPlacement`, for the screen to ask where.
   */
  static async reactivate(
    tenantId: string,
    actor: StatusActor,
    ids: string[],
    placement?: { classId: string; sectionId?: string | null }
  ): Promise<{ reactivated: number; skipped: number; rollNumbersLost: number; needsPlacement?: number }> {
    const school = new Types.ObjectId(tenantId);
    const wanted = uniqueIds(ids);
    const found = await Student.find({ tenantId: school, _id: { $in: wanted }, status: "inactive" }).lean();
    const { yearId, places } = await StudentStatusService.placesFor(school, found.map((s) => s._id));
    const by = await actorRecord(actor);

    // Who already has a place in the running year (the usual case), and who needs a new one.
    const has = new Set(
      yearId ? (await Enrolment.find({ tenantId: school, academicYearId: yearId, studentId: { $in: found.map((s) => s._id) } }).select("studentId").lean()).map((e) => e.studentId.toString()) : []
    );
    const homeless = yearId ? found.filter((s) => !has.has(s._id.toString())) : [];
    let seat: Awaited<ReturnType<typeof resolvePlacement>> | null = null;
    if (homeless.length > 0 && placement && yearId) {
      // Checked before anyone is changed: a wrong or full section refuses the whole request.
      seat = await resolvePlacement(school, yearId, placement.classId, placement.sectionId);
      if (seat.sectionId && seat.capacity !== null) {
        const taken = await seatsTaken(school, yearId, seat.sectionId);
        if (taken + homeless.length > seat.capacity) throw sectionFull(seat, taken);
      }
    }
    const students = seat ? found : found.filter((s) => !homeless.includes(s));
    const needsPlacement = seat ? 0 : homeless.length;

    const back: typeof students = [];
    let rollNumbersLost = 0;
    await Promise.all(
      students.map(async (s) => {
        const done = await Student.updateOne({ _id: s._id, tenantId: school, status: "inactive" }, { $set: { status: "active", inactive: null } });
        if (done.modifiedCount === 0) return;
        back.push(s);
        if (seat && yearId && !has.has(s._id.toString())) {
          // They left in an earlier year: this year's place is a new enrolment (the old ones stay as they were).
          await Enrolment.create({ tenantId: school, studentId: s._id, academicYearId: yearId, classId: seat.classId, sectionId: seat.sectionId, rollNumber: null, status: "active", enrolledAt: new Date() });
          return;
        }
        await Enrolment.updateMany({ tenantId: school, studentId: s._id, status: "inactive" }, { $set: { status: "active" } });
        const roll = s.inactive?.rollNumber ?? null;
        if (roll === null || !yearId) return;
        const own = await Enrolment.findOne({ tenantId: school, studentId: s._id, academicYearId: yearId }).select("_id").lean();
        if (!own) return;
        try {
          // The unique index on roll numbers settles it when someone has the number (or takes it at this very moment).
          await Enrolment.updateOne({ tenantId: school, _id: own._id }, { $set: { rollNumber: roll } });
        } catch {
          rollNumbersLost += 1;
        }
      })
    );
    await StudentStatusService.log(school, "reactivated", by, null, back, places);
    // A parent whose child is back can sign in again.
    await ParentLoginService.followChildren(school, back);
    return { reactivated: back.length, skipped: wanted.length - back.length - needsPlacement, rollNumbersLost, ...(needsPlacement > 0 ? { needsPlacement } : {}) };
  }
}
