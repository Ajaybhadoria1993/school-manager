import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { logger } from "../../../utils/logger";
import { AcademicYear, type IAcademicYear } from "../../academics/models/AcademicYear";
import { isDuplicateKey } from "../../academics/services/shared";
import { AdmissionCounter } from "../models/AdmissionCounter";
import { Enrolment } from "../models/Enrolment";
import { Guardian, type IGuardian } from "../models/Guardian";
import { Student, type IGuardianLink } from "../models/Student";
import { todayInIndia, type AdmitStudentInput, type GuardianEntryInput } from "../schemas/students.schemas";
import { nextAdmissionNumber } from "./admissionNumber";
import { GuardianService } from "./guardian.service";
import { assertRollNumberFree, assertSeat, resolvePlacement, rollNumberTaken, sectionFull, seatHeld, type Placement } from "./placement";
import { aadhaarTaken, addressOf, customAnswersOf, day, fullName, nameKeyOf, NO_ACTIVE_YEAR, placesOf, placeTitle, recordsOf, type GuardianMatchDto, type StudentDetailDto } from "./shared";
import { StudentService } from "./student.service";

/** How many admission numbers to try when one is somehow taken already (a counter restored from an old backup, say). */
const NUMBER_ATTEMPTS = 5;

/** The active academic year, as an admission needs it. */
export type AdmissionYear = Pick<IAcademicYear, "_id" | "name" | "startDate">;

/** What the checks of an admission found out, for the writes that follow. */
export interface AdmissionPlan {
  placement: Placement;
  rollNumber: number | null;
  /** The guardians picked by id, by their index in the request. */
  linked: Map<number, IGuardian>;
  nameKey: string;
}

/** 409: a guardian with this mobile number is already in the school, and the request did not say to use them. */
async function guardianExists(school: Types.ObjectId, index: number, existing: IGuardian): Promise<ApiError> {
  const guardian: GuardianMatchDto = await GuardianService.withChildren(school, existing);
  return ApiError.conflict(`${existing.name} is already in your school with this mobile number.`, "GUARDIAN_EXISTS", [
    { path: `guardians.${index}.mobile`, message: "A guardian with this mobile number is already in your school", guardian },
  ]);
}

/**
 * The same child admitted twice by accident (edge case S-2.7): a student with the same first and last name, the same date of birth
 * and the same primary guardian's mobile number. Returns them, or null.
 */
async function findDuplicate(school: Types.ObjectId, nameKey: string, dateOfBirth: Date, primaryMobile: string) {
  const candidates = await Student.find({ tenantId: school, nameKey, dateOfBirth }).select("firstName lastName admissionNumber dateOfBirth guardians").lean();
  if (candidates.length === 0) return null;
  const primaries = candidates.flatMap((c) => c.guardians.filter((g) => g.isPrimary).map((g) => g.guardianId));
  const sameMobile = await Guardian.find({ tenantId: school, _id: { $in: primaries }, mobile: primaryMobile }).select("_id").lean();
  return candidates.find((c) => c.guardians.some((g) => g.isPrimary && sameMobile.some((m) => m._id.equals(g.guardianId)))) ?? null;
}

/** The guardians the request points at by id (found by their mobile number on the screen): each must be this school's. */
async function linkedGuardians(school: Types.ObjectId, entries: GuardianEntryInput[]): Promise<Map<number, IGuardian>> {
  const ids = entries.flatMap((g) => (g.guardianId ? [g.guardianId] : []));
  const found = await Guardian.find({ tenantId: school, _id: { $in: ids } }).lean();
  const linked = new Map<number, IGuardian>();
  entries.forEach((entry, index) => {
    if (!entry.guardianId) return;
    const guardian = found.find((g) => g._id.equals(entry.guardianId));
    if (!guardian) {
      throw ApiError.badRequest("That guardian is not in your school.", "GUARDIAN_NOT_FOUND", [
        { path: `guardians.${index}.guardianId`, message: "That guardian is not in your school any more. Type the mobile number again" },
      ]);
    }
    if (entry.mobile && guardian.mobile && entry.mobile !== guardian.mobile) {
      throw ApiError.badRequest("That is not the mobile number of the guardian you picked.", "GUARDIAN_MOBILE_MISMATCH", [
        { path: `guardians.${index}.mobile`, message: "This is not the mobile number of the guardian you picked" },
      ]);
    }
    linked.set(index, guardian);
  });
  return linked;
}

/** The new guardian's details as they are stored. */
const newGuardian = (entry: GuardianEntryInput) => ({
  name: entry.name,
  mobile: entry.mobile ?? null,
  mobileVerifiedAt: null,
  alternateMobile: entry.alternateMobile ?? null,
  email: entry.email ?? null,
  occupation: entry.occupation ?? null,
});

export class AdmissionService {
  /**
   * Admits a student in one request: the student, their guardians (linked when the school already has them, created when not)
   * and their place in the current academic year.
   *
   * The local MongoDB is a standalone server, which cannot run a multi-document transaction, so the request is made safe another way:
   *  1. everything that can be refused is checked first, before anything is written (the year, the class and section, a free seat,
   *     the roll number, the guardians, the possible duplicate);
   *  2. the writes go in an order where each one only adds: the admission number (an atomic counter), new guardians (an upsert by
   *     mobile number that never overwrites: if someone made that guardian a moment ago, the admission stops and says so), the
   *     student, the enrolment;
   *  3. if any write fails, what this request made is taken away again (the enrolment, the student, a new guardian no other child
   *     points to), so a student is never left without an enrolment and a family is never half made. An admission number that was
   *     handed out is not reused (a gap, never a duplicate);
   *  4. the unique indexes (admission number, one guardian per mobile, one enrolment per student and year, a roll number once per
   *     section) are the last word when two requests meet; the details of an existing guardian are changed only at the very end,
   *     and only when the person chose "update" for them.
   */
  static async admit(tenantId: string, input: AdmitStudentInput): Promise<StudentDetailDto> {
    const made = await AdmissionService.admitOne(tenantId, input);
    return StudentService.get(tenantId, made.id);
  }

  /** The school's active year, or 409 NO_ACTIVE_YEAR: nothing can be admitted without one. */
  static async activeYear(school: Types.ObjectId): Promise<AdmissionYear> {
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id name startDate").lean();
    if (!year) throw NO_ACTIVE_YEAR();
    return year;
  }

  /**
   * Step 1 of an admission, on its own: every check, nothing written. The admission form's POST and the bulk import's dry run both
   * use it, so a row of a spreadsheet is judged exactly like a typed admission. `admissionNumber` is a number the school brings with
   * the student (a bulk import of students it already has); it must not be used yet.
   */
  static async plan(school: Types.ObjectId, year: AdmissionYear, input: AdmitStudentInput, admissionNumber: string | null = null): Promise<AdmissionPlan> {
    if (admissionNumber) {
      const holder = await Student.findOne({ tenantId: school, admissionNumber }).select("firstName lastName").lean();
      if (holder) throw admissionNumberTaken(admissionNumber, fullName(holder));
    }
    if (input.aadhaarNumber) {
      const holder = await Student.findOne({ tenantId: school, aadhaarNumber: input.aadhaarNumber }).select("firstName lastName admissionNumber").lean();
      if (holder) throw aadhaarTaken(input.aadhaarNumber, holder);
    }
    const placement = await resolvePlacement(school, year._id, input.classId, input.sectionId);
    await assertSeat(school, year._id, placement, input.allowOverCapacity);
    const rollNumber = input.rollNumber ?? null;
    await assertRollNumberFree(school, year._id, placement, rollNumber);

    const linked = await linkedGuardians(school, input.guardians);
    const nameKey = nameKeyOf(input.firstName, input.lastName);
    const primary = input.guardians.find((g) => g.isPrimary)!;
    const primaryMobile = primary.mobile ?? linked.get(input.guardians.indexOf(primary))?.mobile ?? null;
    if (!input.confirmNotDuplicate && primaryMobile) {
      const duplicate = await findDuplicate(school, nameKey, input.dateOfBirth, primaryMobile);
      if (duplicate) {
        const place = (await placesOf(school, year._id, [duplicate._id])).get(duplicate._id.toString());
        const where = place ? ` (${placeTitle(place.className, place.sectionName)})` : "";
        throw ApiError.conflict(
          `${fullName(duplicate)}, born on ${day(duplicate.dateOfBirth)}, is already in your school with the same primary guardian's mobile number: ${duplicate.admissionNumber}${where}.`,
          "DUPLICATE_STUDENT",
          [
            {
              path: "confirmNotDuplicate",
              message: "This child may already be admitted",
              student: {
                id: duplicate._id.toString(),
                name: fullName(duplicate),
                admissionNumber: duplicate.admissionNumber,
                dateOfBirth: day(duplicate.dateOfBirth),
                className: place?.className ?? null,
                sectionName: place?.sectionName ?? null,
              },
            },
          ]
        );
      }
    }
    // A new guardian whose mobile number the school already has: the screen must show them first, never a silent copy or overwrite.
    for (const [index, entry] of input.guardians.entries()) {
      if (linked.has(index) || !entry.mobile) continue;
      const existing = await Guardian.findOne({ tenantId: school, mobile: entry.mobile }).lean();
      if (existing) throw await guardianExists(school, index, existing);
    }
    return { placement, rollNumber, linked, nameKey };
  }

  /**
   * One admission, without reading the new student back (`admit` does that for the form; a bulk import only needs the number). With
   * `admissionNumber` the student keeps the number the school already gave them instead of getting the next one.
   */
  static async admitOne(
    tenantId: string,
    input: AdmitStudentInput,
    options: { admissionNumber?: string | null } = {}
  ): Promise<{ id: Types.ObjectId; name: string; admissionNumber: string }> {
    const school = new Types.ObjectId(tenantId);
    const year = await AdmissionService.activeYear(school);
    const own = options.admissionNumber ?? null;

    // 1. Checks. Nothing has been written yet, so a refusal leaves nothing behind.
    const { placement, rollNumber, linked, nameKey } = await AdmissionService.plan(school, year, input, own);

    // 2. Writes, each one only adding. 3. What this request made is taken away again if a later step fails.
    const madeGuardians: Types.ObjectId[] = [];
    let studentId: Types.ObjectId | null = null;
    let admissionNumber: string | null = null;
    let enrolmentId: Types.ObjectId | null = null;
    const undo = async () => {
      try {
        if (enrolmentId) await Enrolment.deleteOne({ _id: enrolmentId, tenantId: school });
        if (studentId) await Student.deleteOne({ _id: studentId, tenantId: school });
        for (const id of madeGuardians) {
          // Another admission may have linked this new guardian in the meantime: then they stay.
          if (!(await Student.exists({ tenantId: school, "guardians.guardianId": id }))) await Guardian.deleteOne({ _id: id, tenantId: school });
        }
      } catch (err) {
        logger.error("admission_undo_failed", err, { tenantId, studentId: studentId?.toString(), enrolmentId: enrolmentId?.toString() });
      }
    };

    try {
      const links: IGuardianLink[] = [];
      for (const [index, entry] of input.guardians.entries()) {
        const existing = linked.get(index);
        let guardianId: Types.ObjectId;
        if (existing) {
          guardianId = existing._id;
        } else if (entry.mobile) {
          // An upsert that only inserts: if the same mobile number was saved a moment ago by someone else, nothing is overwritten.
          const result = await Guardian.findOneAndUpdate(
            { tenantId: school, mobile: entry.mobile },
            { $setOnInsert: newGuardian(entry) },
            { upsert: true, new: true, includeResultMetadata: true }
          );
          if (result.lastErrorObject?.updatedExisting) throw await guardianExists(school, index, result.value!.toObject());
          guardianId = result.value!._id;
          madeGuardians.push(guardianId);
        } else {
          guardianId = (await Guardian.create({ tenantId: school, ...newGuardian(entry) }))._id;
          madeGuardians.push(guardianId);
        }
        links.push({ guardianId, relation: entry.relation, isPrimary: entry.isPrimary });
      }

      const student = {
        tenantId: school,
        firstName: input.firstName,
        lastName: input.lastName,
        nameKey,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        admissionDate: input.admissionDate ?? new Date(`${todayInIndia()}T00:00:00.000Z`),
        address: addressOf(input.address),
        bloodGroup: input.bloodGroup ?? null,
        category: input.category ?? null,
        previousSchool: input.previousSchool ?? null,
        ...recordsOf(input),
        custom: customAnswersOf(input.custom).set,
        guardians: links,
        status: "active" as const,
      };
      if (own) {
        // The school's own number: used as it is, once (the unique index has the last word if two rows bring the same one).
        studentId = (await Student.create({ ...student, admissionNumber: own }))._id;
        admissionNumber = own;
        await keepCounterAhead(school, year, own);
      }
      for (let attempt = 1; !studentId; attempt += 1) {
        try {
          const next = await nextAdmissionNumber(school, year);
          studentId = (await Student.create({ ...student, admissionNumber: next }))._id;
          admissionNumber = next;
        } catch (err) {
          // That number is somehow taken (the counter was reset): take the next one.
          if (!isDuplicateKey(err) || attempt >= NUMBER_ATTEMPTS) throw err;
        }
      }

      enrolmentId = (
        await Enrolment.create({
          tenantId: school,
          studentId,
          academicYearId: year._id,
          classId: placement.classId,
          sectionId: placement.sectionId,
          rollNumber,
          status: "active",
          enrolledAt: new Date(),
        })
      )._id;

      if (!input.allowOverCapacity) {
        const seat = await seatHeld(school, year._id, placement, enrolmentId);
        if (!seat.held) throw sectionFull(placement, Math.max(seat.enrolled, placement.capacity ?? 0));
      }

      // 4. Only now, and only when the person chose "update", the details of a guardian the school already had.
      for (const [index, existing] of linked) {
        const entry = input.guardians[index];
        if (!entry.updateDetails) continue;
        await Guardian.updateOne(
          { _id: existing._id, tenantId: school },
          {
            $set: {
              name: entry.name,
              alternateMobile: entry.alternateMobile ?? null,
              email: entry.email ?? null,
              occupation: entry.occupation ?? null,
            },
          },
          { runValidators: true }
        );
      }
    } catch (err) {
      await undo();
      throw translate(err, placement, rollNumber, own);
    }

    return { id: studentId!, name: `${input.firstName} ${input.lastName}`, admissionNumber: admissionNumber! };
  }
}

/** 409: a number the school brings with a student is already another student's. */
function admissionNumberTaken(admissionNumber: string, holder?: string): ApiError {
  const message = holder
    ? `Admission number ${admissionNumber} is already ${holder}'s`
    : `Admission number ${admissionNumber} is already used in your school`;
  return ApiError.conflict(`${message}.`, "ADMISSION_NUMBER_TAKEN", [{ path: "admissionNumber", message }]);
}

/**
 * A number in the software's own form for this year ("ADM-2026-0450") brought by an import: the counter is moved to at least it, so the
 * next admission typed in the form gets ADM-2026-0451 instead of trying 0001, 0002... against the imported ones.
 */
async function keepCounterAhead(school: Types.ObjectId, year: AdmissionYear, admissionNumber: string): Promise<void> {
  const match = /^ADM-(\d{4})-(\d{1,6})$/.exec(admissionNumber);
  if (!match || Number(match[1]) !== year.startDate.getUTCFullYear()) return;
  await AdmissionCounter.updateOne({ tenantId: school, academicYearId: year._id }, { $max: { seq: Number(match[2]) } }, { upsert: true });
}

/** A unique index that said no while writing, as the person's message (two requests met at the same moment). */
function translate(err: unknown, placement: Placement, rollNumber: number | null, admissionNumber: string | null): unknown {
  if (!isDuplicateKey(err)) return err;
  const keys = Object.keys((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
  if (keys.includes("rollNumber") && rollNumber !== null) return rollNumberTaken(placement, rollNumber);
  if (keys.includes("admissionNumber") && admissionNumber) return admissionNumberTaken(admissionNumber);
  if (keys.includes("aadhaarNumber")) {
    const value = (err as { keyValue?: { aadhaarNumber?: string } }).keyValue?.aadhaarNumber;
    return aadhaarTaken(value ?? "");
  }
  if (keys.includes("studentId")) return ApiError.conflict("This student already has a class this year.", "ALREADY_ENROLLED");
  return ApiError.conflict("Someone saved the same details a moment ago. Check the student list and try again.", "ALREADY_EXISTS");
}
