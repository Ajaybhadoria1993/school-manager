import { Card } from "../../components/ui/Card";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";

/**
 * Attendance > Staff (`/attendance/staff`): coming. It asks the server nothing.
 */
export default function StaffAttendancePage() {
  return (
    <div className="space-y-6">
      <StudentFormHeader title="Staff attendance" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <Card className="px-5 py-12 text-center text-sm font-semibold text-foreground-muted">Staff attendance is coming soon</Card>
    </div>
  );
}
