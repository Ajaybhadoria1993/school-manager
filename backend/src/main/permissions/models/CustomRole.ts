import { Schema, model, Types } from "mongoose";
import { MAX_ROLE_OTHER } from "../../staff/constants";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A role a school made on the Permissions page (2026-11-26, user: "yahan main kuch ka role bhi bana paun aur us mein saare option rahein; har school
 * independent hai, custom role usi school ke liye rahe"): only its name. It is a kind of person of its own (`profile`, "other:sports coach", the same
 * key as a role typed in Add staff > Other), offered in Add staff's Role list, and what it may do is a RolePermission like any kind's. Kept on the
 * school itself (a medium follows it), like RolePermission. Year-free.
 */
export interface ICustomRole {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  /** As the school wrote it, spaces made one: "Sports Coach". */
  name: string;
  /** `namedRoleKey(name)`: "other:sports coach". One per school. */
  profile: string;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const customRoleSchema = new Schema<ICustomRole>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_ROLE_OTHER },
    profile: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

customRoleSchema.plugin(tenantScope);
customRoleSchema.index({ tenantId: 1, profile: 1 }, { unique: true, name: "one_role_per_name" });

export const CustomRole = model<ICustomRole>("CustomRole", customRoleSchema);
