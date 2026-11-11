import { TeacherAttendance } from "../../components/attendance/TeacherAttendance";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";

/**
 * Attendance > Teacher (`/attendance/teachers`), for the people who run the school: who came and at what time (a teacher marks themselves
 * present in the app; one who has not by the time school ends is absent). Its own page since 2026-11-10 (it was a tab of one Attendance page).
 */
export default function TeacherAttendancePage() {
  return (
    <div className="space-y-6">
      <StudentFormHeader title="Teacher attendance" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <TeacherAttendance />
    </div>
  );
}
