import { Navigate, useNavigate, useSearchParams } from "react-router";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ClassTimetables } from "../../components/timetable/ClassTimetables";

/**
 * Manage school > Class timetables (`/school/timetable`): every class on the left, the one picked on the right with its subjects and its
 * week. Its own page and its own menu entry since 2026-11-09 (it was a tab of one Timetable page, beside School timings, which is now
 * `/school/timings`). The class is kept in the address (`?class=&section=`). A school with no timing yet is told to set it first, with a
 * button to School timings. The old address `?tab=timings` leads to School timings. The school's subjects and one teacher's week are
 * still under `/school/timetable/...`, so they light this entry too.
 */
export default function ClassTimetablesPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  if (params.get("tab") === "timings") return <Navigate to="/school/timings" replace />;

  return (
    <div className="space-y-5">
      <StudentFormHeader title="Class timetables" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <ClassTimetables onGoTimings={() => navigate("/school/timings")} />
    </div>
  );
}
