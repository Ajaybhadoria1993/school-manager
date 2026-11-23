import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_SPECIAL_TITLE } from "../constants";
import { slotSchema, type IScheduleSlot } from "./BellSchedule";

/**
 * One day of the year with a timing of its own (2026-11-22, user: "kisi date ka time change kar du, aur bata saku jaise PTM hai to kis kis class
 * ka hai"): a half day, a PTM, the annual day. It is for the whole school (`classIds` empty) or for some classes, and holds the rows of that day
 * (`slots`, the same rows as a timing) or none at all: no classes that day for them. On that date it is followed instead of the usual timing
 * (the teachers' attendance reads its hours, the arrangement page its periods). Two special days of one date never share a class.
 */
export interface ISpecialDay {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  /** "2026-11-28": the (first) day, the calendar day in India. */
  date: string;
  /** The last day, for days in a row (2026-11-23: "3 se 6 tak"); the first day for a single one. Missing on one saved before: one day. */
  endDate?: string;
  /** What the day is: "PTM", "Annual day", "Half day". */
  title: string;
  /** The classes it is for; empty for the whole school. */
  classIds: Types.ObjectId[];
  /** The rows of the day; empty: no classes that day for these classes. */
  slots: IScheduleSlot[];
  createdAt: Date;
  updatedAt: Date;
}

const specialDaySchema = new Schema<ISpecialDay>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    title: { type: String, required: true, trim: true, maxlength: MAX_SPECIAL_TITLE },
    classIds: { type: [{ type: Schema.Types.ObjectId, ref: "SchoolClass" }], default: [] },
    slots: { type: [slotSchema], default: [] },
  },
  { timestamps: true }
);

specialDaySchema.plugin(tenantScope);
specialDaySchema.index({ tenantId: 1, date: 1 });

export const SpecialDay = model<ISpecialDay>("SpecialDay", specialDaySchema);
