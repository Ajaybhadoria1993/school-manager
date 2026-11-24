import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Notify, dayRange } from "../../notifications/services/events";
import { StaffMember } from "../../staff/models/StaffMember";
import { Teacher } from "../../staff/models/Teacher";
import { staffRoleLabel } from "../../staff/constants";
import { Substitution } from "../../timetable/models/Substitution";
import { User } from "../../users/models/User";
import { StaffLeave, type IStaffLeave, type StaffLeaveKind, type StaffLeaveStatus } from "../models/StaffLeave";
import type { ApplyStaffLeaveInput, DecideStaffLeaveInput, StaffLeaveQuery } from "../schemas/attendance.schemas";
import { eachDay } from "./schoolDays";

/**
 * The leave of the teachers and the staff (2026-11-24). A person applies from their own login (today or days to come, with a reason); the school
 * answers (approve, or decline with a note); an approved leave makes the person "on leave" for those days (attendance reads Leave, the arrangement page
 * lists their periods). The person can take a leave back: a waiting one, or an approved one that has not begun (its arrangements go with it).
 */

export interface StaffLeaveDto {
  id: string;
  kind: StaffLeaveKind;
  personId: string;
  name: string;
  roleLabel: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: StaffLeaveStatus;
  note: string | null;
  decidedBy: { name: string; role: string } | null;
  decidedAt: string | null;
  createdAt: string;
  /** The person can take it back (their own list): waiting, or approved and not begun. */
  canCancel: boolean;
}

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id);
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
const NOT_FOUND = () => ApiError.notFound("Leave not found", "LEAVE_NOT_FOUND");
/** Who is on the staff's sheet: the same as the staff's attendance (active, and not teaching: one who also teaches signs in as a teacher). */
const STAFF_ON_SHEET = { status: "active", teacherId: null } as const;

/** "25 Nov", "25 Nov to 27 Nov". */
const whenWords = (l: Pick<IStaffLeave, "fromDate" | "toDate">) => dayRange(l.fromDate, l.toDate);

function toDto(l: IStaffLeave, today: string): StaffLeaveDto {
  return {
    id: l._id.toString(),
    kind: l.kind,
    personId: (l.kind === "teacher" ? l.teacherId : l.staffMemberId)!.toString(),
    name: l.personName,
    roleLabel: l.roleLabel,
    fromDate: l.fromDate,
    toDate: l.toDate,
    days: daysBetween(l.fromDate, l.toDate),
    reason: l.reason,
    status: l.status,
    note: l.note ?? null,
    decidedBy: l.decidedBy ? { name: l.decidedBy.name, role: l.decidedBy.role } : null,
    decidedAt: l.decidedAt ? l.decidedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
    canCancel: l.status === "pending" || (l.status === "approved" && l.fromDate > today),
  };
}

export class StaffLeaveService {
  /** Whose login this is: a teacher's (the role teacher) or a staff member's (any other). Anyone else is refused. */
  private static async personOf(tenantId: string, caller: { userId: string; role: string }) {
    const school = asId(tenantId);
    if (caller.role === "teacher") {
      const teacher = await Teacher.findOne({ tenantId: school, userId: asId(caller.userId), isActive: true }).select("name").lean();
      if (!teacher) throw ApiError.forbidden("This login is not a teacher's", "FORBIDDEN");
      return { kind: "teacher" as const, teacherId: teacher._id, staffMemberId: null, name: teacher.name, roleLabel: "Teacher" };
    }
    const staff = await StaffMember.findOne({ tenantId: school, userId: asId(caller.userId), ...STAFF_ON_SHEET }).select("name role roleOther").lean();
    if (!staff) throw ApiError.forbidden("This login is not a staff member's", "NOT_STAFF_MEMBER");
    return { kind: "staff" as const, teacherId: null, staffMemberId: staff._id, name: staff.name, roleLabel: staffRoleLabel(staff.role, staff.roleOther) };
  }

  /** The person's own applications, newest first. */
  static async mine(tenantId: string, caller: { userId: string; role: string }): Promise<{ items: StaffLeaveDto[] }> {
    await StaffLeaveService.personOf(tenantId, caller);
    const today = indiaNow().date;
    const items = await StaffLeave.find({ tenantId: asId(tenantId), userId: asId(caller.userId) }).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((l) => toDto(l as IStaffLeave, today)) };
  }

  /** A person applies for today or days to come. Their own waiting or approved leaves cannot overlap it. The people who run the school are told. */
  static async apply(tenantId: string, caller: { userId: string; role: string }, input: ApplyStaffLeaveInput): Promise<StaffLeaveDto> {
    const person = await StaffLeaveService.personOf(tenantId, caller);
    const today = indiaNow().date;
    const toDate = input.toDate ?? input.fromDate;
    if (input.fromDate < today) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "fromDate", message: "Choose today or a day to come" }]);
    const yearId = await AcademicYearService.activeYearId(tenantId);
    if (!yearId) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const clash = await StaffLeave.findOne({
      tenantId: asId(tenantId),
      userId: asId(caller.userId),
      status: { $in: ["pending", "approved"] },
      fromDate: { $lte: toDate },
      toDate: { $gte: input.fromDate },
    })
      .select("fromDate toDate")
      .lean();
    if (clash) throw ApiError.conflict(`You already have a leave for ${whenWords(clash)}.`, "LEAVE_OVERLAP");
    const made = await StaffLeave.create({
      tenantId,
      academicYearId: yearId,
      kind: person.kind,
      teacherId: person.teacherId,
      staffMemberId: person.staffMemberId,
      userId: caller.userId,
      personName: person.name,
      roleLabel: person.roleLabel,
      fromDate: input.fromDate,
      toDate,
      reason: input.reason,
    });
    Notify.staffLeaveApplied(tenantId, caller.userId, { personName: person.name, roleLabel: person.roleLabel, when: whenWords(made), reason: input.reason });
    return toDto(made.toObject() as IStaffLeave, today);
  }

  /**
   * The person takes a leave back: a waiting one at any time, an approved one until it begins (then they ask the school). An approved one that is taken
   * back lets go of the substitutes put in for those days (they hear it) and tells the school.
   */
  static async cancelMine(tenantId: string, caller: { userId: string; role: string }, id: string): Promise<StaffLeaveDto> {
    await StaffLeaveService.personOf(tenantId, caller);
    const leave = await StaffLeave.findOne({ _id: asId(id), tenantId: asId(tenantId), userId: asId(caller.userId) }).lean();
    if (!leave) throw NOT_FOUND();
    const today = indiaNow().date;
    if (leave.status === "declined" || leave.status === "cancelled") throw ApiError.conflict(`This leave is already ${leave.status}.`, "LEAVE_ANSWERED");
    if (leave.status === "approved" && leave.fromDate <= today) throw ApiError.conflict("This leave has begun: ask the school to change it.", "LEAVE_BEGUN");
    const after = await StaffLeave.findOneAndUpdate({ _id: leave._id, tenantId: asId(tenantId), status: leave.status }, { $set: { status: "cancelled" } }, { new: true }).lean();
    if (!after) throw ApiError.conflict("This leave was just answered: look at it again.", "LEAVE_ANSWERED");
    if (leave.status === "approved") {
      Notify.staffLeaveCancelled(tenantId, caller.userId, { personName: leave.personName, roleLabel: leave.roleLabel, when: whenWords(leave) });
      await StaffLeaveService.letGoOfSubstitutes(tenantId, caller.userId, leave as IStaffLeave);
    }
    return toDto(after as IStaffLeave, today);
  }

  /** The arrangements made for a teacher's leave days go when the leave is taken back; each substitute is told. */
  private static async letGoOfSubstitutes(tenantId: string, actorId: string, leave: IStaffLeave): Promise<void> {
    if (leave.kind !== "teacher" || !leave.teacherId) return;
    const school = asId(tenantId);
    const where = { tenantId: school, absentTeacherId: leave.teacherId, date: { $gte: leave.fromDate, $lte: leave.toDate } };
    const made = await Substitution.find(where).select("substituteTeacherId date").lean();
    if (made.length === 0) return;
    await Substitution.deleteMany(where);
    const byTeacher = new Map<string, Set<string>>();
    for (const s of made) byTeacher.set(s.substituteTeacherId.toString(), (byTeacher.get(s.substituteTeacherId.toString()) ?? new Set()).add(s.date));
    for (const [teacherId, days] of byTeacher) Notify.substituteReleased(tenantId, actorId, { teacherId, absentName: leave.personName, days: [...days].sort() });
  }

  /** The school's list: the waiting ones (oldest day first) or all (newest first), of everyone or only teachers or staff; and how many are waiting in all. */
  static async list(tenantId: string, query: StaffLeaveQuery): Promise<{ items: StaffLeaveDto[]; waiting: number }> {
    const school = asId(tenantId);
    const today = indiaNow().date;
    const filter = { tenantId: school, ...(query.who === "all" ? {} : { kind: query.who }), ...(query.status === "pending" ? { status: "pending" } : {}) };
    const [items, waiting] = await Promise.all([
      StaffLeave.find(filter)
        .sort(query.status === "pending" ? { fromDate: 1, createdAt: 1 } : { createdAt: -1 })
        .limit(300)
        .lean(),
      StaffLeave.countDocuments({ tenantId: school, status: "pending" }),
    ]);
    return { items: items.map((l) => toDto(l as IStaffLeave, today)), waiting };
  }

  static async exists(tenantId: string, id: string): Promise<boolean> {
    return (await StaffLeave.countDocuments({ _id: asId(id), tenantId: asId(tenantId) })) > 0;
  }

  /** The school answers a waiting application. Not one's own; not one whose days are over. The person hears it. */
  static async decide(tenantId: string, actor: { userId: string; role: string }, id: string, input: DecideStaffLeaveInput): Promise<StaffLeaveDto> {
    const leave = await StaffLeave.findOne({ _id: asId(id), tenantId: asId(tenantId) }).lean();
    if (!leave) throw NOT_FOUND();
    if (leave.userId.toString() === actor.userId) throw ApiError.forbidden("You cannot answer your own leave: another admin does.", "OWN_LEAVE");
    const today = indiaNow().date;
    if (leave.status !== "pending") throw ApiError.conflict(`This leave is already ${leave.status}.`, "LEAVE_ANSWERED");
    if (leave.toDate < today) throw ApiError.conflict("The days of this leave are over.", "LEAVE_OVER");
    const by = await User.findById(actor.userId).select("name role").lean();
    const decidedBy = { name: by?.name ?? "The school", role: by?.role ?? actor.role };
    const after = await StaffLeave.findOneAndUpdate(
      { _id: leave._id, tenantId: asId(tenantId), status: "pending" },
      { $set: { status: input.status, note: input.note, decidedBy, decidedAt: new Date() } },
      { new: true }
    ).lean();
    // Answered by someone else a moment ago.
    if (!after) throw ApiError.conflict("This leave was just answered: look at it again.", "LEAVE_ANSWERED");
    Notify.staffLeaveDecided(tenantId, actor.userId, { userId: leave.userId.toString(), status: input.status, when: whenWords(leave), decider: decidedBy.name, note: input.note });
    return toDto(after as IStaffLeave, today);
  }

  /** The days of the range each person is on an approved leave: person id -> the days. The attendance sheets read it (Leave, not Absent). */
  static async leaveDays(tenantId: string, kind: StaffLeaveKind, personIds: (string | Types.ObjectId)[], from: string, to: string): Promise<Map<string, Set<string>>> {
    const found = new Map<string, Set<string>>();
    if (personIds.length === 0 || from > to) return found;
    const field = kind === "teacher" ? "teacherId" : "staffMemberId";
    const leaves = await StaffLeave.find({ tenantId: asId(tenantId), kind, [field]: { $in: personIds.map(asId) }, status: "approved", fromDate: { $lte: to }, toDate: { $gte: from } })
      .select(`${field} fromDate toDate`)
      .lean();
    for (const l of leaves) {
      const id = (kind === "teacher" ? l.teacherId : l.staffMemberId)!.toString();
      const days = found.get(id) ?? new Set<string>();
      for (const day of eachDay(l.fromDate > from ? l.fromDate : from, l.toDate < to ? l.toDate : to)) days.add(day);
      found.set(id, days);
    }
    return found;
  }

  /** The teachers (or staff) on an approved leave on this day. */
  static async onLeaveOn(tenantId: string, kind: StaffLeaveKind, day: string): Promise<Set<string>> {
    const leaves = await StaffLeave.find({ tenantId: asId(tenantId), kind, status: "approved", fromDate: { $lte: day }, toDate: { $gte: day } })
      .select("teacherId staffMemberId")
      .lean();
    return new Set(leaves.map((l) => (kind === "teacher" ? l.teacherId : l.staffMemberId)!.toString()));
  }
}
