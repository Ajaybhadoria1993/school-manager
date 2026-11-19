import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { LATE_FINE_MODES, type LateFineMode } from "../constants";

/** The school's fee rules: when a fee is due, what being late costs, and what the school does about a family that owes. */
export interface IFeeRules {
  /** The day of the month an instalment falls due (1 to 28, so every month has it). */
  dueDay: number;
  /** Days after the due day with no fine. */
  graceDays: number;
  lateFine: { mode: LateFineMode; amount: number; maxAmount: number | null };
  /** A family may pay part of an instalment now and the rest later. */
  allowPartial: boolean;
  /** The report card is not given while fees are due. */
  holdReportCard: boolean;
  /** The transfer certificate is not given while fees are due. */
  holdCertificate: boolean;
}

export const DEFAULT_FEE_RULES: IFeeRules = {
  dueDay: 10,
  graceDays: 0,
  lateFine: { mode: "none", amount: 0, maxAmount: null },
  allowPartial: true,
  holdReportCard: false,
  holdCertificate: false,
};

/** One per school, made on the first save; until then the school has the defaults. */
export interface IFeeSettings extends IFeeRules {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const feeSettingsSchema = new Schema<IFeeSettings>(
  {
    dueDay: { type: Number, default: DEFAULT_FEE_RULES.dueDay, min: 1, max: 28 },
    graceDays: { type: Number, default: 0, min: 0, max: 30 },
    lateFine: {
      mode: { type: String, enum: LATE_FINE_MODES, default: "none" },
      amount: { type: Number, default: 0, min: 0 },
      maxAmount: { type: Number, default: null, min: 0 },
    },
    allowPartial: { type: Boolean, default: true },
    holdReportCard: { type: Boolean, default: false },
    holdCertificate: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

feeSettingsSchema.plugin(tenantScope);
feeSettingsSchema.index({ tenantId: 1 }, { unique: true, name: "one_fee_settings_per_school" });

export const FeeSettings = model<IFeeSettings>("FeeSettings", feeSettingsSchema);
