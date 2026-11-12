import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { APPLIES_TO, FEE_FREQUENCIES, MAX_NOTE, type AppliesTo, type FeeFrequency } from "../constants";

/**
 * One line of a class's fee chart in one academic session: this class pays this fee head this much, this often, in these months, and
 * this kind of student (new / existing / every) pays it. The amount is what ONE instalment costs (a monthly fee of 1,200 is 1,200 a
 * month: the year is that times the months). A session's chart is its own: a new session starts from a copy and is changed there.
 */
export interface IFeeLine {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  headId: Types.ObjectId;
  /** Rupees (up to two decimals) for one instalment. */
  amount: number;
  frequency: FeeFrequency;
  /** The calendar months (1 = January) it falls due in; empty for a one-time fee. */
  dueMonths: number[];
  appliesTo: AppliesTo;
  /** The family chooses it (a bus, a uniform, a hostel bed) rather than every student paying it. */
  optional: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const feeLineSchema = new Schema<IFeeLine>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    headId: { type: Schema.Types.ObjectId, ref: "FeeHead", required: true },
    amount: { type: Number, required: true, min: 0 },
    frequency: { type: String, enum: FEE_FREQUENCIES, required: true },
    dueMonths: { type: [Number], default: [] },
    appliesTo: { type: String, enum: APPLIES_TO, required: true, default: "all" },
    optional: { type: Boolean, default: false },
    notes: { type: String, default: null, trim: true, maxlength: MAX_NOTE },
  },
  { timestamps: true }
);

feeLineSchema.plugin(tenantScope);
// One line for a head in a class and session for each kind of student (a school may charge new students more than the rest).
feeLineSchema.index({ tenantId: 1, academicYearId: 1, classId: 1, headId: 1, appliesTo: 1 }, { unique: true, name: "one_fee_line_per_class_head" });
feeLineSchema.index({ tenantId: 1, headId: 1 });

export const FeeLine = model<IFeeLine>("FeeLine", feeLineSchema);
