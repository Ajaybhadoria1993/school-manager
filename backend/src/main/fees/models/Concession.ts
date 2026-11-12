import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { CONCESSION_BASES, CONCESSION_MODES, MAX_NAME, MAX_NOTE, type ConcessionBasis, type ConcessionMode } from "../constants";

/**
 * A concession the school gives ("Sibling 10% on tuition", "Staff child 50%", "RTE seat: free"): a percentage or a flat amount off the
 * fees it names (every fee, or the heads listed). The school's own list, the same every session. Giving it to a student comes with
 * collecting fees; this is the rule of the school.
 */
export interface IConcession {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  nameKey: string;
  basis: ConcessionBasis;
  mode: ConcessionMode;
  /** A percent (0 to 100) or rupees, as `mode` says. */
  value: number;
  appliesTo: "all" | "selected";
  /** The fee heads it takes off when `appliesTo` is "selected". */
  headIds: Types.ObjectId[];
  /** The principal or the school admin must agree before it is given to a student. */
  needsApproval: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const concessionSchema = new Schema<IConcession>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    nameKey: { type: String, required: true },
    basis: { type: String, enum: CONCESSION_BASES, required: true },
    mode: { type: String, enum: CONCESSION_MODES, required: true },
    value: { type: Number, required: true, min: 0 },
    appliesTo: { type: String, enum: ["all", "selected"], default: "all" },
    headIds: { type: [Schema.Types.ObjectId], default: [] },
    needsApproval: { type: Boolean, default: true },
    notes: { type: String, default: null, trim: true, maxlength: MAX_NOTE },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

concessionSchema.plugin(tenantScope);
concessionSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true, name: "one_concession_per_name" });

export const Concession = model<IConcession>("Concession", concessionSchema);
