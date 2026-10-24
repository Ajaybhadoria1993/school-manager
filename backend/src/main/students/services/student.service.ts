import { Types, type PipelineStage } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { isDuplicateKey } from "../../academics/services/shared";
import type { Relation } from "../constants";
import { Enrolment, type IEnrolment } from "../models/Enrolment";
import { Guardian } from "../models/Guardian";
import { Student, type IStudent } from "../models/Student";
import { ageProblem, type ListStudentsQuery, type MoveStudentInput, type UpdateStudentInput } from "../schemas/students.schemas";
import {
  assertRollNumberFree,
  assertSeat,
  resolvePlacement,
  rollNumberTaken,
  sectionFull,
  seatsTaken,
} from "./placement";
import {
  aadhaarTaken,
  addressOf,
  customAnswersOf,
  customOf,
  day,
  escapeRegex,
  fullName,
  invalid,
  nameKeyOf,
  NO_ACTIVE_YEAR,
  placesOf,
  RECORD_FIELDS,
  recordsOf,
  STUDENT_NOT_FOUND,
  toGuardianDto,
  type EnrolmentDto,
  type StudentDetailDto,
  type StudentRowDto,
} from "./shared";

/** One page of the student list, for the current academic year. */
export interface StudentPage {
  /** The year the list is about; null for a school that has none (nobody can be admitted until it has one). */
  academicYear: { id: string; name: string } | null;
  items: StudentRowDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const activeYear = (school: Types.ObjectId) =>
  AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id name startDate").lean();

/** What every row and the detail share. */
const summaryOf = (s: IStudent) => ({
  id: s._id.toString(),
  firstName: s.firstName,
  lastName: s.lastName,
  name: fullName(s),
  gender: s.gender,
  admissionNumber: s.admissionNumber,
  dateOfBirth: day(s.dateOfBirth),
  admissionDate: day(s.admissionDate),
  status: s.status,
});

/** The row as the list's aggregation leaves it. */
interface ListRow {
  _id: Types.ObjectId;
  rollNumber: number | null;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  student: IStudent;
  klass?: { name: string };
  section?: { name: string };
  primary?: { _id: Types.ObjectId; name: string; mobile: string | null };
}

export class StudentService {
  /** A student with everything their page shows: details, guardians, every year's class, and the other children of their guardians. */
  static async get(tenantId: string, id: string | Types.ObjectId): Promise<StudentDetailDto> {
    const school = new Types.ObjectId(tenantId);
    const student = await Student.findOne({ _id: id, tenantId: school }).lean();
    if (!student) throw STUDENT_NOT_FOUND();

    const guardianIds = student.guardians.map((g) => g.guardianId);
    const [year, guardians, enrolments, siblings] = await Promise.all([
      activeYear(school),
      Guardian.find({ tenantId: school, _id: { $in: guardianIds } }).lean(),
      Enrolment.find({ tenantId: school, studentId: student._id }).lean(),
      Student.find({ tenantId: school, _id: { $ne: student._id }, "guardians.guardianId": { $in: guardianIds } })
        .select("firstName lastName admissionNumber")
        .sort({ admissionNumber: 1 })
        .lean(),
    ]);
    const [years, classes, sections, siblingPlaces] = await Promise.all([
      AcademicYear.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.academicYearId) } }).select("name status startDate").lean(),
      SchoolClass.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.classId) } }).select("name").lean(),
      Section.find({ tenantId: school, _id: { $in: enrolments.flatMap((e) => (e.sectionId ? [e.sectionId] : [])) } }).select("name").lean(),
      placesOf(school, year?._id ?? null, siblings.map((s) => s._id)),
    ]);

    const yearById = new Map(years.map((y) => [y._id.toString(), y]));
    const className = new Map(classes.map((c) => [c._id.toString(), c.name]));
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));
    const guardianById = new Map(guardians.map((g) => [g._id.toString(), g]));
    const history: (EnrolmentDto & { startsOn: number })[] = enrolments.map((e) => {
      const y = yearById.get(e.academicYearId.toString());
      return {
        id: e._id.toString(),
        academicYear: y ? { id: y._id.toString(), name: y.name, status: y.status } : null,
        classId: e.classId.toString(),
        className: className.get(e.classId.toString()) ?? "Deleted class",
        sectionId: e.sectionId ? e.sectionId.toString() : null,
        sectionName: e.sectionId ? (sectionName.get(e.sectionId.toString()) ?? null) : null,
        rollNumber: e.rollNumber ?? null,
        status: e.status,
        enrolledAt: e.enrolledAt.toISOString(),
        current: !!year && e.academicYearId.equals(year._id),
        startsOn: y?.startDate.getTime() ?? 0,
      };
    });
    history.sort((a, b) => b.startsOn - a.startsOn);
    const current = history.find((e) => e.current);

    return {
      ...summaryOf(student),
      place: current
        ? {
            enrolmentId: current.id,
            classId: current.classId,
            className: current.className,
            sectionId: current.sectionId,
            sectionName: current.sectionName,
            rollNumber: current.rollNumber,
          }
        : null,
      address: addressOf(student.address),
      bloodGroup: student.bloodGroup ?? null,
      category: student.category ?? null,
      ...recordsOf(student),
      custom: customOf(student.custom),
      previousSchool: student.previousSchool
        ? {
            name: student.previousSchool.name,
            lastClass: student.previousSchool.lastClass ?? null,
            tcNumber: student.previousSchool.tcNumber ?? null,
            tcDate: student.previousSchool.tcDate ? day(student.previousSchool.tcDate) : null,
          }
        : null,
      // In the order they were linked, the primary one first.
      guardians: [...student.guardians]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .flatMap((link) => {
          const g = guardianById.get(link.guardianId.toString());
          return g ? [toGuardianDto(g, link)] : [];
        }),
      enrolments: history.map(({ startsOn: _startsOn, ...e }) => e),
      siblings: siblings.map((s) => {
        const place = siblingPlaces.get(s._id.toString());
        return {
          id: s._id.toString(),
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          className: place?.className ?? null,
          sectionName: place?.sectionName ?? null,
        };
      }),
      createdAt: student.createdAt.toISOString(),
    };
  }

  /**
   * The students of the current academic year, searched (part of the name or of the admission number), filtered by class and
   * section, sorted and cut into pages by the database: one aggregation over the year's enrolments, so a screen never downloads
   * every student to filter them. Each row carries the class and section names and the primary guardian.
   */
  static async list(tenantId: string, query: ListStudentsQuery): Promise<StudentPage> {
    const school = new Types.ObjectId(tenantId);
    const year = await activeYear(school);
    if (!year) return { academicYear: null, items: [], page: query.page, limit: query.limit, total: 0, totalPages: 1 };

    const match: Record<string, unknown> = { tenantId: school, academicYearId: year._id, status: "active" };
    if (query.classId) match.classId = new Types.ObjectId(query.classId);
    if (query.sectionId) match.sectionId = query.sectionId === "none" ? null : new Types.ObjectId(query.sectionId);

    const search = query.q
      ? [
          {
            $match: {
              $or: [
                { "student.nameKey": { $regex: escapeRegex(query.q.toLowerCase().replace(/\s+/g, " ")) } },
                { "student.admissionNumber": { $regex: escapeRegex(query.q.toUpperCase().replace(/\s+/g, "")) } },
              ],
            },
          } as PipelineStage,
        ]
      : [];

    const direction = query.dir === "desc" ? -1 : 1;
    const sort: Record<string, 1 | -1> =
      query.sort === "name"
        ? { "student.nameKey": direction, _id: 1 }
        : query.sort === "admissionNumber"
          ? { "student.admissionNumber": direction, _id: 1 }
          : query.sort === "admissionDate"
            ? { "student.admissionDate": direction, "student.admissionNumber": direction, _id: 1 }
            : { "klass.order": direction, "section.name": direction, "student.nameKey": 1, _id: 1 };

    // Usable inside $facet too (a facet takes only some kinds of stages).
    const lookupOne = (from: string, localField: string, as: string, project: Record<string, 1>): PipelineStage.FacetPipelineStage[] => [
      {
        $lookup: {
          from,
          let: { id: `$${localField}` },
          pipeline: [{ $match: { tenantId: school, $expr: { $eq: ["$_id", "$$id"] } } }, { $project: project }],
          as,
        },
      },
      { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
    ];

    const pipeline: PipelineStage[] = [
      { $match: match },
      ...lookupOne(Student.collection.name, "studentId", "student", {
        firstName: 1,
        lastName: 1,
        nameKey: 1,
        gender: 1,
        admissionNumber: 1,
        dateOfBirth: 1,
        admissionDate: 1,
        status: 1,
        guardians: 1,
      }),
      { $match: { student: { $exists: true } } },
      ...search,
      ...lookupOne(SchoolClass.collection.name, "classId", "klass", { name: 1, order: 1 }),
      ...lookupOne(Section.collection.name, "sectionId", "section", { name: 1 }),
      { $sort: sort },
      {
        $facet: {
          items: [
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            // Only the rows of this page need their primary guardian.
            {
              $addFields: {
                primaryLink: { $arrayElemAt: [{ $filter: { input: "$student.guardians", cond: { $eq: ["$$this.isPrimary", true] } } }, 0] },
              },
            },
            ...lookupOne(Guardian.collection.name, "primaryLink.guardianId", "primary", { name: 1, mobile: 1 }),
            { $project: { rollNumber: 1, classId: 1, sectionId: 1, student: 1, klass: 1, section: 1, primary: 1, primaryLink: 1 } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ];

    // Natural order for names: "Class 2" before "Class 10", "ADM-2026-0009" before "ADM-2026-0010".
    const [result] = await Enrolment.aggregate<{ items: (ListRow & { primaryLink?: { relation: string } })[]; total: { n: number }[] }>(
      pipeline
    ).collation({ locale: "en", numericOrdering: true });
    const total = result?.total[0]?.n ?? 0;

    return {
      academicYear: { id: year._id.toString(), name: year.name },
      items: (result?.items ?? []).map((row) => ({
        ...summaryOf(row.student),
        place: {
          enrolmentId: row._id.toString(),
          classId: row.classId.toString(),
          className: row.klass?.name ?? "Deleted class",
          sectionId: row.sectionId ? row.sectionId.toString() : null,
          sectionName: row.section?.name ?? null,
          rollNumber: row.rollNumber ?? null,
        },
        primaryGuardian: row.primary
          ? {
              id: row.primary._id.toString(),
              name: row.primary.name,
              relation: (row.primaryLink?.relation ?? "Guardian") as Relation,
              mobile: row.primary.mobile ?? null,
            }
          : null,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /**
   * Changes the student's own details: only what is sent. The age rule is checked on the result (a new birthday with the stored
   * admission date, and the other way round). The admission number never changes.
   */
  static async update(tenantId: string, id: string, input: UpdateStudentInput): Promise<StudentDetailDto> {
    const school = new Types.ObjectId(tenantId);
    const current = await Student.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw STUDENT_NOT_FOUND();

    if (input.dateOfBirth || input.admissionDate) {
      const problem = ageProblem(input.dateOfBirth ?? current.dateOfBirth, input.admissionDate ?? current.admissionDate);
      if (problem) throw invalid(input.dateOfBirth ? "dateOfBirth" : "admissionDate", problem);
    }

    const set: Record<string, unknown> = {};
    if (input.firstName !== undefined || input.lastName !== undefined) {
      const firstName = input.firstName ?? current.firstName;
      const lastName = input.lastName ?? current.lastName;
      Object.assign(set, { firstName, lastName, nameKey: nameKeyOf(firstName, lastName) });
    }
    if (input.gender !== undefined) set.gender = input.gender;
    if (input.dateOfBirth !== undefined) set.dateOfBirth = input.dateOfBirth;
    if (input.admissionDate !== undefined) set.admissionDate = input.admissionDate;
    if (input.address !== undefined) set.address = addressOf(input.address);
    if (input.bloodGroup !== undefined) set.bloodGroup = input.bloodGroup;
    if (input.category !== undefined) set.category = input.category;
    if (input.previousSchool !== undefined) set.previousSchool = input.previousSchool;
    for (const key of RECORD_FIELDS) if (input[key] !== undefined) set[key] = input[key];
    if (input.rteSeat !== undefined) set.rteSeat = input.rteSeat;
    if (input.bpl !== undefined) set.bpl = input.bpl;
    // The school's own fields: each answer sent is set, each cleared one taken away; the others stay as they are.
    const custom = customAnswersOf(input.custom);
    for (const [key, value] of Object.entries(custom.set)) set[`custom.${key}`] = value;
    const unset = Object.fromEntries(custom.cleared.map((key) => [`custom.${key}`, ""]));

    if (input.aadhaarNumber) {
      const holder = await Student.findOne({ tenantId: school, aadhaarNumber: input.aadhaarNumber, _id: { $ne: current._id } })
        .select("firstName lastName admissionNumber")
        .lean();
      if (holder) throw aadhaarTaken(input.aadhaarNumber, holder);
    }
    try {
      await Student.updateOne(
        { _id: current._id, tenantId: school },
        { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
        { runValidators: true }
      );
    } catch (err) {
      // Two changes gave the same number at the same moment: the unique index decided.
      if (isDuplicateKey(err) && input.aadhaarNumber) throw aadhaarTaken(input.aadhaarNumber);
      throw err;
    }
    return StudentService.get(tenantId, current._id);
  }

  /**
   * Moves the student to another class or section of the CURRENT academic year (or only changes the roll number). The same rules
   * as an admission: the section must be of that class and year, a class with sections needs one, a full section needs the
   * person's "yes" (`allowOverCapacity`), and a roll number is used once in a section. A roll number is per section, so when the
   * class or section changes and no new one is sent, the old one is dropped. Last year's enrolment is never touched.
   */
  static async move(tenantId: string, id: string, input: MoveStudentInput): Promise<StudentDetailDto> {
    const school = new Types.ObjectId(tenantId);
    const student = await Student.findOne({ _id: id, tenantId: school }).select("_id").lean();
    if (!student) throw STUDENT_NOT_FOUND();
    const year = await activeYear(school);
    if (!year) throw NO_ACTIVE_YEAR();
    const enrolment = await Enrolment.findOne({ tenantId: school, studentId: student._id, academicYearId: year._id }).lean();
    if (!enrolment) {
      throw ApiError.notFound("This student has no class in the current academic year.", "ENROLMENT_NOT_FOUND");
    }

    // A new class brings its own section (none sent: the class must have no sections); otherwise the section may change alone.
    const classId = input.classId ?? enrolment.classId;
    const sectionId = input.classId !== undefined ? input.sectionId : input.sectionId !== undefined ? input.sectionId : enrolment.sectionId;
    const placement = await resolvePlacement(school, year._id, classId, sectionId);
    const moved = !placement.classId.equals(enrolment.classId) || String(placement.sectionId) !== String(enrolment.sectionId);
    const rollNumber = input.rollNumber !== undefined ? input.rollNumber : moved ? null : (enrolment.rollNumber ?? null);

    if (moved) await assertSeat(school, year._id, placement, input.allowOverCapacity, student._id);
    await assertRollNumberFree(school, year._id, placement, rollNumber, student._id);

    const before: Pick<IEnrolment, "classId" | "sectionId" | "rollNumber"> = {
      classId: enrolment.classId,
      sectionId: enrolment.sectionId ?? null,
      rollNumber: enrolment.rollNumber ?? null,
    };
    try {
      await Enrolment.updateOne(
        { _id: enrolment._id, tenantId: school },
        { $set: { classId: placement.classId, sectionId: placement.sectionId, rollNumber } }
      );
    } catch (err) {
      if (isDuplicateKey(err) && rollNumber !== null) throw rollNumberTaken(placement, rollNumber);
      throw err;
    }

    // Two moves into the last seat at the same moment: the section must not end up over its limit unless someone said so.
    if (moved && !input.allowOverCapacity && placement.sectionId && placement.capacity !== null) {
      const taken = await seatsTaken(school, year._id, placement.sectionId);
      if (taken > placement.capacity) {
        await Enrolment.updateOne({ _id: enrolment._id, tenantId: school }, { $set: before });
        throw sectionFull(placement, taken - 1);
      }
    }
    return StudentService.get(tenantId, student._id);
  }
}
