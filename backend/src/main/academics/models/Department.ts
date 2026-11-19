import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { ACTIVE_STATUSES, inactiveRecordSchema, type ActiveStatus, type InactiveRecord } from "./status";

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
  /** Never deleted, like a class: a school makes it inactive (only when it has no active class) and can make it active again. */
  status?: ActiveStatus;
  /** Set while the department is inactive: when and by whom. Null otherwise. */
  inactive?: InactiveRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameKey: { type: String, required: true },
    status: { type: String, enum: ACTIVE_STATUSES, default: "active" },
    inactive: { type: inactiveRecordSchema, default: null },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
departmentSchema.plugin(tenantScope);
departmentSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });

export const Department = model<IDepartment>("Department", departmentSchema);
