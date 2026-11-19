import { Navigate, useLocation, useParams } from "react-router";

/**
 * The old addresses of the timetable (each step was its own page) lead to the page they belong to now, so a saved link or a bookmark still
 * works: `/school/timetable/timings` goes to School timings (`/school/timings`), `/school/timetable/class-subjects?class=&section=` and
 * `/school/timetable/class/:classId/:sectionId` go to Class timetables (`/school/timetable?class=&section=`).
 */
export default function TimetableRedirect() {
  const { classId, sectionId } = useParams();
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search);
  if (pathname.endsWith("/timings")) return <Navigate to="/school/timings" replace />;
  const next = new URLSearchParams();
  const klass = classId ?? query.get("class");
  if (klass) {
    next.set("class", klass);
    next.set("section", sectionId ?? query.get("section") ?? "none");
  }
  return <Navigate to={next.size > 0 ? `/school/timetable?${next.toString()}` : "/school/timetable"} replace />;
}
