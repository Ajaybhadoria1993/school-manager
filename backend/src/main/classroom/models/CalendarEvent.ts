import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const CALENDAR_KINDS = ["holiday", "event"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

/**
 * A day or a few days on the school's calendar (docs/parent-teacher-flow.md, phase 1): a **holiday** (no school: attendance is not taken)
 * or an **event** (a function, an activity). Put on it by the people who run the school; read by everyone of the school, teachers and
 * parents too. The days are kept as UTC midnights; `endDate` is the last day (the same as `startDate` for one day).
 */
export interface ICalendarEvent {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  kind: CalendarKind;
  startDate: Date;
  endDate: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const calendarEventSchema = new Schema<ICalendarEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: CALENDAR_KINDS, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    note: { type: String, default: null, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

calendarEventSchema.plugin(tenantScope);
calendarEventSchema.index({ tenantId: 1, startDate: 1 });

export const CalendarEvent = model<ICalendarEvent>("CalendarEvent", calendarEventSchema);
