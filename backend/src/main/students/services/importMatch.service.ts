import { Types } from "mongoose";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import { importAdmissionNumberSchema, type MatchImportInput } from "../schemas/students.schemas";
import { day, fullName, nameKeyOf, placesOf } from "./shared";

/**
 * How a row of a file meets a student the school already has:
 *  - `same`: the same child (name, birthday and the primary parent's mobile; or the school's own admission number or the Aadhaar number
 *    with the same name and birthday: the parent changed the mobile). Not uploaded again;
 *  - `maybe`: the same name and birthday, but another (or no) parent's mobile. It may be another child, so the row is uploaded unless the
 *    person changes it, and is told about this student;
 *  - `number` / `aadhaar`: the admission number, or the Aadhaar number, of a DIFFERENT child. The row needs a fix.
 */
export type MatchKind = "same" | "maybe" | "number" | "aadhaar";

/** The student a row meets, with where they are this year (null when they have no class this year). */
export interface MatchedStudentDto {
  id: string;
  name: string;
  admissionNumber: string;
  dateOfBirth: string;
  className: string | null;
  sectionName: string | null;
  /** An inactive student is made active again, never admitted twice. */
  inactive: boolean;
}

export interface ImportMatch {
  row: number;
  kind: MatchKind;
  student: MatchedStudentDto;
}

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
/** 10 digits whatever was typed between them (spaces, dashes); anything else is no mobile number for a match. */
const mobileOf = (value: unknown): string | null => {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length === 10 ? digits : null;
};
const aadhaarOf = (value: unknown): string | null => {
  const digits = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  return /^\d{12}$/.test(digits) ? digits : null;
};
const numberOf = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = importAdmissionNumberSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export class ImportMatchService {
  /**
   * Which rows of a file are students the school already has, for the preview of a bulk upload: one read for the whole file (up to
   * 1000 rows), nothing written. The same checks decide at the upload itself (a refused row stays in the table with the reason); this
   * only says so before the person presses Upload. Rows that meet nobody are not in the answer.
   */
  static async run(tenantId: string, input: MatchImportInput): Promise<{ matches: ImportMatch[] }> {
    const school = new Types.ObjectId(tenantId);
    const rows = input.rows.map((r) => ({
      row: r.row,
      nameKey: nameKeyOf(tidy(r.firstName), tidy(r.lastName)),
      birthday: r.dateOfBirth,
      mobile: mobileOf(r.mobile),
      number: numberOf(r.admissionNumber),
      aadhaar: aadhaarOf(r.aadhaarNumber),
    }));

    // One read: every student who shares a name and a birthday with a row, or its admission number, or its Aadhaar number.
    const numbers = [...new Set(rows.flatMap((r) => (r.number ? [r.number] : [])))];
    const aadhaars = [...new Set(rows.flatMap((r) => (r.aadhaar ? [r.aadhaar] : [])))];
    const either: Record<string, unknown>[] = [
      {
        nameKey: { $in: [...new Set(rows.map((r) => r.nameKey))] },
        dateOfBirth: { $in: [...new Set(rows.map((r) => r.birthday))].map((d) => new Date(`${d}T00:00:00.000Z`)) },
      },
    ];
    if (numbers.length > 0) either.push({ admissionNumber: { $in: numbers } });
    if (aadhaars.length > 0) either.push({ aadhaarNumber: { $in: aadhaars } });
    const students = await Student.find({ tenantId: school, $or: either })
      .select("firstName lastName nameKey dateOfBirth admissionNumber aadhaarNumber guardians status")
      .lean();
    if (students.length === 0) return { matches: [] };

    const pairOf = (nameKey: string, birthday: string) => `${nameKey}|${birthday}`;
    const byPair = new Map<string, typeof students>();
    for (const s of students) {
      const key = pairOf(s.nameKey, day(s.dateOfBirth));
      byPair.set(key, [...(byPair.get(key) ?? []), s]);
    }
    const byNumber = new Map(students.map((s) => [s.admissionNumber, s]));
    const byAadhaar = new Map(students.flatMap((s) => (s.aadhaarNumber ? [[s.aadhaarNumber, s] as const] : [])));

    // The primary parent's mobile of the students who share a name and a birthday with a row (the only ones it is compared with).
    const sharing = [...byPair.values()].flat();
    const primaryIds = sharing.flatMap((s) => s.guardians.filter((g) => g.isPrimary).map((g) => g.guardianId));
    const guardians = primaryIds.length > 0 ? await Guardian.find({ tenantId: school, _id: { $in: primaryIds } }).select("mobile").lean() : [];
    const mobileOfGuardian = new Map(guardians.map((g) => [g._id.toString(), g.mobile ?? null]));
    const primaryMobile = (s: (typeof students)[number]) => {
      const primary = s.guardians.find((g) => g.isPrimary);
      return primary ? (mobileOfGuardian.get(primary.guardianId.toString()) ?? null) : null;
    };

    const found: { row: number; kind: MatchKind; student: (typeof students)[number] }[] = [];
    for (const r of rows) {
      const sharesNameAndBirthday = byPair.get(pairOf(r.nameKey, r.birthday)) ?? [];
      const isThisChild = (s: (typeof students)[number]) => sharesNameAndBirthday.some((p) => p._id.equals(s._id));
      const holderOfNumber = r.number ? byNumber.get(r.number) : undefined;
      const holderOfAadhaar = r.aadhaar ? byAadhaar.get(r.aadhaar) : undefined;

      const sameMobile = r.mobile ? sharesNameAndBirthday.find((s) => primaryMobile(s) === r.mobile) : undefined;
      if (sameMobile) found.push({ row: r.row, kind: "same", student: sameMobile });
      // The parent changed the mobile, but the register's number (or the Aadhaar number) is this child's.
      else if (holderOfNumber && isThisChild(holderOfNumber)) found.push({ row: r.row, kind: "same", student: holderOfNumber });
      else if (holderOfAadhaar && isThisChild(holderOfAadhaar)) found.push({ row: r.row, kind: "same", student: holderOfAadhaar });
      // Somebody else's number: this row cannot be admitted as it is.
      else if (holderOfNumber) found.push({ row: r.row, kind: "number", student: holderOfNumber });
      else if (holderOfAadhaar) found.push({ row: r.row, kind: "aadhaar", student: holderOfAadhaar });
      else if (sharesNameAndBirthday.length > 0) {
        found.push({ row: r.row, kind: "maybe", student: sharesNameAndBirthday.find((s) => s.status === "active") ?? sharesNameAndBirthday[0] });
      }
    }
    if (found.length === 0) return { matches: [] };

    // Where each student is this year (a student with no class this year has none).
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id").lean();
    const places = await placesOf(school, year?._id ?? null, [...new Set(found.map((f) => f.student._id.toString()))].map((id) => new Types.ObjectId(id)));
    return {
      matches: found.map(({ row, kind, student }) => {
        const place = places.get(student._id.toString());
        return {
          row,
          kind,
          student: {
            id: student._id.toString(),
            name: fullName(student),
            admissionNumber: student.admissionNumber,
            dateOfBirth: day(student.dateOfBirth),
            className: place?.className ?? null,
            sectionName: place?.sectionName ?? null,
            inactive: student.status === "inactive",
          },
        };
      }),
    };
  }
}
