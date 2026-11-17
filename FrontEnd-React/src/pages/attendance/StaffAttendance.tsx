import { useSearchParams } from "react-router";
import { Card } from "../../components/ui/Card";
import { DateRangeControl } from "../../components/ui/DateRangeControl";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { useYearView } from "../../hooks/useYearView";
import { todayStartRange } from "../../utils/attendance";
import { todayInIndia } from "../../utils/students";

/**
 * Attendance > Staff (`/attendance/staff`): coming. It asks the server nothing. The date filter of the whole app is already here (an arrow, a
 * box, an arrow, and the window "Select date range"), like the Teacher page's and kept in the address the same way, so it is ready when the
 * sheet comes (2026-11-17). It opens on today.
 */
export default function StaffAttendancePage() {
  const [params, setParams] = useSearchParams();
  const { viewing } = useYearView();
  const start = todayStartRange(todayInIndia(), viewing);
  const range = { from: params.get("from") ?? start.from, to: params.get("to") ?? start.to };

  function change(next: { from: string; to: string }) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("from", next.from);
        out.set("to", next.to);
        return out;
      },
      { replace: true }
    );
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Staff attendance" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <DateRangeControl range={range} noFuture onChange={change} />
      <Card className="px-5 py-12 text-center text-sm font-semibold text-foreground-muted">Staff attendance is coming soon</Card>
    </div>
  );
}
