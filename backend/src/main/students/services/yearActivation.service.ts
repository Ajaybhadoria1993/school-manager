import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { toAcademicYearDto, type AcademicYearDto } from "../../academics/services/academicYear.service";
import { isDuplicateKey } from "../../academics/services/shared";
import { Enrolment } from "../models/Enrolment";
import { PromotionBatch } from "../models/PromotionBatch";
import { Student } from "../models/Student";
import type { Actor } from "./actor";
import { fullName } from "./shared";
import { StudentStatusService } from "./status.service";

/**
 * Switching the next academic year on: the running year is closed and the waiting one becomes the school's year, in one guarded step
 * (the database allows one active year, so a second request cannot also win). Before anything changes it is checked that every
 * student of the running year has a place in the next one (promoted or staying: the approved promotion list) or is leaving (that same
 * list): nobody is left without a class by accident. After the switch the students who leave are made inactive ("Passed out after
 * 2026-2027" from the last class, "Not continuing in 2027-2028" from another) and the list is marked done. Nothing is deleted: every
 * record of the closed year stays with that year.
 */
export class YearActivationService {
  static async activate(tenantId: string, actor: Actor, yearId: string): Promise<AcademicYearDto & { leftSchool: number }> {
    const school = new Types.ObjectId(tenantId);
    const to = await AcademicYear.findOne({ _id: yearId, tenantId: school }).lean();
    if (!to) throw ApiError.notFound("That academic year is not in your school.", "ACADEMIC_YEAR_NOT_FOUND");
    if (to.status !== "pending") throw ApiError.conflict(`${to.name} is not waiting: only the next year can be switched on.`, "NEXT_YEAR_NOT_WAITING");
    const running = await AcademicYear.findOne({ tenantId: school, status: "active" }).lean();
    if (!running) throw ApiError.conflict("Your school has no running academic year to close.", "NO_ACTIVE_YEAR");

    // The approved list says who goes on and who leaves.
    const batch = await PromotionBatch.findOne({ tenantId: school, toAcademicYearId: to._id, status: "approved" }).lean();
    const leaving = (batch?.entries ?? []).filter((e) => e.outcome === "leave");
    const leavingIds = new Set(leaving.map((e) => e.studentId.toString()));

    // Everyone in a class this year needs a place next year, or to be leaving.
    const here = await Enrolment.find({ tenantId: school, academicYearId: running._id, status: "active" }).select("studentId").lean();
    const hereIds = here.map((e) => e.studentId);
    const next = new Set((await Enrolment.find({ tenantId: school, academicYearId: to._id, studentId: { $in: hereIds } }).select("studentId").lean()).map((e) => e.studentId.toString()));
    const unplaced = hereIds.filter((id) => !next.has(id.toString()) && !leavingIds.has(id.toString()));
    if (unplaced.length > 0) {
      const sample = await Student.find({ tenantId: school, _id: { $in: unplaced.slice(0, 10) } }).select("firstName lastName").lean();
      const count = unplaced.length === 1 ? "1 student has" : `${unplaced.length} students have`;
      throw ApiError.conflict(
        `${count} no place in ${to.name} yet. Make the promotion list and get it approved first, or make those students inactive.`,
        "UNPLACED_STUDENTS",
        [{ path: "students", message: `Without a place: ${sample.map(fullName).join(", ")}${unplaced.length > sample.length ? " and others" : ""}`, count: unplaced.length }]
      );
    }

    // The switch: close the running year, then switch the waiting one on; if the second fails, the first is taken back.
    const closed = await AcademicYear.updateOne({ _id: running._id, tenantId: school, status: "active" }, { $set: { status: "closed", closedAt: new Date() } });
    if (closed.modifiedCount === 0) throw ApiError.conflict("The academic year changed while you were switching. Reload and try again.", "ACADEMIC_YEAR_CHANGED");
    const reopen = () => AcademicYear.updateOne({ _id: running._id, tenantId: school, status: "closed" }, { $set: { status: "active" }, $unset: { closedAt: "" } });
    let activated;
    try {
      activated = await AcademicYear.findOneAndUpdate({ _id: to._id, tenantId: school, status: "pending" }, { $set: { status: "active", activatedAt: new Date() } }, { new: true }).lean();
    } catch (err) {
      await reopen();
      if (isDuplicateKey(err)) throw ApiError.conflict("The academic year changed while you were switching. Reload and try again.", "ACADEMIC_YEAR_CHANGED");
      throw err;
    }
    if (!activated) {
      await reopen();
      throw ApiError.conflict(`${to.name} is no longer waiting.`, "NEXT_YEAR_NOT_WAITING");
    }

    // The students who leave are inactive now; their place is read from the year that just closed. Then the list is done.
    let leftSchool = 0;
    if (batch) {
      const classes = await SchoolClass.find({ tenantId: school }).sort({ order: 1, _id: 1 }).select("_id").lean();
      const lastClass = classes.at(-1)?._id.toString();
      const passedOut = leaving.filter((e) => e.fromClassId.toString() === lastClass).map((e) => e.studentId.toString());
      const others = leaving.filter((e) => e.fromClassId.toString() !== lastClass).map((e) => e.studentId.toString());
      for (const [ids, reason] of [[passedOut, `Passed out after ${running.name}`], [others, `Not continuing in ${to.name}`]] as const) {
        if (ids.length === 0) continue;
        leftSchool += (await StudentStatusService.deactivate(tenantId, actor, ids, reason, null, running._id)).deactivated;
      }
      await PromotionBatch.updateOne({ _id: batch._id, tenantId: school, status: "approved" }, { $set: { status: "applied", appliedAt: new Date() }, $unset: { openKey: "" } });
    }
    return { ...toAcademicYearDto(activated), leftSchool };
  }
}
