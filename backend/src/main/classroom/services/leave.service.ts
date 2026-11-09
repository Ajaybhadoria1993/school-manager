import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { ParentService } from "../../parents/services/parent.service";
import { Student } from "../../students/models/Student";
import { placesOf, placeTitle, fullName } from "../../students/services/shared";
import { Notify } from "../../notifications/services/events";
import { User } from "../../users/models/User";
import { LeaveRequest, type ILeaveRequest, type LeaveStatus } from "../models/LeaveRequest";
import type { ApplyLeaveInput, DecideLeaveInput, LeaveQuery } from "../schemas/classroom.schemas";
import { classTeacherUnits, RUNNER_ROLES, sameUnit, teacherOfUser } from "./access";
import { fromDay, toDay } from "./calendar.service";

export interface LeaveDto {
  id: string;
  student: { id: string; name: string; admissionNumber: string };
  label: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  appliedBy: string;
  status: LeaveStatus;
  note: string | null;
  decidedBy: { name: string; role: string } | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface Caller {
  userId: string;
  role: string;
}

const NOT_FOUND = () => ApiError.notFound("Leave not found", "LEAVE_NOT_FOUND");
const DAY_MS = 24 * 60 * 60 * 1000;
/** The class or section the leave was sent for (none when the child had no class then). */
const unitOf = (l: Pick<ILeaveRequest, "classId" | "sectionId">) => (l.classId ? { classId: l.classId.toString(), sectionId: l.sectionId ? l.sectionId.toString() : null } : null);
const daysOf = (l: Pick<ILeaveRequest, "fromDate" | "toDate">) => Math.round((l.toDate.getTime() - l.fromDate.getTime()) / DAY_MS) + 1;

async function toDtos(tenantId: string, leaves: ILeaveRequest[]): Promise<LeaveDto[]> {
  const students = await Student.find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: leaves.map((l) => l.studentId) } })
    .select("firstName lastName admissionNumber")
    .lean();
  const byId = new Map(students.map((s) => [s._id.toString(), s]));
  return leaves.map((l) => {
    const s = byId.get(l.studentId.toString());
    return {
      id: l._id.toString(),
      student: { id: l.studentId.toString(), name: s ? fullName(s) : "A student", admissionNumber: s?.admissionNumber ?? "" },
      label: l.label,
      fromDate: toDay(l.fromDate),
      toDate: toDay(l.toDate),
      days: daysOf(l),
      reason: l.reason,
      appliedBy: l.appliedBy,
      status: l.status,
      note: l.note ?? null,
      decidedBy: l.decidedBy ? { name: l.decidedBy.name, role: l.decidedBy.role } : null,
      decidedAt: l.decidedAt ? l.decidedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    };
  });
}

/**
 * Leave (docs/parent-teacher-flow.md, phase 2): a parent applies for their child; the child's class teacher (of the class or section the
 * child was in when it was sent) and the people who run the school see it and answer it once; the parent can take back one still waiting.
 */
export class LeaveService {
  static async apply(tenantId: string, userId: string, studentId: string, input: ApplyLeaveInput): Promise<LeaveDto> {
    const { guardian, student } = await ParentService.childOf(tenantId, userId, studentId);
    const school = new Types.ObjectId(tenantId);
    const yearId = await AcademicYearService.activeYearId(school);
    const place = (await placesOf(school, yearId, [student._id])).get(student._id.toString());
    const relation = student.guardians.find((g) => g.guardianId.equals(guardian._id))?.relation ?? "Guardian";
    const made = await LeaveRequest.create({
      tenantId: school,
      studentId: student._id,
      guardianId: guardian._id,
      academicYearId: yearId ?? null,
      classId: place ? new Types.ObjectId(place.classId) : null,
      sectionId: place?.sectionId ? new Types.ObjectId(place.sectionId) : null,
      label: place ? placeTitle(place.className, place.sectionName) : "",
      fromDate: fromDay(input.fromDate),
      toDate: fromDay(input.toDate ?? input.fromDate),
      reason: input.reason,
      appliedBy: `${guardian.name} (${relation})`,
    });
    const dto = (await toDtos(tenantId, [made.toObject()]))[0];
    Notify.leaveApplied(tenantId, userId, dto, unitOf(made));
    return dto;
  }

  /** The child's leaves, newest first (for their parent). */
  static async ofChild(tenantId: string, userId: string, studentId: string): Promise<{ items: LeaveDto[] }> {
    const { student } = await ParentService.childOf(tenantId, userId, studentId);
    const leaves = await LeaveRequest.find({ tenantId: new Types.ObjectId(tenantId), studentId: student._id }).sort({ createdAt: -1 }).limit(100).lean();
    return { items: await toDtos(tenantId, leaves) };
  }

  static async cancel(tenantId: string, userId: string, studentId: string, leaveId: string): Promise<LeaveDto> {
    const { student } = await ParentService.childOf(tenantId, userId, studentId);
    if (!Types.ObjectId.isValid(leaveId)) throw NOT_FOUND();
    const school = new Types.ObjectId(tenantId);
    const current = await LeaveRequest.findOne({ _id: leaveId, tenantId: school, studentId: student._id }).lean();
    if (!current) throw NOT_FOUND();
    if (current.status !== "pending") throw ApiError.conflict("This leave is already answered: it cannot be taken back.", "LEAVE_DECIDED");
    const updated = await LeaveRequest.findOneAndUpdate({ _id: current._id, tenantId: school, status: "pending" }, { $set: { status: "cancelled" } }, { new: true }).lean();
    if (!updated) throw ApiError.conflict("This leave is already answered: it cannot be taken back.", "LEAVE_DECIDED");
    const dto = (await toDtos(tenantId, [updated]))[0];
    Notify.leaveCancelled(tenantId, userId, dto, unitOf(updated));
    return dto;
  }

  /** The leaves a class teacher answers (their classes) or, for the people who run the school, every one; newest first. */
  static async inbox(tenantId: string, caller: Caller, query: LeaveQuery): Promise<{ items: LeaveDto[] }> {
    const school = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (query.status === "pending") filter.status = "pending";
    if (!RUNNER_ROLES.includes(caller.role)) {
      const teacher = await teacherOfUser(tenantId, caller.userId);
      const units = teacher ? await classTeacherUnits(tenantId, teacher._id) : [];
      if (units.length === 0) return { items: [] };
      filter.$or = units.map((u) => ({ classId: u.classId, sectionId: u.sectionId }));
    }
    const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return { items: await toDtos(tenantId, leaves) };
  }

  static async decide(tenantId: string, caller: Caller, id: string, input: DecideLeaveInput): Promise<LeaveDto> {
    const school = new Types.ObjectId(tenantId);
    const current = await LeaveRequest.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw NOT_FOUND();
    const user = await User.findById(caller.userId).select("name role").lean();
    if (!RUNNER_ROLES.includes(caller.role)) {
      const teacher = await teacherOfUser(tenantId, caller.userId);
      const units = teacher ? await classTeacherUnits(tenantId, teacher._id) : [];
      if (!units.some((u) => sameUnit(u, current))) throw ApiError.forbidden("Only the class teacher of this class or the school can answer this leave.", "NOT_CLASS_TEACHER");
    }
    if (current.status !== "pending") throw ApiError.conflict("This leave is already answered.", "LEAVE_DECIDED");
    const updated = await LeaveRequest.findOneAndUpdate(
      { _id: current._id, tenantId: school, status: "pending" },
      { $set: { status: input.status, note: input.note ?? null, decidedBy: { name: user?.name ?? "The school", role: caller.role }, decidedAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) throw ApiError.conflict("This leave is already answered.", "LEAVE_DECIDED");
    const dto = (await toDtos(tenantId, [updated]))[0];
    Notify.leaveDecided(tenantId, caller.userId, dto, unitOf(updated), input.status, user?.name ?? "The school");
    return dto;
  }
}
