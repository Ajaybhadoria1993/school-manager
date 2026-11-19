import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_NAME } from "../constants";

/** Where a charge came from: the class's fee chart, the stop the child boards the bus at, or an optional fee the family chose. */
export const CHARGE_SOURCES = ["chart", "transport", "optional"] as const;
export type ChargeSource = (typeof CHARGE_SOURCES)[number];

/**
 * One instalment a student owes in a session ("Tuition fee, April", "Admission fee"): the student's fee account is the list of these. It is
 * made from the class's fee chart (and the bus stop), so the chart can be raised later without touching what a family has already been billed:
 * `amount` is fixed when the charge is made and only follows the chart while nothing has been paid on it. `concession` is what a concession
 * given to the student takes off; `paid` is what receipts have settled. What is still owed is `amount - concession - paid`.
 */
export interface IFeeCharge {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** What makes it the same charge when fees are made again: the chart line and the month ("<lineId>|2026-04"), "bus|2026-04", ... */
  key: string;
  source: ChargeSource;
  lineId: Types.ObjectId | null;
  headId: Types.ObjectId | null;
  /** Kept as written when the charge was made, so renaming a head later does not rewrite old receipts. */
  headName: string;
  kind: string;
  label: string;
  dueDate: Date;
  amount: number;
  concession: number;
  paid: number;
  createdAt: Date;
  updatedAt: Date;
}

const chargeSchema = new Schema<IFeeCharge>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    key: { type: String, required: true, immutable: true },
    source: { type: String, enum: CHARGE_SOURCES, required: true },
    lineId: { type: Schema.Types.ObjectId, ref: "FeeLine", default: null },
    headId: { type: Schema.Types.ObjectId, ref: "FeeHead", default: null },
    headName: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    kind: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    concession: { type: Number, default: 0, min: 0 },
    paid: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

chargeSchema.plugin(tenantScope);
chargeSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1, key: 1 }, { unique: true, name: "one_charge_per_student_and_key" });
chargeSchema.index({ tenantId: 1, academicYearId: 1, dueDate: 1 });

export const FeeCharge = model<IFeeCharge>("FeeCharge", chargeSchema);
