import { StudentAttendance } from "../../components/attendance/StudentAttendance";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";

/**
 * Attendance > Student (`/attendance/students`), for the people who run the school: any class's children for any days (this month to start
 * with), with the reason of an absence. Its own page and its own place in the menu since 2026-11-10 (it was a tab of one Attendance page).
 */
export default function StudentAttendancePage() {
  return (
    <div className="space-y-6">
      <StudentFormHeader title="Student attendance" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <StudentAttendance />
    </div>
  );
}
