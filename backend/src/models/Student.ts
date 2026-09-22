import { Schema, model, Types } from "mongoose";

export type StudentStatus = "active" | "inactive" | "alumni" | "transferred";
export type Gender = "male" | "female" | "other";

export interface IStudentDocument {
  type: "birth_certificate" | "aadhaar" | "transfer_certificate" | "photo" | "other";
  fileUrl: string;
  uploadedAt: Date;
}

export interface IStudent {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;

  admissionNumber: string;
  enrollmentNumber: string;
  rollNumber?: string;

  firstName: string;
  lastName: string;
  dob: Date;
  gender: Gender;
  category?: string; // General/OBC/SC/ST/EWS etc. for statutory reporting
  house?: string;

  apaarId?: string;
  pen?: string;
  apaarConsent?: {
    granted: boolean;
    guardianName: string;
    consentedAt: Date;
  };

  guardians: { guardianId: Types.ObjectId; relation: string }[];

  documents: IStudentDocument[];

  status: StudentStatus;
  admissionDate: Date;

  // S-1.4: snapshot of each prior (academicYear, class, section) before a
  // promotion overwrites the live fields above — lets fee/attendance
  // history stay attributable to the year it actually happened in.
  promotionHistory: { academicYearId: Types.ObjectId; classId: Types.ObjectId; sectionId: Types.ObjectId; promotedAt: Date }[];

  createdAt: Date;
  updatedAt: Date;
}

const studentSchema = new Schema<IStudent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true, index: true },

    admissionNumber: { type: String, required: true },
    enrollmentNumber: { type: String, required: true },
    rollNumber: { type: String },

    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ["male", "female", "other"], required: true },
    category: { type: String },
    house: { type: String },

    apaarId: { type: String },
    pen: { type: String },
    apaarConsent: {
      granted: { type: Boolean, default: false },
      guardianName: { type: String },
      consentedAt: { type: Date },
    },

    guardians: [
      {
        guardianId: { type: Schema.Types.ObjectId, ref: "Guardian", required: true },
        relation: { type: String, required: true },
      },
    ],

    documents: [
      {
        type: {
          type: String,
          enum: ["birth_certificate", "aadhaar", "transfer_certificate", "photo", "other"],
          required: true,
        },
        fileUrl: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    status: { type: String, enum: ["active", "inactive", "alumni", "transferred"], default: "active" },
    admissionDate: { type: Date, default: Date.now },

    promotionHistory: [
      {
        academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
        classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true },
        sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
        promotedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

studentSchema.index({ branchId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ branchId: 1, enrollmentNumber: 1 }, { unique: true });
studentSchema.index({ firstName: "text", lastName: "text", admissionNumber: "text" });

export const Student = model<IStudent>("Student", studentSchema);
