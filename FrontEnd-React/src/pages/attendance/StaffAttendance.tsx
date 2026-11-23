import { StaffAttendance } from "../../components/attendance/StaffAttendance";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";

/**
 * Attendance > Staff (`/attendance/staff`, built 2026-11-22; it was "coming soon"), for the people who run the school: who of the staff came and
 * at what time, by department, with a search. To look at only: a staff member marks themselves present with their own login, on their home.
 */
export default function StaffAttendancePage() {
  return (
    <div className="space-y-6">
      <StudentFormHeader title="Staff attendance" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <StaffAttendance />
    </div>
  );
}
