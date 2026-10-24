import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * One class of the school ("Nursery", "Class 5"). Named SchoolClass because `class` is a keyword.
 * A class is not tied to a session: Class 5 exists every year, the students in it change.
 */
export interface ISchoolClass {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  /** The wing it belongs to. Optional: a small school may not use departments at all. */
  departmentId: Types.ObjectId | null;
  name: string;
  /** Lower-cased, trimmed name: "class 5" and "Class  5" are the same class. */
  nameKey: string;
  /** Teaching order, lowest first. Kept 1..n by the class service when a standard class is added in its place; ties are fine. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const schoolClassSchema = new Schema<ISchoolClass>(
  {
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    nameKey: { type: String, required: true },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
schoolClassSchema.plugin(tenantScope);
schoolClassSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });
schoolClassSchema.index({ tenantId: 1, order: 1 });
schoolClassSchema.index({ tenantId: 1, departmentId: 1 });

export const SchoolClass = model<ISchoolClass>("SchoolClass", schoolClassSchema);
