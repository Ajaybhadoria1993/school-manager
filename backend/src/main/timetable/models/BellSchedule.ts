import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_LABEL, MAX_SCHEDULE_NAME, SCHEDULE_SCOPES, SLOT_KINDS, type ScheduleScope, type SlotKind } from "../constants";

/**
 * One timing of the school's day ("Regular", "Saturday", "Pre-primary"): the days it runs on, the classes it is for, and the rows of
 * its day (periods, a lunch, other breaks) with their times. Which timing a class follows on a day is decided by
 * `resolveSchedule` (scheduleRules.ts). The school's timings last across years (the bell does not change with the session), so this
 * model has no academic year.
 */
export interface IScheduleSlot {
  kind: SlotKind;
  label: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
}

export interface IBellSchedule {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  nameKey: string;
  /** 1 = Monday ... 7 = Sunday. */
  days: number[];
  scope: ScheduleScope;
  /** The classes `scope` speaks of (empty for "all", and for a department's timing, whose classes are the department's at the time). */
  classIds: Types.ObjectId[];
  /**
   * A department's own timing (Pre-Primary keeps other hours): scope "only", followed by every class in the department, whichever
   * those are when it is read (see `loadRules`). Null for a timing of the whole school or of named classes.
   */
  departmentId: Types.ObjectId | null;
  /** The rows of the day. None: a holiday of a department (its classes have no school that day, whatever the school's timing says). */
  slots: IScheduleSlot[];
  createdAt: Date;
  updatedAt: Date;
}

const slotSchema = new Schema<IScheduleSlot>(
  {
    kind: { type: String, enum: SLOT_KINDS, required: true },
    label: { type: String, default: "", trim: true, maxlength: MAX_LABEL },
    start: { type: Number, required: true, min: 0, max: 1439 },
    end: { type: Number, required: true, min: 1, max: 1439 },
  },
  { _id: false }
);

const bellScheduleSchema = new Schema<IBellSchedule>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_SCHEDULE_NAME },
    nameKey: { type: String, required: true },
    days: { type: [Number], required: true },
    scope: { type: String, enum: SCHEDULE_SCOPES, required: true, default: "all" },
    classIds: { type: [{ type: Schema.Types.ObjectId, ref: "SchoolClass" }], default: [] },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    slots: { type: [slotSchema], default: [] },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
bellScheduleSchema.plugin(tenantScope);
bellScheduleSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });

export const BellSchedule = model<IBellSchedule>("BellSchedule", bellScheduleSchema);
