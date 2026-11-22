import { StudentDayAttendance } from "../../components/attendance/StudentDayAttendance";
import { PageBackNav } from "../../components/ui/PageBackNav";

/**
 * Attendance > Student (`/attendance/students`), for the people who run the school: the day of one class, like the "Mark attendance"
 * reference (2026-11-23), looked at and never saved from here. Its own page and its own place in the menu since 2026-11-10 (it was a tab of
 * one Attendance page). The round arrow and the trail, with no big title of its own (the top bar already names the page); the heading is
 * kept for a screen reader. The old register (weeks, months) is `/attendance/students/register`.
 */
export default function StudentAttendancePage() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Student attendance</h1>
      <PageBackNav crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Student attendance" }]} />
      <StudentDayAttendance />
    </div>
  );
}
