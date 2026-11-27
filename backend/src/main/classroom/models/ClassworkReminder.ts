import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/** The time a school's teachers are reminded unless it chooses another ("HH:mm", India). */
export const DEFAULT_REMINDER_TIME = "16:00";

/**
 * A school's choice about its daily class work reminder (docs/teaching-progress.md): whether teachers who have not written the diary are
 * reminded, at what time, and the last day the day's reminders were worked out (so they go once a day, whatever restarts).
 */
export interface IClassworkReminder {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  enabled: boolean;
  /** "16:00", India. */
  time: string;
  /** "2026-11-23": the last day the reminders ran; null before the first. */
  lastRunOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const classworkReminderSchema = new Schema<IClassworkReminder>(
  {
    enabled: { type: Boolean, default: true },
    time: { type: String, default: DEFAULT_REMINDER_TIME },
    lastRunOn: { type: String, default: null },
  },
  { timestamps: true }
);
classworkReminderSchema.plugin(tenantScope);
classworkReminderSchema.index({ tenantId: 1 }, { unique: true, name: "one_reminder_choice_per_school" });

export const ClassworkReminder = model<IClassworkReminder>("ClassworkReminder", classworkReminderSchema);
