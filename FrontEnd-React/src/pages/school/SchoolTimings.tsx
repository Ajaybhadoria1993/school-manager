import { Navigate, useNavigate } from "react-router";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { SchoolTimings } from "../../components/timetable/SchoolTimings";

/**
 * Manage school > School timings (`/school/timings`): the school's usual day (when it starts, how long a period is, the lunch) and what
 * each day of the week does. Its own page and its own menu entry since 2026-11-09 (it was a tab of the Timetable page). It asks only for
 * the timings and the departments, not for the class list. A year that is over is only looked at: the timings are the school's as it is
 * now, so that goes to the class timetables of that year.
 */
export default function SchoolTimingsPage() {
  const navigate = useNavigate();
  const readOnly = useReadOnlyYear();
  if (readOnly) return <Navigate to="/school/timetable" replace />;

  return (
    <div className="space-y-5">
      <StudentFormHeader title="School timings" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <SchoolTimings onNext={() => navigate("/school/timetable")} />
    </div>
  );
}
