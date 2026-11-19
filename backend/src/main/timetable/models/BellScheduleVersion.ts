import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_SCHEDULE_NAME, SCHEDULE_SCOPES, type ScheduleScope } from "../constants";
import { slotSchema, type IScheduleSlot } from "./BellSchedule";

/**
 * The school's timings as they were before a change (2026-11-17). A timing has no dates of its own, so without this a change (Saturday taken
 * off, school starting an hour later for the winter) would rewrite every day before it: a teacher who did not come on last Saturday would stop
 * being absent. Each save of the timings first remembers what it replaces, once for each day of change: `until` is that day, and the timings
 * below are the ones in force on every day BEFORE it (back to the change before). A day is read with the oldest version whose `until` is after
 * it, or with the timings as they are now when there is none (`scheduleHistory.ts`). Year-free on purpose, like the timings.
 */
export interface IScheduleVersionRow {
  name: string;
  days: number[];
  scope: ScheduleScope;
  classIds: Types.ObjectId[];
  departmentId: Types.ObjectId | null;
  slots: IScheduleSlot[];
}

export interface IBellScheduleVersion {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  /** The day of the change, "2026-11-17" (India): the timings below ran on every day before it. */
  until: string;
  schedules: IScheduleVersionRow[];
  createdAt: Date;
}

const rowSchema = new Schema<IScheduleVersionRow>(
  {
    name: { type: String, required: true, maxlength: MAX_SCHEDULE_NAME },
    days: { type: [Number], required: true },
    scope: { type: String, enum: SCHEDULE_SCOPES, required: true },
    classIds: { type: [{ type: Schema.Types.ObjectId, ref: "SchoolClass" }], default: [] },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    slots: { type: [slotSchema], default: [] },
  },
  { _id: false }
);

const versionSchema = new Schema<IBellScheduleVersion>(
  {
    until: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    schedules: { type: [rowSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
versionSchema.plugin(tenantScope);
versionSchema.index({ tenantId: 1, until: 1, createdAt: 1 });

export const BellScheduleVersion = model<IBellScheduleVersion>("BellScheduleVersion", versionSchema);
