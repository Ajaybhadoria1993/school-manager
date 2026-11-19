import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { personOf } from "../../fees/services/studentConcession.service";
import { Enrolment } from "../../students/models/Enrolment";
import { Guardian } from "../../students/models/Guardian";
import { Student } from "../../students/models/Student";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { placesOf, placeTitle } from "../../students/services/shared";
import { MAX_CERTIFICATES_LISTED } from "../constants";
import { Certificate, CERTIFICATE_CODE, type CertificateType, type ICertificate, type ICertificateFacts } from "../models/Certificate";
import { DocumentsService, type SchoolHeaderDto } from "./documents.service";
import { DocumentSettingsService } from "./settings.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const CERT_NOT_FOUND = () => ApiError.notFound("Certificate not found", "CERTIFICATE_NOT_FOUND");

export interface CertificateDto {
  id: string;
  type: CertificateType;
  number: string;
  studentId: string;
  issuedOn: string;
  purpose: string | null;
  conduct: string | null;
  facts: ICertificateFacts;
  issuedBy: string;
  status: "valid" | "cancelled";
  cancelReason: string | null;
  cancelledBy: string | null;
}

export const certificateDto = (c: ICertificate): CertificateDto => ({
  id: c._id.toString(),
  type: c.type,
  number: c.number,
  studentId: c.studentId.toString(),
  issuedOn: dayOf(c.issuedOn),
  purpose: c.purpose,
  conduct: c.conduct,
  facts: c.facts,
  issuedBy: c.issuedBy.name,
  status: c.status,
  cancelReason: c.cancelReason,
  cancelledBy: c.cancelledBy?.name ?? null,
});

/**
 * The school's certificates (2026-11-19): a bonafide, a character certificate (for a student who is here) and a transfer certificate (for one who has
 * left). Issuing one writes it in the register with the next number of its kind for the session, and keeps what it said about the student as it was.
 */
export class CertificateService {
  /** What a certificate says about the student today. A student who left has no class this session: the last class they were in is read from their enrolments. */
  private static async factsOf(school: Types.ObjectId, studentId: Types.ObjectId, type: CertificateType, yearId: Types.ObjectId): Promise<ICertificateFacts> {
    const student = await Student.findOne({ _id: studentId, tenantId: school }).lean();
    if (!student) throw ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
    if (type === "transfer" && student.status !== "inactive") {
      throw ApiError.conflict("A transfer certificate is for a student who has left the school. Make the student inactive first.", "STUDENT_NOT_LEFT");
    }
    if (type !== "transfer" && student.status !== "active") {
      throw ApiError.conflict("This student has left the school. Only a transfer certificate can be issued.", "STUDENT_LEFT");
    }
    const links = student.guardians.map((g) => g.guardianId);
    const guardians = await Guardian.find({ tenantId: school, _id: { $in: links } }).select("name").lean();
    const name = new Map(guardians.map((g) => [g._id.toString(), g.name]));
    const nameOf = (relation: string) => {
      const link = student.guardians.find((g) => g.relation === relation);
      return link ? (name.get(link.guardianId.toString()) ?? null) : null;
    };

    let classLabel: string | null = null;
    if (student.status === "active") {
      const place = (await placesOf(school, yearId, [student._id])).get(student._id.toString());
      classLabel = place ? placeTitle(place.className, place.sectionName) : null;
    } else {
      const last = await Enrolment.findOne({ tenantId: school, studentId: student._id }).sort({ enrolledAt: -1 }).lean();
      if (last) {
        const [klass, section] = await Promise.all([SchoolClass.findOne({ _id: last.classId, tenantId: school }).select("name").lean(), last.sectionId ? Section.findOne({ _id: last.sectionId, tenantId: school }).select("name").lean() : null]);
        classLabel = klass ? placeTitle(klass.name, section?.name ?? null) : null;
      }
    }
    return {
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      gender: student.gender,
      dateOfBirth: dayOf(student.dateOfBirth),
      fatherName: nameOf("Father"),
      motherName: nameOf("Mother"),
      admissionDate: dayOf(student.admissionDate),
      classLabel,
      leftOn: student.inactive ? dayOf(student.inactive.at) : null,
      leavingReason: student.inactive?.reason ?? null,
      goingTo: student.inactive?.transfer?.schoolName ?? null,
    };
  }

  /** Issues a certificate: the next number of its kind in the running session, and a record of what it said. */
  static async issue(tenantId: string, userId: string, studentId: string, input: { type: CertificateType; purpose: string | null; conduct: string | null }): Promise<CertificateDto> {
    const school = asId(tenantId);
    if (!Types.ObjectId.isValid(studentId)) throw ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name").lean();
    if (!year) throw ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");
    const facts = await CertificateService.factsOf(school, asId(studentId), input.type, year._id);
    const by = await personOf(userId);
    for (let attempt = 0; attempt < 6; attempt++) {
      const last = await Certificate.findOne({ tenantId: school, academicYearId: year._id, type: input.type }).sort({ seq: -1 }).select("seq").lean();
      const seq = (last?.seq ?? 0) + 1;
      try {
        const made = await Certificate.create({
          tenantId: school,
          academicYearId: year._id,
          type: input.type,
          seq,
          number: `${CERTIFICATE_CODE[input.type]}/${year.name}/${String(seq).padStart(4, "0")}`,
          studentId: asId(studentId),
          issuedOn: toDate(todayInIndia()),
          purpose: input.purpose,
          conduct: input.conduct,
          facts,
          issuedBy: by,
        });
        return certificateDto(made.toObject());
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw ApiError.conflict("Many certificates were made at once. Please try again.", "CERTIFICATE_BUSY");
  }

  /** The register: the latest certificates, of one kind or one student when asked. */
  static async list(tenantId: string, query: { type?: CertificateType; studentId?: string }) {
    const filter: Record<string, unknown> = { tenantId: asId(tenantId) };
    if (query.type) filter.type = query.type;
    if (query.studentId) filter.studentId = asId(query.studentId);
    const rows = await Certificate.find(filter).sort({ issuedOn: -1, createdAt: -1 }).limit(MAX_CERTIFICATES_LISTED).lean();
    return { items: rows.map(certificateDto), limit: MAX_CERTIFICATES_LISTED };
  }

  /** One certificate to print, with the school's header, the session and the principal's name. */
  static async get(tenantId: string, id: string): Promise<CertificateDto & { school: SchoolHeaderDto; year: string; principalName: string | null }> {
    const school = asId(tenantId);
    const c = Types.ObjectId.isValid(id) ? await Certificate.findOne({ _id: id, tenantId: school }).lean() : null;
    if (!c) throw CERT_NOT_FOUND();
    const [header, settings, year] = await Promise.all([DocumentsService.header(school), DocumentSettingsService.get(school), AcademicYear.findOne({ _id: c.academicYearId, tenantId: school }).select("name").lean()]);
    return { ...certificateDto(c), school: header, year: year?.name ?? "", principalName: settings.principalName };
  }

  /** Cancels a certificate (a wrong name, a wrong purpose): the number stays on the register, marked cancelled, and a new one is issued. */
  static async cancel(tenantId: string, userId: string, id: string, reason: string): Promise<CertificateDto> {
    const school = asId(tenantId);
    const claimed = Types.ObjectId.isValid(id)
      ? await Certificate.findOneAndUpdate({ _id: id, tenantId: school, status: "valid" }, { $set: { status: "cancelled", cancelReason: reason, cancelledBy: await personOf(userId) } }, { new: true }).lean()
      : null;
    if (!claimed) {
      if (Types.ObjectId.isValid(id) && (await Certificate.exists({ _id: id, tenantId: school }))) throw ApiError.conflict("This certificate is already cancelled.", "CERTIFICATE_CANCELLED");
      throw CERT_NOT_FOUND();
    }
    return certificateDto(claimed);
  }
}
