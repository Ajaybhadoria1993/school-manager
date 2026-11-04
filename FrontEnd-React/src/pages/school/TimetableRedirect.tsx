import { Navigate, useLocation, useParams } from "react-router";

/**
 * The old addresses of the timetable (each step was its own page) lead to the one Timetable page, on the right tab and class, so a saved
 * link or a bookmark still works: `/school/timetable/timings`, `/school/timetable/class-subjects?class=&section=` and
 * `/school/timetable/class/:classId/:sectionId`.
 */
export default function TimetableRedirect() {
  const { classId, sectionId } = useParams();
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search);
  const next = new URLSearchParams();
  if (pathname.endsWith("/timings")) next.set("tab", "timings");
  else {
    next.set("tab", "classes");
    const klass = classId ?? query.get("class");
    if (klass) {
      next.set("class", klass);
      next.set("section", sectionId ?? query.get("section") ?? "none");
    }
  }
  return <Navigate to={`/school/timetable?${next.toString()}`} replace />;
}
