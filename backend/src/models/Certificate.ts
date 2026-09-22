import { Schema, model, Types } from "mongoose";

export type CertificateType = "transfer" | "bonafide" | "fee_paid";
export type CertificateStatus = "issued" | "superseded";

export interface ITransferCertificateData {
  reasonForLeaving: string;
  lastAttendanceDate: string; // ISO date
  conduct: string;
}

export interface IBonafideCertificateData {
  purpose: string;
}

export interface IFeePaidCertificateData {
  financialYear: string;
  totalPaid: number;
}

export interface ICertificate {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  type: CertificateType;
  serialNumber: string;
  status: CertificateStatus;
  data: ITransferCertificateData | IBonafideCertificateData | IFeePaidCertificateData;
  issuedBy: Types.ObjectId;
  issuedAt: Date;
  supersedes?: Types.ObjectId; // S-8.2: points at the certificate this one replaces
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    type: { type: String, enum: ["transfer", "bonafide", "fee_paid"], required: true },
    serialNumber: { type: String, required: true },
    status: { type: String, enum: ["issued", "superseded"], default: "issued" },
    data: { type: Schema.Types.Mixed, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    issuedAt: { type: Date, default: Date.now },
    supersedes: { type: Schema.Types.ObjectId, ref: "Certificate" },
  },
  { timestamps: true }
);

certificateSchema.index({ branchId: 1, serialNumber: 1 }, { unique: true });
certificateSchema.index({ studentId: 1, type: 1 });

export const Certificate = model<ICertificate>("Certificate", certificateSchema);
