import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Student } from "../../students/models/Student";
import { User } from "../../users/models/User";
import { FULL_ACCESS_ROLES } from "../../permissions/constants";
import { Concession } from "../models/Concession";
import { StudentConcession } from "../models/StudentConcession";
import { FeeAccountService } from "./feeAccount.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const NOT_FOUND = () => ApiError.notFound("That concession is not on this student", "STUDENT_CONCESSION_NOT_FOUND");

/** The name of a signed-in person, as it is written on a receipt or a concession. */
export async function personOf(userId: string): Promise<{ userId: Types.ObjectId; name: string }> {
  const user = await User.findById(userId).select("name").lean();
  return { userId: asId(userId), name: user?.name ?? "Staff" };
}

/**
 * A concession given to a student for the running session (docs/fees.md). The school admin and the principal give it at once; for anyone else
 * a concession that "needs approval" waits as `pending` and takes nothing off until the admin or the principal approves it. Approving, giving
 * and taking one back all make the student's charges work out again.
 */
export class StudentConcessionService {
  static async give(tenantId: string, user: { userId: string; role: string }, studentId: string, input: { concessionId: string; note: string | null }) {
    const school = asId(tenantId);
    const student = Types.ObjectId.isValid(studentId) ? await Student.findOne({ _id: studentId, tenantId: school, status: "active" }).select("_id").lean() : null;
    if (!student) throw ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id").lean();
    if (!year) throw ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");
    const concession = await Concession.findOne({ _id: input.concessionId, tenantId: school }).lean();
    if (!concession || !concession.isActive) throw ApiError.badRequest("Choose a concession from the school's list", "CONCESSION_NOT_FOUND", [{ path: "concessionId", message: "Choose a concession from the school's list" }]);
    if (await StudentConcession.exists({ tenantId: school, studentId: student._id, academicYearId: year._id, concessionId: concession._id })) {
      throw ApiError.conflict("This student already has this concession.", "CONCESSION_ALREADY_GIVEN");
    }
    const by = await personOf(user.userId);
    const immediate = FULL_ACCESS_ROLES.includes(user.role) || !concession.needsApproval;
    try {
      await StudentConcession.create({
        tenantId: school,
        academicYearId: year._id,
        studentId: student._id,
        concessionId: concession._id,
        name: concession.name,
        mode: concession.mode,
        value: concession.value,
        headIds: concession.appliesTo === "selected" ? concession.headIds : [],
        status: immediate ? "approved" : "pending",
        note: input.note,
        givenBy: by,
        approvedBy: immediate ? by : null,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw ApiError.conflict("This student already has this concession.", "CONCESSION_ALREADY_GIVEN");
      throw err;
    }
    await FeeAccountService.reprice(school, student._id, year._id);
    return FeeAccountService.account(tenantId, studentId);
  }

  /** The school admin or the principal agrees to a concession that was waiting. */
  static async approve(tenantId: string, userId: string, id: string) {
    const school = asId(tenantId);
    const grant = await StudentConcession.findOne({ _id: id, tenantId: school }).lean();
    if (!grant) throw NOT_FOUND();
    if (grant.status === "pending") {
      await StudentConcession.updateOne({ _id: grant._id, tenantId: school, status: "pending" }, { $set: { status: "approved", approvedBy: await personOf(userId) } });
      await FeeAccountService.reprice(school, grant.studentId, grant.academicYearId);
    }
    return FeeAccountService.account(tenantId, grant.studentId.toString(), grant.academicYearId.toString());
  }

  /** Takes a concession back (or turns one that is waiting down). What it took off an instalment comes back to be paid. */
  static async revoke(tenantId: string, id: string) {
    const school = asId(tenantId);
    const grant = await StudentConcession.findOne({ _id: id, tenantId: school }).lean();
    if (!grant) throw NOT_FOUND();
    await StudentConcession.deleteOne({ _id: grant._id, tenantId: school });
    await FeeAccountService.reprice(school, grant.studentId, grant.academicYearId);
    return FeeAccountService.account(tenantId, grant.studentId.toString(), grant.academicYearId.toString());
  }
}
