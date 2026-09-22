import { Schema, model, Types } from "mongoose";

export type SubscriptionTier = "basic" | "standard" | "premium";

export interface ITenant {
  _id: Types.ObjectId;
  name: string; // Trust / School group name
  slug: string;
  subscriptionTier: SubscriptionTier;
  isActive: boolean;
  modules: {
    academics: boolean;
    fees: boolean;
    attendance: boolean;
    communication: boolean;
    certificates: boolean;
    transport: boolean;
  };
  contactEmail: string;
  contactPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    subscriptionTier: {
      type: String,
      enum: ["basic", "standard", "premium"],
      default: "basic",
    },
    isActive: { type: Boolean, default: true },
    modules: {
      academics: { type: Boolean, default: true },
      fees: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      communication: { type: Boolean, default: true },
      certificates: { type: Boolean, default: true },
      transport: { type: Boolean, default: false },
    },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
  },
  { timestamps: true }
);

export const Tenant = model<ITenant>("Tenant", tenantSchema);
