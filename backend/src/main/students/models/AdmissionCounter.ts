import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * The running number behind admission numbers, one per school per academic year ("ADM-2026-0001", "ADM-2026-0002"...). It is
 * moved on with one atomic `$inc`, so five admissions at the same moment get five different, consecutive numbers. A number that
 * was handed out is never given again, even if that admission failed afterwards (a gap is harmless, a reused number is not).
 */
export interface IAdmissionCounter {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  /** The last number handed out. */
  seq: number;
}

const admissionCounterSchema = new Schema<IAdmissionCounter>({
  academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
  seq: { type: Number, required: true, default: 0 },
});

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
admissionCounterSchema.plugin(tenantScope);
admissionCounterSchema.index({ tenantId: 1, academicYearId: 1 }, { unique: true, name: "one_counter_per_school_and_year" });

export const AdmissionCounter = model<IAdmissionCounter>("AdmissionCounter", admissionCounterSchema);
