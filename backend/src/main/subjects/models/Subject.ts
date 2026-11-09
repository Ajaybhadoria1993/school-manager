import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_SUBJECT_CODE, MAX_SUBJECT_NAME, SUBJECT_CATEGORIES, type SubjectCategory } from "../constants";

/**
 * One subject the school teaches ("Mathematics", "Physical Education"). The list is the school's own and lasts across years: which
 * class studies it, how many periods a week and with which teacher is an Allotment of one year. A subject is never deleted (marks
 * and old timetables point to it); it is archived (`isActive: false`) when the school stops teaching it.
 */
export interface ISubject {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  /** Lower-cased, single-spaced name: "maths" and "Maths " are the same subject. */
  nameKey: string;
  /** A short code for a printed timetable ("MAT"); upper case, unique in the school when given. */
  code: string | null;
  category: SubjectCategory;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subjectSchema = new Schema<ISubject>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_SUBJECT_NAME },
    nameKey: { type: String, required: true },
    code: { type: String, default: null, trim: true, uppercase: true, maxlength: MAX_SUBJECT_CODE },
    category: { type: String, enum: SUBJECT_CATEGORIES, required: true, default: "academic" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
subjectSchema.plugin(tenantScope);
subjectSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });
// A code, when given, belongs to one subject of the school.
subjectSchema.index({ tenantId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: "string" } }, name: "one_subject_per_code" });

export const Subject = model<ISubject>("Subject", subjectSchema);
