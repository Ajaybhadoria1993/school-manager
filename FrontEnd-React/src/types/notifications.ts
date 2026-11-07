/** What a notification is about (docs/notifications.md); the server's NOTIFICATION_KINDS. */
export type NotificationKind =
  | "leave.applied"
  | "leave.cancelled"
  | "leave.decided"
  | "attendance.saved"
  | "diary.saved"
  | "test.added"
  | "test.removed"
  | "marks.saved"
  | "exam.scheduled"
  | "exam.changed"
  | "exam.removed"
  | "exam.timetable"
  | "exam.paper_changed"
  | "exam.paper_removed"
  | "exam.marks"
  | "teacher.attendance"
  | "calendar.added"
  | "calendar.changed"
  | "calendar.removed"
  | "class.assigned"
  | "subject.assigned";

/** One line of the signed-in person's bell. `link` is the page it opens; `childId` the child it is about (for a parent). */
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  childId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  unread: number;
  hasMore: boolean;
}
