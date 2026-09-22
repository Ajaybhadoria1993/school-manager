import { Schema, model, Types } from "mongoose";

export interface IGuardian {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  relation: string; // Father / Mother / Legal Guardian
  phone: string;
  email?: string;
  occupation?: string;
  studentIds: Types.ObjectId[]; // linked children (sibling switching)
  userId?: Types.ObjectId; // linked login account
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const guardianSchema = new Schema<IGuardian>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    relation: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    occupation: { type: String },
    studentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    isPrimary: { type: Boolean, default: true },
  },
  { timestamps: true }
);

guardianSchema.index({ tenantId: 1, phone: 1 });

export const Guardian = model<IGuardian>("Guardian", guardianSchema);
