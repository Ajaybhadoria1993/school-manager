import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const CERTIFICATE_TYPES = ["bonafide", "character", "transfer"] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];
/** The letters in the number: BON/2026-2027/0001. */
export const CERTIFICATE_CODE: Record<CertificateType, string> = { bonafide: "BON", character: "CHR", transfer: "TC" };

/** What a certificate says about the student, kept as it was the day it was issued, so a reprint years later reads the same. */
export interface ICertificateFacts {
  studentName: string;
  admissionNumber: string;
  gender: string;
  dateOfBirth: string;
  fatherName: string | null;
  motherName: string | null;
  admissionDate: string;
  /** The class they study in now (bonafide, character) or studied in last (transfer certificate). */
  classLabel: string | null;
  /** A transfer certificate: when they left, why, and the school they go to. */
  leftOn: string | null;
  leavingReason: string | null;
  goingTo: string | null;
}

/**
 * A certificate the school issued (2026-11-19): a bonafide ("is a student of this school"), a character certificate, or a transfer certificate (TC).
 * Each is **numbered in order** per kind, school and session and kept (the school's register): it is never edited or deleted, and a mistake is cancelled
 * with a reason. A transfer certificate is for a student who has left (inactive); the other two are for a student who is here.
 */
export interface ICertificate {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  type: CertificateType;
  seq: number;
  number: string;
  studentId: Types.ObjectId;
  issuedOn: Date;
  /** Bonafide: what it is needed for ("passport", "bank account"). Character: how the conduct was. Transfer: the remarks. */
  purpose: string | null;
  conduct: string | null;
  facts: ICertificateFacts;
  issuedBy: { userId: Types.ObjectId; name: string };
  status: "valid" | "cancelled";
  cancelReason: string | null;
  cancelledBy: { userId: Types.ObjectId; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const personSchema = new Schema({ userId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true } }, { _id: false });

const certificateSchema = new Schema<ICertificate>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    type: { type: String, enum: CERTIFICATE_TYPES, required: true, immutable: true },
    seq: { type: Number, required: true, min: 1, immutable: true },
    number: { type: String, required: true, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    issuedOn: { type: Date, required: true, immutable: true },
    purpose: { type: String, default: null, trim: true, maxlength: 200, immutable: true },
    conduct: { type: String, default: null, trim: true, maxlength: 60, immutable: true },
    facts: { type: Schema.Types.Mixed, required: true, immutable: true },
    issuedBy: { type: personSchema, required: true, immutable: true },
    status: { type: String, enum: ["valid", "cancelled"], default: "valid" },
    cancelReason: { type: String, default: null, trim: true, maxlength: 200 },
    cancelledBy: { type: personSchema, default: null },
  },
  { timestamps: true }
);

certificateSchema.plugin(tenantScope);
// The next number is "the highest so far + 1": two issued at once cannot both have it (the unique index lets one win; the other tries again).
certificateSchema.index({ tenantId: 1, academicYearId: 1, type: 1, seq: 1 }, { unique: true, name: "one_certificate_per_number" });
certificateSchema.index({ tenantId: 1, studentId: 1 });
certificateSchema.index({ tenantId: 1, issuedOn: -1 });

export const Certificate = model<ICertificate>("Certificate", certificateSchema);
