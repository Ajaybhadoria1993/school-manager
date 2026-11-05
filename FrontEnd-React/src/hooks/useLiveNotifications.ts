import { useEffect } from "react";
import { useToast } from "../components/ui/toast-context";
import { classroomApi } from "../redux/api/classroomApi";
import { addLive, notificationsApi, setUnread } from "../redux/api/notificationsApi";
import { parentApi } from "../redux/api/parentApi";
import { useAppDispatch } from "../redux/hooks";
import { connectNotifications } from "../realtime/notificationSocket";
import type { NotificationItem } from "../types";
import { useAuth } from "./useAuth";

/**
 * What a notification makes stale on a page that is open now: that part is read again (only if it is on screen), so the parent sees the
 * leave answered, the homework or the marks without reloading. A page someone is filling in (attendance) is left alone.
 */
function staleBy(n: NotificationItem) {
  const child = n.childId;
  const ofChild = (type: "ChildLeaves" | "ChildAttendance" | "ChildDiary" | "ChildTests") => (child ? [parentApi.util.invalidateTags([{ type, id: child }])] : []);
  switch (n.kind) {
    case "leave.applied":
    case "leave.cancelled":
      return [classroomApi.util.invalidateTags(["Leaves"])];
    case "leave.decided":
      return [classroomApi.util.invalidateTags(["Leaves"]), ...ofChild("ChildLeaves")];
    case "attendance.saved":
      return ofChild("ChildAttendance");
    case "diary.saved":
      return [classroomApi.util.invalidateTags(["Diary"]), ...ofChild("ChildDiary")];
    case "test.added":
    case "test.removed":
    case "marks.saved":
      return [classroomApi.util.invalidateTags(["Tests"]), ...ofChild("ChildTests")];
    case "calendar.added":
    case "calendar.changed":
    case "calendar.removed":
      return [classroomApi.util.invalidateTags(["Calendar"])];
    case "class.assigned":
    case "subject.assigned":
      return [classroomApi.util.invalidateTags(["MyClasses"])];
    default:
      return [];
  }
}

const clip = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The live notifications of the signed-in person (docs/notifications.md), for the app shell: a new one goes on top of the bell with a
 * toast, reading in another tab is heard, and after a break the bell is read once more.
 */
export function useLiveNotifications() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { push } = useToast();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    return connectNotifications({
      onNotification: (n) => {
        dispatch(addLive(n));
        for (const action of staleBy(n)) dispatch(action);
        if (n.body) push("info", clip(n.body), n.title);
        else push("info", n.title);
      },
      onUnread: (unread, readId) => dispatch(setUnread(unread, readId)),
      onReconnect: () => dispatch(notificationsApi.util.invalidateTags(["Notifications"])),
    });
  }, [userId, dispatch, push]);
}
