import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../plugins/tenantScope";

/**
 * A school's logo, one per school. Kept apart from the school's own record, which is read on nearly every request, so the picture is only
 * loaded when it is asked for. Only pictures that were checked by their first bytes are stored (see LogoService).
 */
export interface ISchoolLogo {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  data: Buffer;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
}

const schoolLogoSchema = new Schema<ISchoolLogo>(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
schoolLogoSchema.plugin(tenantScope);
schoolLogoSchema.index({ tenantId: 1 }, { unique: true, name: "one_logo_per_school" });

export const SchoolLogo = model<ISchoolLogo>("SchoolLogo", schoolLogoSchema);
