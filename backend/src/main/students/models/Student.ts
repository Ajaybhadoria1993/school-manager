import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { INDIAN_STATES } from "../../tenants/constants";
import { BLOOD_GROUPS, CATEGORIES, DISABILITIES, GENDERS, RELATIONS, RELIGIONS, STUDENT_STATUSES, type Gender, type Relation, type StudentStatus } from "../constants";

/**
 * A student's link to one guardian: who it is, how they are related to THIS child, and whether they are this child's primary
 * contact. The guardian's own details (name, mobile...) live on the Guardian, so a parent of three children is one record.
 */
export interface IGuardianLink {
  guardianId: Types.ObjectId;
  relation: Relation;
  isPrimary: boolean;
}

/** Each part may be empty when the school does not need it (its fields, on Students > Export). */
export interface IStudentAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: (typeof INDIAN_STATES)[number] | null;
  pincode: string | null;
}

export interface IPreviousSchool {
  name: string;
  lastClass: string | null;
  tcNumber: string | null;
  tcDate: Date | null;
}

/**
 * The person: who the student is, and nothing about a school year. Their class and section in a year is an Enrolment (one per
 * year), so a new session never overwrites where they were last year. Year-free on purpose (see YEAR_FREE_MODELS).
 */
export interface IStudent {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  firstName: string;
  lastName: string;
  /** "asha verma": the full name lower-cased, for the search and the duplicate check. */
  nameKey: string;
  gender: Gender;
  /** Calendar days, stored as midnight UTC of that day. */
  dateOfBirth: Date;
  admissionDate: Date;
  /** Made by the server ("ADM-2026-0001"), unique in the school, never typed and never changed. */
  admissionNumber: string;
  address: IStudentAddress;
  bloodGroup: (typeof BLOOD_GROUPS)[number] | null;
  category: (typeof CATEGORIES)[number] | null;
  previousSchool: IPreviousSchool | null;
  /** 12 digits; unique in the school. Stored as typed (the school chose to keep the whole number). */
  aadhaarNumber: string | null;
  /** Madhya Pradesh's Samagra member or family ID. */
  samagraId: string | null;
  /** The 12-digit Automated Permanent Academic Account Registry ID. */
  apaarId: string | null;
  /** UDISE+'s 11-digit Permanent Education Number. */
  pen: string | null;
  /** The number in the school's old admission register (SR / Scholar register). */
  srNumber: string | null;
  religion: (typeof RELIGIONS)[number] | null;
  nationality: string | null;
  /** A number to call in an emergency or to message on WhatsApp, when it is not a parent's own. */
  emergencyMobile: string | null;
  /** Children with special needs (UDISE+): None or the kind. */
  disability: (typeof DISABILITIES)[number] | null;
  medicalNotes: string | null;
  /** A free seat under the Right to Education Act. */
  rteSeat: boolean;
  /** The family is below the poverty line. */
  bpl: boolean;
  feeConcession: string | null;
  /** The school bus (there is no transport module yet: the words as the school writes them). */
  transportRoute: string | null;
  transportStop: string | null;
  /**
   * The answers to the school's own fields, by their `c_` key: text, a number, a day ("2026-04-01"), yes / no, or one of a list. A
   * field the school deletes later leaves its answer here, unread.
   */
  custom: Record<string, string | number | boolean>;
  /** One to four; exactly one is primary. */
  guardians: IGuardianLink[];
  status: StudentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const guardianLinkSchema = new Schema<IGuardianLink>(
  {
    guardianId: { type: Schema.Types.ObjectId, ref: "Guardian", required: true },
    relation: { type: String, enum: RELATIONS, required: true },
    isPrimary: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const studentSchema = new Schema<IStudent>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    nameKey: { type: String, required: true },
    gender: { type: String, enum: GENDERS, required: true },
    dateOfBirth: { type: Date, required: true },
    admissionDate: { type: Date, required: true },
    admissionNumber: { type: String, required: true, immutable: true },
    address: {
      line1: { type: String, default: null, trim: true, maxlength: 200 },
      line2: { type: String, default: null, trim: true, maxlength: 200 },
      city: { type: String, default: null, trim: true, maxlength: 80 },
      state: { type: String, enum: [...INDIAN_STATES, null], default: null },
      pincode: { type: String, default: null, match: /^\d{6}$/ },
    },
    bloodGroup: { type: String, enum: [...BLOOD_GROUPS, null], default: null },
    category: { type: String, enum: [...CATEGORIES, null], default: null },
    previousSchool: {
      type: new Schema<IPreviousSchool>(
        {
          name: { type: String, required: true, trim: true, maxlength: 150 },
          lastClass: { type: String, default: null, trim: true, maxlength: 40 },
          tcNumber: { type: String, default: null, trim: true, maxlength: 40 },
          tcDate: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    aadhaarNumber: { type: String, default: null, match: /^\d{12}$/ },
    samagraId: { type: String, default: null, match: /^\d{8,9}$/ },
    apaarId: { type: String, default: null, match: /^\d{12}$/ },
    pen: { type: String, default: null, match: /^\d{11}$/ },
    srNumber: { type: String, default: null, trim: true, maxlength: 30 },
    religion: { type: String, enum: [...RELIGIONS, null], default: null },
    nationality: { type: String, default: null, trim: true, maxlength: 40 },
    emergencyMobile: { type: String, default: null, match: /^[6-9]\d{9}$/ },
    disability: { type: String, enum: [...DISABILITIES, null], default: null },
    medicalNotes: { type: String, default: null, trim: true, maxlength: 300 },
    rteSeat: { type: Boolean, default: false },
    bpl: { type: Boolean, default: false },
    feeConcession: { type: String, default: null, trim: true, maxlength: 80 },
    transportRoute: { type: String, default: null, trim: true, maxlength: 60 },
    transportStop: { type: String, default: null, trim: true, maxlength: 60 },
    // Checked against the school's own fields before it is written (schemas: customIssues); kept as it came.
    custom: { type: Schema.Types.Mixed, default: () => ({}) },
    guardians: { type: [guardianLinkSchema], required: true },
    status: { type: String, enum: STUDENT_STATUSES, required: true, default: "active" },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
studentSchema.plugin(tenantScope);
studentSchema.index({ tenantId: 1, admissionNumber: 1 }, { unique: true, name: "one_admission_number_per_school" });
// The duplicate check (same name, same birthday) and the name search.
studentSchema.index({ tenantId: 1, nameKey: 1, dateOfBirth: 1 });
// One Aadhaar number is one child: a second student with the same number is refused (the screen says whose it is).
studentSchema.index(
  { tenantId: 1, aadhaarNumber: 1 },
  { unique: true, partialFilterExpression: { aadhaarNumber: { $type: "string" } }, name: "one_student_per_aadhaar_number" }
);
// "The children of this guardian" (siblings, the guardian lookup).
studentSchema.index({ tenantId: 1, "guardians.guardianId": 1 });

export const Student = model<IStudent>("Student", studentSchema);
