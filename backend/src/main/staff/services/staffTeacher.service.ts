import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { isDuplicateKey } from "../../academics/services/shared";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import type { IStaffMember } from "../models/StaffMember";
import { Teacher } from "../models/Teacher";
import { TeacherService } from "./teacher.service";

/** What of a staff member their Teacher record repeats. */
export type TeachingPerson = Pick<IStaffMember, "name" | "email" | "mobile" | "gender" | "dateOfBirth" | "address" | "designation" | "employeeCode" | "joiningDate"> & { subjectIds: Types.ObjectId[] };

/** A duplicate the pre-check could not see (two requests at once), said as Add teacher says it. */
function explain(err: unknown): unknown {
  if (!isDuplicateKey(err)) return err;
  const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return "mobile" in pattern
    ? ApiError.conflict("Another teacher already has this mobile number.", "TEACHER_MOBILE_EXISTS", [{ path: "mobile", message: "Another teacher already has this mobile number" }])
    : ApiError.conflict("Another teacher already has this employee code.", "TEACHER_CODE_EXISTS", [{ path: "employeeCode", message: "Another teacher already has this employee code" }]);
}

/**
 * A staff member who also teaches (a vice principal who takes Maths): the Teacher record that goes with their staff record, made with
 * their login (or when the school switches it on for someone who has one). `userId` is the login when it is a teacher's (the staff
 * role has no pages of its own); it is null for a Principal or an Accountant, who keep their own login and are a teacher of the school
 * (classes, periods) without a teacher login. The staff record is the one the school changes: a change there reaches the Teacher record.
 */
export class StaffTeacher {
  /** Everything that could refuse them as a teacher, checked before anything is made or changed: room, subjects, mobile, code. */
  static async assertCan(tenantId: string, person: { mobile: string | null; employeeCode: string | null; subjectIds: string[] }, exceptTeacherId: string | null): Promise<void> {
    if (!exceptTeacherId) await TeacherService.assertRoom(tenantId);
    await TeacherService.assertSubjects(tenantId, person.subjectIds);
    await TeacherService.assertFree(tenantId, person.mobile, person.employeeCode, exceptTeacherId);
  }

  /** Makes the Teacher record and returns its id. */
  static async make(tenantId: string | Types.ObjectId, person: TeachingPerson, userId: Types.ObjectId | null, isActive = true): Promise<Types.ObjectId> {
    try {
      const teacher = await Teacher.create({
        tenantId,
        name: person.name,
        nameKey: nameKeyOf(person.name),
        mobile: person.mobile ?? null,
        // The login's email is the teacher's; a teacher without a teacher login keeps none (the email is the staff login's, nobody else's).
        email: userId ? person.email : null,
        employeeCode: person.employeeCode ?? null,
        subjectIds: person.subjectIds,
        gender: person.gender ?? null,
        dateOfBirth: person.dateOfBirth ?? null,
        address: { line1: person.address?.line1 ?? null, city: person.address?.city ?? null, state: person.address?.state ?? null, pincode: person.address?.pincode ?? null },
        designation: person.designation ?? null,
        joiningDate: person.joiningDate ?? null,
        isActive,
        userId,
      });
      return teacher._id;
    } catch (err) {
      throw explain(err);
    }
  }

  /** Brings the Teacher record in step with the staff record (and links or unlinks the login). */
  static async sync(tenantId: string, teacherId: Types.ObjectId, person: TeachingPerson, userId: Types.ObjectId | null): Promise<void> {
    try {
      await Teacher.updateOne(
        { _id: teacherId, tenantId },
        {
          $set: {
            name: person.name,
            nameKey: nameKeyOf(person.name),
            mobile: person.mobile ?? null,
            email: userId ? person.email : null,
            employeeCode: person.employeeCode ?? null,
            subjectIds: person.subjectIds,
            gender: person.gender ?? null,
            dateOfBirth: person.dateOfBirth ?? null,
            address: { line1: person.address?.line1 ?? null, city: person.address?.city ?? null, state: person.address?.state ?? null, pincode: person.address?.pincode ?? null },
            designation: person.designation ?? null,
            joiningDate: person.joiningDate ?? null,
            userId,
          },
        }
      );
    } catch (err) {
      throw explain(err);
    }
  }
}
