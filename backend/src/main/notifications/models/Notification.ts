import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const NOTIFICATION_KINDS = [
  "leave.applied",
  "leave.cancelled",
  "leave.decided",
  "attendance.saved",
  "diary.saved",
  "test.added",
  "test.removed",
  "marks.saved",
  "exam.scheduled",
  "exam.changed",
  "exam.removed",
  "exam.timetable",
  "exam.paper_changed",
  "exam.paper_removed",
  "exam.marks",
  "teacher.attendance",
  "calendar.added",
  "calendar.changed",
  "calendar.removed",
  "class.assigned",
  "subject.assigned",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** How long a notification is kept: the bell is for what is new, the pages keep the records. */
export const NOTIFICATION_DAYS = 90;

/**
 * One line in one person's bell (docs/notifications.md): what happened, in words made for that person ("Leave approved: Asha Verma" for
 * the parent, "Meena Singh approved Asha Verma's leave" for the school), and the page it opens. Made once per person, so each one is read
 * on its own; `childId` is the child it is about, for a parent. Gone after NOTIFICATION_DAYS days.
 */
export interface INotification {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  childId: Types.ObjectId | null;
  readAt: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: null, maxlength: 500 },
    link: { type: String, default: null, maxlength: 300 },
    childId: { type: Schema.Types.ObjectId, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.plugin(tenantScope);
// The bell: a person's newest first, page by page (by _id, which grows with time).
notificationSchema.index({ tenantId: 1, userId: 1, _id: -1 });
// The unread count.
notificationSchema.index({ tenantId: 1, userId: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_DAYS * 24 * 60 * 60, name: "expire_old" });

export const Notification = model<INotification>("Notification", notificationSchema);
