import { useEffect } from "react";
import { useToast } from "../components/ui/toast-context";
import { classroomApi } from "../redux/api/classroomApi";
import { attendanceApi } from "../redux/api/attendanceApi";
import { examsApi } from "../redux/api/examsApi";
import { addLive, notificationsApi, setUnread } from "../redux/api/notificationsApi";
import { parentApi } from "../redux/api/parentApi";
import { timetableApi } from "../redux/api/timetableApi";
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
  const ofChild = (type: "ChildLeaves" | "ChildAttendance" | "ChildDiary" | "ChildTests" | "ChildExams") => (child ? [parentApi.util.invalidateTags([{ type, id: child }])] : []);
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
    case "exam.scheduled":
    case "exam.changed":
    case "exam.removed":
    case "exam.timetable":
    case "exam.paper_changed":
    case "exam.paper_removed":
    case "exam.marks":
      // The school's exam list and page, a class's exams and marks sheets (a teacher's tab), and the child's exams (a parent's page) that is on screen.
      return [examsApi.util.invalidateTags(["Exams", "Exam", "ClassExams", "MarksSheet"]), ...(child ? ofChild("ChildExams") : [parentApi.util.invalidateTags(["ChildExams"])])];
    case "teacher.attendance":
      // The school marked or corrected the teacher's day: their own card reads again.
      return [attendanceApi.util.invalidateTags(["MyAttendance"])];
    case "calendar.added":
    case "calendar.changed":
    case "calendar.removed":
      return [classroomApi.util.invalidateTags(["Calendar"])];
    case "class.assigned":
    case "subject.assigned":
      return [classroomApi.util.invalidateTags(["MyClasses"])];
    case "staff_leave.applied":
    case "staff_leave.cancelled":
      // An application came or was taken back: the school's list (the Leave requests tab) reads again, and so does the arrangement (a leave days ahead).
      return [attendanceApi.util.invalidateTags(["StaffLeaves"]), timetableApi.util.invalidateTags(["Arrangement"])];
    case "staff_leave.decided":
      // The school answered: the person's own list and day read again.
      return [attendanceApi.util.invalidateTags(["MyLeaves", "MyAttendance", "MyStaffAttendance"])];
    case "timetable.substitute":
      // A teacher was put in (or taken off) for a lesson, or given a class's attendance for the day: the arrangement page and the teacher's classes read again when open.
      return [timetableApi.util.invalidateTags(["Arrangement"]), classroomApi.util.invalidateTags(["MyClasses"])];
    case "timetable.special_day":
      // A special day was set, changed or taken off: the School timings page reads its list again (when it is open).
      return [timetableApi.util.invalidateTags(["SpecialDays"])];
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
      // A teacher marked themselves present: the school's sheet of the teachers (if it is open) reads again.
      // (A teacher who checked in may have had a substitute taken off: the arrangement page reads again too.)
      onTeacherAttendance: () => {
        dispatch(attendanceApi.util.invalidateTags(["TeacherAttendance"]));
        dispatch(timetableApi.util.invalidateTags(["Arrangement"]));
      },
      onStaffAttendance: () => dispatch(attendanceApi.util.invalidateTags(["StaffAttendance"])),
    });
  }, [userId, dispatch, push]);
}
