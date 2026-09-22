import { Schema, model, Types } from "mongoose";

export type BoardAffiliation = "CBSE" | "ICSE" | "State Board" | "IB" | "Other";

export interface IBranch {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  code: string; // unique campus code within tenant
  board: BoardAffiliation;
  udisePlusCode?: string;
  registrationNumber?: string;
  address: {
    line1: string;
    city: string;
    state: string;
    pincode: string;
  };
  logoUrl?: string;
  letterheadUrl?: string;
  policies: {
    // S-6.4: withhold report cards from parents while fees are outstanding.
    holdReportCardForDues: boolean;
    // S-8.1: block Transfer Certificate issuance while fees are outstanding.
    holdTCForDues: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const branchSchema = new Schema<IBranch>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    board: {
      type: String,
      enum: ["CBSE", "ICSE", "State Board", "IB", "Other"],
      required: true,
    },
    udisePlusCode: { type: String },
    registrationNumber: { type: String },
    address: {
      line1: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },
    logoUrl: { type: String },
    letterheadUrl: { type: String },
    policies: {
      holdReportCardForDues: { type: Boolean, default: false },
      holdTCForDues: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const Branch = model<IBranch>("Branch", branchSchema);
