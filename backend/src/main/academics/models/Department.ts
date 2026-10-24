import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A wing of the school that groups classes: Pre-Primary, Primary, Middle... Only a label for now; the
 * classes point to it. Every query filters by `tenantId`, which always comes from the signed-in user.
 */
export interface IDepartment {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  /** Lower-cased, trimmed name: "primary" and "Primary " are the same department. */
  nameKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameKey: { type: String, required: true },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
departmentSchema.plugin(tenantScope);
departmentSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });

export const Department = model<IDepartment>("Department", departmentSchema);
