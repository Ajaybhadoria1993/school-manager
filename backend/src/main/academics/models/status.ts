import { Schema, Types } from "mongoose";

/**
 * What a class or a department can be. They are never deleted: a class holds students and their history, so a school that made one
 * by mistake, or no longer teaches it, makes it `inactive` and can make it `active` again. The same idea as an inactive student.
 */
export const ACTIVE_STATUSES = ["active", "inactive"] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

/** Who made it inactive, and when. The name and role are as they were then. */
export interface InactiveRecord {
  at: Date;
  by: { userId: Types.ObjectId; name: string; role: string };
}

export const inactiveRecordSchema = new Schema<InactiveRecord>(
  {
    at: { type: Date, required: true },
    by: {
      userId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
    },
  },
  { _id: false }
);

/**
 * The filter that leaves inactive ones out. It is `$ne`, not `status: "active"`, because a record made before there was a status has none
 * and is active.
 */
export const NOT_INACTIVE = { status: { $ne: "inactive" as const } };

export const isInactive = (record: { status?: ActiveStatus | null }): boolean => record.status === "inactive";
