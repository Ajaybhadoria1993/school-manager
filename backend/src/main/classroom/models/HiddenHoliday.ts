import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A standard holiday (data/standardHolidays.ts) that this school took off its calendar: Holi, say, for a school that does not close
 * for it. The holiday itself is the same for every school and is not stored; only the school's "not this one" is. `key` is the
 * holiday's own ("2026-03-04-holi"); `day` is its day (midnight UTC), so a calendar reading some days finds what was taken off in them.
 */
export interface IHiddenHoliday {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  key: string;
  day: Date;
  createdAt: Date;
  updatedAt: Date;
}

const hiddenHolidaySchema = new Schema<IHiddenHoliday>(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    day: { type: Date, required: true },
  },
  { timestamps: true }
);

hiddenHolidaySchema.plugin(tenantScope);
hiddenHolidaySchema.index({ tenantId: 1, key: 1 }, { unique: true });
hiddenHolidaySchema.index({ tenantId: 1, day: 1 });

export const HiddenHoliday = model<IHiddenHoliday>("HiddenHoliday", hiddenHolidaySchema);
