import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { isDuplicateKey } from "../../academics/services/shared";
import { Guardian, type IGuardian } from "../models/Guardian";
import { Student } from "../models/Student";
import type { UpdateGuardianInput } from "../schemas/students.schemas";
import { fullName, GUARDIAN_NOT_FOUND, invalid, placesOf, type GuardianMatchDto } from "./shared";

const MOBILE_TAKEN = () =>
  ApiError.conflict("Another guardian in your school has this mobile number.", "GUARDIAN_MOBILE_TAKEN", [
    { path: "mobile", message: "Another guardian in your school has this mobile number" },
  ]);

export class GuardianService {
  /**
   * The guardian of this school with this mobile number, with their children here (name, admission number, this year's class),
   * or null. This is how a second child of a family is admitted: the screen finds the parent and links them instead of typing
   * them again. Only this school's guardians are searched.
   */
  static async lookup(tenantId: string, mobile: string): Promise<GuardianMatchDto | null> {
    const school = new Types.ObjectId(tenantId);
    const guardian = await Guardian.findOne({ tenantId: school, mobile }).lean();
    return guardian ? GuardianService.withChildren(school, guardian) : null;
  }

  /** A guardian as the lookup and the edit answer: their details and every child of theirs at the school. */
  static async withChildren(school: Types.ObjectId, guardian: IGuardian): Promise<GuardianMatchDto> {
    const [academicYearId, children] = await Promise.all([
      AcademicYearService.activeYearId(school),
      Student.find({ tenantId: school, "guardians.guardianId": guardian._id })
        .select("firstName lastName admissionNumber guardians")
        .sort({ admissionNumber: 1 })
        .lean(),
    ]);
    const places = await placesOf(school, academicYearId, children.map((c) => c._id));
    return {
      id: guardian._id.toString(),
      name: guardian.name,
      mobile: guardian.mobile ?? null,
      alternateMobile: guardian.alternateMobile ?? null,
      email: guardian.email ?? null,
      occupation: guardian.occupation ?? null,
      children: children.map((child) => {
        const place = places.get(child._id.toString());
        return {
          id: child._id.toString(),
          name: fullName(child),
          admissionNumber: child.admissionNumber,
          relation: child.guardians.find((link) => link.guardianId.equals(guardian._id))?.relation ?? "Guardian",
          className: place?.className ?? null,
          sectionName: place?.sectionName ?? null,
        };
      }),
    };
  }

  /**
   * Changes a guardian's own details (for every child they are linked to). A new mobile number must not be another guardian's
   * (the database refuses it), and it is no longer verified: the number is the parent's future login.
   */
  static async update(tenantId: string, id: string, input: UpdateGuardianInput): Promise<GuardianMatchDto> {
    const school = new Types.ObjectId(tenantId);
    const current = await Guardian.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw GUARDIAN_NOT_FOUND();

    const mobile = input.mobile ?? current.mobile;
    const alternate = input.alternateMobile !== undefined ? input.alternateMobile : current.alternateMobile;
    if (mobile && alternate && mobile === alternate) {
      throw invalid("alternateMobile", "The alternate number must differ from the mobile number");
    }

    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.mobile !== undefined && input.mobile !== current.mobile) Object.assign(set, { mobile: input.mobile, mobileVerifiedAt: null });
    if (input.alternateMobile !== undefined) set.alternateMobile = input.alternateMobile;
    if (input.email !== undefined) set.email = input.email;
    if (input.occupation !== undefined) set.occupation = input.occupation ?? null;
    if (Object.keys(set).length === 0) return GuardianService.withChildren(school, current);

    try {
      const updated = await Guardian.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
      if (!updated) throw GUARDIAN_NOT_FOUND();
      return GuardianService.withChildren(school, updated);
    } catch (err) {
      if (isDuplicateKey(err)) throw MOBILE_TAKEN();
      throw err;
    }
  }
}
