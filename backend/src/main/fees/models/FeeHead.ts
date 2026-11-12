import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { APPLIES_TO, FEE_FREQUENCIES, FEE_KINDS, MAX_NAME, MAX_NOTE, type AppliesTo, type FeeFrequency, type FeeKind } from "../constants";

/**
 * One kind of fee the school charges ("Tuition fee", "Admission fee", "Exam fee", "Uniform"). The school's own list, the same every
 * session: what each class pays of it in a session is a FeeLine. The `default*` boxes only fill the Add fee form in; a line keeps its own.
 */
export interface IFeeHead {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  /** Lower-cased, trimmed name: two heads of one school cannot have the same name. */
  nameKey: string;
  kind: FeeKind;
  /** Given back when the child leaves (caution money). */
  refundable: boolean;
  defaultFrequency: FeeFrequency;
  defaultAppliesTo: AppliesTo;
  defaultOptional: boolean;
  notes: string | null;
  /** Off = no longer used for new lines; the lines it has stay. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const feeHeadSchema = new Schema<IFeeHead>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    nameKey: { type: String, required: true },
    kind: { type: String, enum: FEE_KINDS, required: true },
    refundable: { type: Boolean, default: false },
    defaultFrequency: { type: String, enum: FEE_FREQUENCIES, default: "yearly" },
    defaultAppliesTo: { type: String, enum: APPLIES_TO, default: "all" },
    defaultOptional: { type: Boolean, default: false },
    notes: { type: String, default: null, trim: true, maxlength: MAX_NOTE },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

feeHeadSchema.plugin(tenantScope);
feeHeadSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true, name: "one_fee_head_per_name" });

export const FeeHead = model<IFeeHead>("FeeHead", feeHeadSchema);
