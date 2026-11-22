import { StudentAttendance } from "../../components/attendance/StudentAttendance";
import { PageBackNav } from "../../components/ui/PageBackNav";

/**
 * Attendance > Student > Register (`/attendance/students/register`): the school's old register, any class's children for any days (this week
 * to start with), with the reason of an absence. Since 2026-11-23 it is one click from Attendance > Student (the day of one class, like the
 * reference), which took its address. The round arrow leads back there; the heading is kept for a screen reader.
 */
export default function StudentRegisterPage() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Student attendance register</h1>
      <PageBackNav crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Student attendance", to: "/attendance/students" }, { label: "Register" }]} />
      <StudentAttendance />
    </div>
  );
}
