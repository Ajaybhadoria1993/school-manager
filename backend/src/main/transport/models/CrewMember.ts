import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { CREW_ROLES, MAX_NAME, MAX_NOTES, type CrewRole } from "../constants";

/**
 * A driver or an attendant of the school's vehicles: who they are, how to reach them, and (for a driver) the licence, which must be kept
 * valid. They do not sign in. Never deleted once they are on a route: they are made inactive when they leave.
 */
export interface ICrewMember {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  role: CrewRole;
  /** 10 digits; one person per number in the school. */
  mobile: string;
  /** Someone to call about them (a family member). */
  emergencyMobile: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  address: string | null;
  joiningDate: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const crewSchema = new Schema<ICrewMember>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    role: { type: String, enum: CREW_ROLES, required: true, default: "driver" },
    mobile: { type: String, required: true },
    emergencyMobile: { type: String, default: null },
    licenseNumber: { type: String, default: null, trim: true, uppercase: true, maxlength: 25 },
    licenseExpiry: { type: String, default: null },
    address: { type: String, default: null, trim: true, maxlength: 200 },
    joiningDate: { type: String, default: null },
    notes: { type: String, default: null, trim: true, maxlength: MAX_NOTES },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

crewSchema.plugin(tenantScope);
crewSchema.index({ tenantId: 1, mobile: 1 }, { unique: true, name: "one_crew_member_per_mobile" });

export const CrewMember = model<ICrewMember>("CrewMember", crewSchema);
