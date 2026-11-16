import { StudentAttendance } from "../../components/attendance/StudentAttendance";
import { PageBackNav } from "../../components/ui/PageBackNav";

/**
 * Attendance > Student (`/attendance/students`), for the people who run the school: any class's children for any days (this week to start
 * with), with the reason of an absence. Its own page and its own place in the menu since 2026-11-10 (it was a tab of one Attendance page).
 * Since 2026-11-16 it starts like the reference picture: the round arrow and the trail, with no big title of its own (the top bar already
 * names the page); the heading is kept for a screen reader.
 */
export default function StudentAttendancePage() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Student attendance</h1>
      <PageBackNav crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Student attendance" }]} />
      <StudentAttendance />
    </div>
  );
}
