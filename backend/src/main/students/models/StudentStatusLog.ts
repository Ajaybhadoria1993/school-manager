import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const STATUS_ACTIONS = ["deactivated", "reactivated"] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

/**
 * One line of the school's record of who made a student inactive or active again, when, and why. It is written once and never changed
 * or deleted, and it keeps what identifies the student (name, admission number, class), so it reads on its own. `studentId` is a plain id.
 */
export interface IStudentStatusLog {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  action: StatusAction;
  studentId: Types.ObjectId;
  name: string;
  admissionNumber: string;
  className: string | null;
  sectionName: string | null;
  /** Why the student was made inactive (left, transferred...), when the person said. */
  reason: string | null;
  /** Who did it: the person's name and role as they were then (a role may change, or be added, later). */
  by: { userId: Types.ObjectId; name: string; role: string };
  createdAt: Date;
}

const schema = new Schema<IStudentStatusLog>(
  {
    action: { type: String, enum: STATUS_ACTIONS, required: true },
    studentId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    admissionNumber: { type: String, required: true },
    className: { type: String, default: null },
    sectionName: { type: String, default: null },
    reason: { type: String, default: null },
    by: {
      userId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
schema.plugin(tenantScope);
// "What happened to this student" and "what happened lately".
schema.index({ tenantId: 1, studentId: 1, createdAt: 1 });
schema.index({ tenantId: 1, createdAt: -1 });

export const StudentStatusLog = model<IStudentStatusLog>("StudentStatusLog", schema);
