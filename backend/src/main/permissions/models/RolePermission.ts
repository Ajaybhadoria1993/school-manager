import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * What one kind of person of a school may do (a Receptionist, a Teacher, a Parent...), as the school decided on the Permissions page. A kind
 * with no record here has the usual list (DEFAULT_PERMISSIONS). One record per school and kind. A school with sides (mediums) keeps them
 * on its first side (the school itself): every side follows it.
 */
export interface IRolePermission {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  /** A key of PROFILES: "teacher", "parent", "receptionist", "librarian"... */
  profile: string;
  permissions: string[];
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const rolePermissionSchema = new Schema<IRolePermission>(
  {
    profile: { type: String, required: true },
    permissions: { type: [String], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

rolePermissionSchema.plugin(tenantScope);
rolePermissionSchema.index({ tenantId: 1, profile: 1 }, { unique: true, name: "one_permission_list_per_kind" });

export const RolePermission = model<IRolePermission>("RolePermission", rolePermissionSchema);
